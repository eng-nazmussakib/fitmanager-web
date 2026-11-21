import type { Branch } from '@core/models/branch.model';
import type { CartLine, PosCustomer, PosLine, PosQuote, PosSale } from '@core/models/business.model';
import type { Invoice, PaymentRecord } from '@core/models/payment.model';
import type { PaymentMethod } from '@core/models/subscription.model';

import { daysBetween } from './domain/access-rules';
import { averageCost, posQuote, returnAmount } from './domain/pos-pricing';
import { fail } from './http';
import { addDaysIso } from './seed/clock';
import { toRef } from './seed/organisation.seed';
import type { Mutation } from './store';
import type { MemberRow, MockDb, MovementRow, PoRow, PosReturnRow, ProductRow, StockRow, TransferRow } from './types';

/**
 * Phase 6 in demo mode (D-098 to D-102): the API's stock, order, transfer and POS steps (fitmanager-api
 * src/features/stock, pos) on the mock's tables. Each step takes the state to read and an `emit` for its changes:
 * the handlers pass `commit` (so a change is logged and replayed), the seed applies them straight away, so both
 * build the same rows. The arithmetic is the API's: `moveStock`, the weighted average cost, `posQuote`, `returnAmount`.
 */

export type Emit = (m: Mutation) => void;
/** Who does it, and where. */
export interface Actor {
    branch_oid: string;
    name: string;
}
export interface When {
    date: string;
    iso: string;
}

/** The desk takes returns for this many days; a manager after (D-102, the refund window of plans). */
export const REFUND_WINDOW_DAYS = 3;
export const WALK_IN = { code: 'WALK-IN', name: 'Walk-in customer' };

export const stockKey = (branchOid: string, productOid: string): string => `${branchOid}:${productOid}`;
export const taka = (n: number): string => `৳${Math.round(n).toLocaleString('en-US')}`;

export function product(d: MockDb, oid: string): ProductRow {
    return d.products.find(p => p.oid === oid) ?? fail(400, 'A product is not in the catalogue');
}

/** The product's own VAT rate, or the HQ rate (D-057, D-099). */
export const vatOf = (d: MockDb, p: ProductRow): number => p.vat_rate ?? d.settings.vat_rate;

export function stockRow(d: MockDb, branchOid: string, productOid: string): StockRow {
    const key = stockKey(branchOid, productOid);
    const p = product(d, productOid);
    return (
        d.stock.find(s => s.oid === key) ?? {
            oid: key,
            branch_oid: branchOid,
            product_oid: productOid,
            on_hand: 0,
            avg_cost: 0,
            reorder_level: p.reorder_level
        }
    );
}

/** The next code after the highest one with this prefix: `PO-GUL-2026-` → `PO-GUL-2026-0004`. Replays give the same. */
export function nextCode(codes: readonly string[], prefix: string, width: number): string {
    const n = codes.filter(c => c.startsWith(prefix)).reduce((max, c) => Math.max(max, Number(c.slice(prefix.length)) || 0), 0);
    return `${prefix}${String(n + 1).padStart(width, '0')}`;
}

export interface Move {
    product_oid: string;
    kind: MovementRow['kind'];
    qty: number;
    unit_cost?: number;
    reason?: MovementRow['reason'];
    note?: string | null;
    ref_oid?: string | null;
    ref_label?: string | null;
}

/** The API's moveStock(): refuses to go below zero; units coming in move the weighted average cost. */
export function moveStock(d: MockDb, emit: Emit, a: Actor, at: string, m: Move): { on_hand: number; avg_cost: number; unit_cost: number } {
    const s = stockRow(d, a.branch_oid, m.product_oid);
    const onHand = s.on_hand + m.qty;
    if (onHand < 0) {
        const name = product(d, m.product_oid).name;
        fail(409, s.on_hand === 0 ? `${name} is out of stock.` : `Only ${s.on_hand} of ${name} in stock.`);
    }
    const unitCost = m.qty > 0 && m.unit_cost !== undefined ? m.unit_cost : s.avg_cost;
    const avg = m.qty > 0 ? averageCost(s.on_hand, s.avg_cost, m.qty, unitCost) : s.avg_cost;
    emit({ t: 'put', table: 'stock', row: { ...s, on_hand: onHand, avg_cost: avg } satisfies StockRow });
    const seq = d.movements.length + 1;
    emit({
        t: 'put',
        table: 'movements',
        row: {
            oid: `mv-${a.branch_oid}-${seq}`,
            seq,
            branch_oid: a.branch_oid,
            product_oid: m.product_oid,
            kind: m.kind,
            qty: m.qty,
            unit_cost: unitCost,
            on_hand_after: onHand,
            avg_cost_after: avg,
            reason: m.reason ?? null,
            note: m.note ?? null,
            ref_oid: m.ref_oid ?? null,
            ref_label: m.ref_label ?? null,
            by_name: a.name,
            at
        } satisfies MovementRow
    });
    return { on_hand: onHand, avg_cost: avg, unit_cost: unitCost };
}

/* ---------- purchase orders (D-100) ---------- */

export function raisePo(
    d: MockDb,
    emit: Emit,
    a: Actor,
    when: When,
    input: { supplier_oid: string; note?: string | null; lines: { product_oid: string; qty: number; unit_cost: number }[] },
    oid: string
): PoRow {
    const supplier = d.suppliers.find(s => s.oid === input.supplier_oid && s.active) ?? fail(400, 'Choose a supplier');
    const branch = d.branches.find(b => b.oid === a.branch_oid)!;
    const year = when.date.slice(0, 4);
    const row: PoRow = {
        oid,
        branch_oid: a.branch_oid,
        code: nextCode(
            d.purchaseOrders.map(o => o.code),
            `PO-${branch.code}-${year}-`,
            4
        ),
        supplier_oid: supplier.oid,
        supplier_name: supplier.name,
        status: 'pending',
        note: input.note ?? null,
        raised_by_name: a.name,
        raised_at: when.iso,
        decided_by_name: null,
        decided_at: null,
        decision_note: null,
        sent_at: null,
        closed_at: null,
        cancel_reason: null,
        lines: input.lines.map((l, i) => {
            const p = product(d, l.product_oid);
            if (!p.active) fail(400, 'A product is not in the catalogue');
            return { oid: `${oid}-l${i + 1}`, product_oid: p.oid, code: p.code, name: p.name, qty: l.qty, unit_cost: l.unit_cost, received: 0 };
        }),
        deliveries: []
    };
    emit({ t: 'put', table: 'purchaseOrders', row });
    return row;
}

export function receivePo(
    d: MockDb,
    emit: Emit,
    a: Actor,
    when: When,
    po: PoRow,
    input: { received_on?: string; note?: string | null; lines: { line_oid: string; qty: number; unit_cost?: number }[] },
    oid: string
): PoRow {
    const got: PoRow['deliveries'][number]['lines'] = [];
    const lines = po.lines.map(l => ({ ...l }));
    for (const x of input.lines) {
        const l = lines.find(y => y.oid === x.line_oid) ?? fail(400, 'A line is not on this order');
        if (x.qty === 0) continue;
        if (x.qty > l.qty - l.received) fail(400, `Only ${l.qty - l.received} of ${l.name} are still to come.`);
        const cost = x.unit_cost ?? l.unit_cost;
        moveStock(d, emit, a, when.iso, { product_oid: l.product_oid, kind: 'received', qty: x.qty, unit_cost: cost, ref_oid: oid, ref_label: po.code });
        l.received += x.qty;
        got.push({ line_oid: l.oid, product_oid: l.product_oid, qty: x.qty, unit_cost: cost });
    }
    if (!got.length) fail(400, 'Enter what came in.');
    const done = lines.every(l => l.received === l.qty);
    const row: PoRow = {
        ...po,
        lines,
        status: done ? 'received' : 'partial',
        sent_at: po.sent_at ?? when.iso,
        closed_at: done ? when.iso : null,
        deliveries: [
            ...po.deliveries,
            { oid, received_on: input.received_on ?? when.date, note: input.note ?? null, by_name: a.name, at: when.iso, lines: got }
        ]
    };
    emit({ t: 'put', table: 'purchaseOrders', row });
    return row;
}

/* ---------- transfers (D-101) ---------- */

export function requestTransfer(
    d: MockDb,
    emit: Emit,
    a: Actor,
    when: When,
    input: { from_branch_oid: string; note?: string | null; lines: { product_oid: string; qty: number }[] },
    oid: string
): TransferRow {
    if (input.from_branch_oid === a.branch_oid) fail(400, 'Ask another branch');
    const from = d.branches.find(b => b.oid === input.from_branch_oid && b.kind === 'BRANCH') ?? fail(400, 'Choose a branch');
    const branch = d.branches.find(b => b.oid === a.branch_oid)!;
    const row: TransferRow = {
        oid,
        code: nextCode(
            d.transfers.map(t => t.code),
            `TRF-${branch.code}-${when.date.slice(0, 4)}-`,
            4
        ),
        from_branch_oid: from.oid,
        to_branch_oid: a.branch_oid,
        status: 'requested',
        note: input.note ?? null,
        requested_by_name: a.name,
        requested_at: when.iso,
        sent_by_name: null,
        sent_at: null,
        received_by_name: null,
        received_at: null,
        closing_note: null,
        closed_at: null,
        lines: input.lines.map((l, i) => {
            const p = product(d, l.product_oid);
            if (!p.active) fail(400, 'A product is not in the catalogue');
            return {
                oid: `${oid}-l${i + 1}`,
                product_oid: p.oid,
                code: p.code,
                name: p.name,
                qty_requested: l.qty,
                qty_sent: null,
                qty_received: null,
                unit_cost: null
            };
        })
    };
    emit({ t: 'put', table: 'transfers', row });
    return row;
}

/** The sending branch sends what it can of each line, at its average cost. */
export function sendTransfer(d: MockDb, emit: Emit, a: Actor, when: When, t: TransferRow, sent: { line_oid: string; qty: number }[]): TransferRow {
    if (t.from_branch_oid !== a.branch_oid) fail(403, `${d.branches.find(b => b.oid === t.from_branch_oid)?.name ?? 'The other branch'} sends this transfer.`);
    if (t.status !== 'requested') fail(409, t.status === 'in_transit' ? 'This transfer was already sent.' : 'This transfer is closed.');
    const qtyOf = (oid: string): number => sent.find(x => x.line_oid === oid)?.qty ?? 0;
    if (!t.lines.some(l => qtyOf(l.oid) > 0)) fail(400, 'Send at least one item, or reject the request.');
    const lines = t.lines.map(l => {
        const q = qtyOf(l.oid);
        if (q === 0) return { ...l, qty_sent: 0, unit_cost: null };
        const m = moveStock(d, emit, a, when.iso, { product_oid: l.product_oid, kind: 'transfer_out', qty: -q, ref_oid: t.oid, ref_label: t.code });
        return { ...l, qty_sent: q, unit_cost: m.unit_cost };
    });
    const row: TransferRow = { ...t, lines, status: 'in_transit', sent_by_name: a.name, sent_at: when.iso };
    emit({ t: 'put', table: 'transfers', row });
    return row;
}

/** The asking branch counts it in: what was sent comes in, and anything short is written off (reason shortfall). */
export function receiveTransfer(
    d: MockDb,
    emit: Emit,
    a: Actor,
    when: When,
    t: TransferRow,
    got: { line_oid: string; qty: number }[],
    note: string | null
): TransferRow {
    if (t.to_branch_oid !== a.branch_oid) fail(403, 'The branch that asked receives this transfer.');
    if (t.status !== 'in_transit') fail(409, t.status === 'requested' ? 'This transfer has not been sent yet.' : 'This transfer is closed.');
    const notes: string[] = [];
    const lines = t.lines.map(l => {
        const sent = l.qty_sent ?? 0;
        if (sent === 0) return { ...l, qty_received: 0 };
        const q = got.find(x => x.line_oid === l.oid)?.qty ?? sent;
        if (q > sent) fail(400, `Only ${sent} of ${l.name} were sent.`);
        moveStock(d, emit, a, when.iso, {
            product_oid: l.product_oid,
            kind: 'transfer_in',
            qty: sent,
            unit_cost: l.unit_cost ?? 0,
            ref_oid: t.oid,
            ref_label: t.code
        });
        if (q < sent) {
            const short = sent - q;
            moveStock(d, emit, a, when.iso, {
                product_oid: l.product_oid,
                kind: 'adjustment',
                qty: -short,
                reason: 'shortfall',
                note: note ?? `${short} short on arrival`,
                ref_oid: t.oid,
                ref_label: t.code
            });
            notes.push(`${l.name}: ${short} short on arrival`);
        }
        return { ...l, qty_received: q };
    });
    const row: TransferRow = {
        ...t,
        lines,
        status: 'received',
        received_by_name: a.name,
        received_at: when.iso,
        closing_note: notes.length ? notes.join('; ') : note,
        closed_at: when.iso
    };
    emit({ t: 'put', table: 'transfers', row });
    return row;
}

/* ---------- POS (D-102) ---------- */

export interface Customer {
    oid: string | null;
    code: string;
    name: string;
    phone: string | null;
    dues: number;
    dues_limit: number;
}

export function customerOf(d: MockDb, branch: Branch, member: MemberRow | null, dues: number, walkInName?: string | null): Customer {
    if (!member) return { oid: null, code: WALK_IN.code, name: walkInName?.trim() ? walkInName.trim() : WALK_IN.name, phone: null, dues: 0, dues_limit: 0 };
    return {
        oid: member.oid,
        code: member.code,
        name: member.name,
        phone: member.phone,
        dues,
        dues_limit: d.branches.find(b => b.oid === branch.oid)?.dues_limit ?? 0
    };
}

export const customerWire = (c: Customer, charged: number): PosCustomer => ({
    member_oid: c.oid,
    code: c.code,
    name: c.name,
    dues: c.dues,
    dues_limit: c.dues_limit,
    dues_after: c.dues + charged,
    over_limit: c.oid !== null && c.dues + charged > c.dues_limit
});

/** The cart priced at this branch: the lines, and the products short of stock. */
export function priceCart(d: MockDb, branchOid: string, lines: CartLine[], canDiscount: boolean): { q: ReturnType<typeof posQuote>; short: PosQuote['short'] } {
    if (!lines.length) fail(400, 'Add something to the sale.');
    if (new Set(lines.map(l => l.product_oid)).size !== lines.length) fail(400, 'Each product once');
    if (!canDiscount && lines.some(l => (l.discount ?? 0) > 0)) fail(403, 'Only a branch manager gives a discount.');
    if (lines.some(l => (l.discount ?? 0) > 0 && !(l.discount_reason ?? '').trim())) fail(400, 'Say why for each discount');
    const q = posQuote(
        lines.map(l => {
            const p = product(d, l.product_oid);
            if (!p.active) fail(400, 'A product is not in the catalogue');
            return {
                product_oid: p.oid,
                code: p.code,
                name: p.name,
                unit_price: p.price,
                qty: l.qty,
                vat_rate: vatOf(d, p),
                discount: l.discount ?? 0,
                discount_reason: (l.discount_reason ?? '').trim() || null
            };
        }),
        d.settings.vat_inclusive
    );
    const short = q.lines
        .filter(l => l.qty > stockRow(d, branchOid, l.product_oid).on_hand)
        .map(l => ({ product_oid: l.product_oid, name: l.name, on_hand: stockRow(d, branchOid, l.product_oid).on_hand }));
    return { q, short };
}

function invoiceLines(lines: PosLine[]): Invoice['lines'] {
    return [
        ...lines.map(l => ({
            label: l.label,
            amount: l.amount,
            product_oid: l.product_oid,
            code: l.code,
            qty: l.qty,
            unit_price: l.unit_price,
            vat_rate: l.vat_rate,
            discount: l.discount,
            discount_reason: l.discount_reason,
            vat: l.vat,
            total: l.total
        })),
        ...lines.filter(l => l.discount).map(l => ({ label: `Discount on ${l.name}: ${l.discount_reason ?? ''}`.trim(), amount: -l.discount }))
    ];
}

/** The API's sellPos(): an invoice of kind `pos`, the stock out, the payment if any (a member may pay nothing now). */
export function sellPos(
    d: MockDb,
    emit: Emit,
    a: Actor,
    when: When,
    c: Customer,
    lines: CartLine[],
    payment: { method: PaymentMethod; amount: number; reference?: string | null },
    canDiscount: boolean,
    oid: string
): { invoice: Invoice; charged: number } {
    const { q, short } = priceCart(d, a.branch_oid, lines, canDiscount);
    const first = short[0];
    if (first) fail(409, first.on_hand === 0 ? `${first.name} is out of stock.` : `Only ${first.on_hand} of ${first.name} in stock.`);
    if (q.total <= 0) fail(400, 'Nothing to charge.');
    if (c.oid === null && payment.amount !== q.total) fail(400, `A walk-in pays it all: ${taka(q.total)}.`);
    if (payment.amount < 0 || payment.amount > q.total) fail(400, `Pay at most ${taka(q.total)}.`);
    if (payment.amount > 0 && payment.method !== 'cash' && !(payment.reference ?? '').trim()) fail(400, 'Enter the transaction reference');
    const branch = d.branches.find(b => b.oid === a.branch_oid)!;
    const seq = (d.counters[`invoice:${branch.code}`] ?? 0) + 1;
    const number = `INV-${branch.code}-${when.date.slice(0, 4)}-${String(seq).padStart(5, '0')}`;
    const pay: PaymentRecord[] =
        payment.amount > 0
            ? [
                  {
                      oid: `${oid}-p1`,
                      invoice_oid: oid,
                      kind: 'payment',
                      amount: payment.amount,
                      method: payment.method,
                      reference: (payment.reference ?? '').trim() || null,
                      received_at: when.iso,
                      received_by: a.name
                  }
              ]
            : [];
    const invoice: Invoice = {
        oid,
        number,
        kind: 'pos',
        branch: toRef(branch),
        member_oid: c.oid,
        member_name: c.name,
        member_code: c.code,
        member_phone: c.phone,
        issued_at: when.iso,
        lines: invoiceLines(q.lines),
        subtotal: q.subtotal,
        discount: q.discount,
        vat_rate: d.settings.vat_rate,
        vat_inclusive: q.vat_inclusive,
        vat_bin: d.settings.vat_bin,
        vat: q.vat,
        total: q.total,
        paid: payment.amount,
        due: q.total - payment.amount,
        status: payment.amount >= q.total ? 'Paid' : payment.amount > 0 ? 'Partial' : 'Due',
        payments: pay
    };
    emit({ t: 'invoice.create', invoice, invoiceSeq: seq });
    for (const l of q.lines) moveStock(d, emit, a, when.iso, { product_oid: l.product_oid, kind: 'sold', qty: -l.qty, ref_oid: oid, ref_label: number });
    return { invoice, charged: q.total - payment.amount };
}

/** A POS invoice's product lines (the discount lines come after them and have no product). */
export const productLines = (inv: Invoice): Required<Invoice['lines'][number]>[] =>
    inv.lines.filter(l => l.product_oid !== undefined) as Required<Invoice['lines'][number]>[];

export function saleWire(d: MockDb, inv: Invoice, today: string): PosSale {
    const own = d.posReturns.filter(r => r.invoice_oid === inv.oid);
    const returned = (i: number): number => own.reduce((s, r) => s + r.lines.filter(l => l.index === i).reduce((t, l) => t + l.qty, 0), 0);
    const day = inv.issued_at.slice(0, 10);
    return {
        invoice: inv,
        walk_in: inv.member_oid === null,
        items: productLines(inv).map((l, index) => ({
            index,
            ...l,
            returned: returned(index),
            returnable: l.qty - returned(index)
        })),
        returns: own,
        returned_amount: own.reduce((s, r) => s + r.amount, 0),
        desk_return_until: addDaysIso(day, REFUND_WINDOW_DAYS),
        desk_may_return: daysBetween(day, today) <= REFUND_WINDOW_DAYS
    };
}

/** The API's returnPos(): money back only from what was paid, the undamaged items back on the shelf at the sold cost. */
export function returnPos(
    d: MockDb,
    emit: Emit,
    a: Actor,
    when: When,
    inv: Invoice,
    input: { lines: { index: number; qty: number; damaged?: boolean }[]; method: PaymentMethod; reference?: string | null; reason: string },
    canLate: boolean,
    oid: string
): void {
    const sale = saleWire(d, inv, when.date);
    if (!sale.desk_may_return && !canLate) fail(403, `The desk takes returns until ${sale.desk_return_until}. Ask a branch manager.`);
    if (input.reason.trim().length < 3) fail(400, 'Say why it came back');
    const back: PosReturnRow['lines'] = input.lines.map(r => {
        const item = sale.items[r.index] ?? fail(400, 'A line is not on this sale');
        if (r.qty > item.returnable)
            fail(400, item.returnable === 0 ? `${item.label} was returned already.` : `Only ${item.returnable} of ${item.code} can come back.`);
        return { index: r.index, product_oid: item.product_oid, qty: r.qty, damaged: r.damaged ?? false, amount: returnAmount(item, item.returned, r.qty) };
    });
    const amount = back.reduce((s, l) => s + l.amount, 0);
    if (amount > inv.paid)
        fail(
            409,
            inv.paid <= 0
                ? `Nothing has been paid on this sale yet (${taka(inv.due)} on the account). Take the payment first, then the return.`
                : `Only ${taka(inv.paid)} was paid on this sale. Take the rest of the payment first, then the return.`
        );
    const payment: PaymentRecord = {
        oid: `${oid}-r`,
        invoice_oid: inv.oid,
        kind: 'refund',
        amount,
        method: input.method,
        reference: (input.reference ?? '').trim() || null,
        received_at: when.iso,
        received_by: a.name,
        reason: input.reason.trim(),
        approved_by: a.name
    };
    emit({ t: 'payment.create', invoice_oid: inv.oid, payment });
    emit({
        t: 'put',
        table: 'posReturns',
        row: {
            oid,
            branch_oid: a.branch_oid,
            invoice_oid: inv.oid,
            payment_oid: payment.oid,
            lines: back,
            amount,
            reason: input.reason.trim(),
            by_name: a.name,
            at: when.iso
        } satisfies PosReturnRow
    });
    for (const l of back.filter(x => !x.damaged)) {
        const sold = d.movements.find(m => m.ref_oid === inv.oid && m.product_oid === l.product_oid && m.kind === 'sold');
        moveStock(d, emit, a, when.iso, {
            product_oid: l.product_oid,
            kind: 'returned',
            qty: l.qty,
            unit_cost: sold?.unit_cost,
            ref_oid: oid,
            ref_label: inv.number
        });
    }
}
