/**
 * POS pricing: pure functions, copied from the API's (fitmanager-api
 * src/features/pos/pos-pricing.ts), with the same cases in pos-pricing.spec.ts: keep them in step. Whole taka, rounded once per line.
 *
 * Each line: gross = unit price × quantity; less the line discount (a branch manager's, with a reason); VAT at the
 * product's own rate (or the HQ rate), worked out on the line as plans do (pricing.ts):
 * - exclusive: VAT = round(net × rate), added: line total = net + VAT;
 * - inclusive: the price already has VAT in it: line total = net, VAT = round(net × rate ÷ (1 + rate)).
 * The invoice adds the lines up. A return gives back a share of a line's total (`returnAmount`), so returning
 * every unit in several goes gives back exactly the line's total.
 */

export interface PosLineInput {
    product_oid: string;
    code: string;
    name: string;
    unit_price: number;
    qty: number;
    vat_rate: number;
    /** Taka off the line (0 = none). */
    discount: number;
    discount_reason: string | null;
}

export interface PosLine extends PosLineInput {
    /** "Protein bar, 60 g × 3": the invoice's line label. */
    label: string;
    /** unit_price × qty: the invoice line's amount. */
    amount: number;
    net: number;
    vat: number;
    total: number;
}

export interface PosQuote {
    lines: PosLine[];
    subtotal: number;
    discount: number;
    vat: number;
    total: number;
    vat_inclusive: boolean;
}

export function posQuote(lines: readonly PosLineInput[], vatInclusive: boolean): PosQuote {
    const out = lines.map(l => {
        const amount = Math.round(l.unit_price * l.qty);
        const discount = Math.min(Math.max(0, Math.round(l.discount)), amount);
        const net = amount - discount;
        const vat = vatInclusive ? Math.round((net * l.vat_rate) / (1 + l.vat_rate)) : Math.round(net * l.vat_rate);
        return {
            ...l,
            discount,
            discount_reason: discount ? l.discount_reason : null,
            label: l.qty === 1 ? l.name : `${l.name} × ${l.qty}`,
            amount,
            net,
            vat,
            total: vatInclusive ? net : net + vat
        };
    });
    const sum = (f: (l: PosLine) => number): number => out.reduce((s, l) => s + f(l), 0);
    return {
        lines: out,
        subtotal: sum(l => l.amount),
        discount: sum(l => l.discount),
        vat: sum(l => l.vat),
        total: sum(l => l.total),
        vat_inclusive: vatInclusive
    };
}

/** What `qty` more units of a line give back, when `before` units of it were returned already. */
export function returnAmount(line: Pick<PosLine, 'qty' | 'total'>, before: number, qty: number): number {
    const share = (n: number): number => Math.round((line.total * n) / line.qty);
    return share(before + qty) - share(before);
}

/**
 * Weighted average cost after `qty` units come in at `unitCost`, to whole paisa. Units going out leave the
 * average where it is.
 */
export function averageCost(onHand: number, avgCost: number, qty: number, unitCost: number): number {
    if (qty <= 0) return avgCost;
    const total = onHand + qty;
    return total === 0 ? 0 : Math.round(((onHand * avgCost + qty * unitCost) / total) * 100) / 100;
}
