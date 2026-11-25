import type { HttpResponse } from '@angular/common/http';

import type {
    CartLine,
    Equipment,
    EquipmentCategory,
    EquipmentDetail,
    Product,
    PurchaseOrder,
    StockLevel,
    StockTransfer,
    Supplier,
    Ticket,
    TicketPriority,
    TicketStatus
} from '@core/models/business.model';
import { EQUIPMENT_CATEGORIES, PRODUCT_CATEGORIES, PRODUCT_UNITS } from '@core/models/business.model';
import type { Invoice } from '@core/models/payment.model';
import type { PaymentMethod } from '@core/models/subscription.model';

import { recordAudit } from '../audit';
import {
    type Actor,
    type Customer,
    customerOf,
    customerWire,
    moveStock,
    priceCart,
    product,
    raisePo,
    receivePo,
    receiveTransfer,
    requestTransfer,
    returnPos,
    saleWire,
    sellPos,
    sendTransfer,
    stockRow,
    vatOf
} from '../business';
import { daysBetween } from '../domain/access-rules';
import { type Ctx, fail, num, ok, qStr, type Route, str } from '../http';
import { idx } from '../queries';
import { addDaysIso } from '../seed/clock';
import { commit, db, newOid } from '../store';
import type { EquipmentRow, PoRow, ProductRow, SupplierRow, TicketRow, TransferRow } from '../types';
import { branchMember } from './members.handlers';

/**
 * Business in demo mode: the API's equipment, catalogue, stock, purchase order, transfer and POS
 * routes (fitmanager-api src/features/equipment, catalogue, stock, pos) on the mock's tables, with the same rules and
 * messages. The stock steps are shared with the seed (../business.ts).
 */

const fileUrl = (oid: string | null): string | null => (oid ? (db().files?.find(f => f.oid === oid && f.status === 'ready')?.url ?? null) : null);
const actor = (ctx: Ctx): Actor => ({ branch_oid: ctx.branch!.oid, name: ctx.user?.name ?? '' });
const when = (ctx: Ctx): { date: string; iso: string } => ({ date: ctx.now.date, iso: ctx.now.iso });
const branchName = (oid: string): string => db().branches.find(b => b.oid === oid)?.name ?? '';
const optText = (v: unknown): string | null => str(v) || null;
const optNum = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : num(v));
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** A file the caller uploaded for this kind (ready, here or at HQ for products), or a 400 like the API's claim. */
function claim(oid: unknown, kind: string): string | null {
    if (oid === null || oid === undefined || oid === '') return null;
    const f = db().files?.find(x => x.oid === oid && x.kind === kind && x.status === 'ready');
    if (!f) fail(400, 'Upload the file first');
    return f.oid;
}

/* ---------- equipment ---------- */

export function nextService(e: Pick<EquipmentRow, 'service_every_days' | 'last_serviced_on' | 'purchased_on' | 'created_on' | 'status'>): string | null {
    if (!e.service_every_days || e.status === 'retired') return null;
    return addDaysIso(e.last_serviced_on ?? e.purchased_on ?? e.created_on, e.service_every_days);
}

export function serviceState(next: string | null, today: string): Equipment['service'] {
    if (!next) return 'none';
    if (next <= today) return 'due';
    return daysBetween(today, next) <= 7 ? 'soon' : 'ok';
}

function equipmentWire(e: EquipmentRow, today: string): Equipment {
    const next = nextService(e);
    const tickets = db().tickets.filter(t => t.equipment_oid === e.oid);
    const room = e.room_oid ? db().rooms.find(r => r.oid === e.room_oid) : undefined;
    return {
        ...e,
        in_warranty: e.warranty_until !== null && e.warranty_until >= today,
        room: room ? { oid: room.oid, name: room.name } : null,
        photo_url: fileUrl(e.photo_file_oid),
        next_service_on: next,
        service: serviceState(next, today),
        open_tickets: tickets.filter(t => t.kind === 'repair' && (t.status === 'open' || t.status === 'in_progress')).length,
        spent: tickets.reduce((s, t) => s + (t.cost ?? 0), 0)
    };
}

const ticketWire = (t: TicketRow): Ticket => ({
    ...t,
    equipment: { oid: t.equipment_oid, name: db().equipment.find(e => e.oid === t.equipment_oid)?.name ?? '' },
    photo_url: fileUrl(t.photo_file_oid)
});

function equipmentRow(ctx: Ctx, oid: string): EquipmentRow {
    const e = db().equipment.find(x => x.oid === oid);
    if (!e || e.branch_oid !== ctx.branch?.oid) fail(404, 'Equipment not found');
    return e;
}

function detail(ctx: Ctx, oid: string): EquipmentDetail {
    const e = equipmentRow(ctx, oid);
    return {
        ...equipmentWire(e, ctx.now.date),
        tickets: db()
            .tickets.filter(t => t.equipment_oid === oid)
            .sort((a, b) => b.raised_at.localeCompare(a.raised_at))
            .map(ticketWire)
    };
}

function listEquipment(ctx: Ctx): HttpResponse<unknown> {
    const status = qStr(ctx, 'status');
    const term = qStr(ctx, 'q').toLowerCase();
    const all = db()
        .equipment.filter(e => e.branch_oid === ctx.branch!.oid)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(e => equipmentWire(e, ctx.now.date));
    const rows = all.filter(
        e =>
            (status === '' ? e.status !== 'retired' : status === 'all' || e.status === status) &&
            (qStr(ctx, 'due') !== '1' || e.service === 'due' || e.service === 'soon') &&
            (!term || [e.name, e.brand, e.model, e.serial].some(x => x?.toLowerCase().includes(term)))
    );
    return ok({
        rows,
        counts: {
            in_use: all.filter(e => e.status === 'in_use').length,
            out_of_order: all.filter(e => e.status === 'out_of_order').length,
            retired: all.filter(e => e.status === 'retired').length,
            service_due: all.filter(e => e.service === 'due').length
        }
    });
}

function equipmentFields(ctx: Ctx, b: Record<string, unknown>, before?: EquipmentRow): Partial<EquipmentRow> {
    const out: Partial<EquipmentRow> = {};
    if (!before || 'name' in b) {
        const name = str(b['name']);
        if (name.length < 2) fail(400, 'Give it a name');
        out.name = name;
    }
    if (!before || 'category' in b) {
        if (!EQUIPMENT_CATEGORIES.includes(b['category'] as EquipmentCategory)) fail(400, 'Choose a category');
        out.category = b['category'] as EquipmentCategory;
    }
    for (const k of ['brand', 'model', 'serial', 'notes'] as const) if (!before || k in b) out[k] = optText(b[k]);
    for (const k of ['purchased_on', 'warranty_until', 'last_serviced_on'] as const)
        if (!before || k in b) {
            const v = b[k];
            if (v !== null && v !== undefined && v !== '' && !isDate(v)) fail(400, 'A date');
            out[k] = isDate(v) ? v : null;
        }
    if (!before || 'cost' in b) out.cost = optNum(b['cost']);
    if (!before || 'service_every_days' in b) {
        const n = optNum(b['service_every_days']);
        if (n !== null && (n < 7 || n > 730)) fail(400, 'Between 7 and 730 days');
        out.service_every_days = n;
    }
    if (!before || 'room_oid' in b) {
        const r = b['room_oid'];
        if (r && !db().rooms.some(x => x.oid === r && x.branch_oid === ctx.branch!.oid)) fail(400, 'Choose a room at this branch');
        out.room_oid = typeof r === 'string' && r ? r : null;
    }
    if (!before || 'photo_file_oid' in b)
        out.photo_file_oid = b['photo_file_oid'] === before?.photo_file_oid ? (before?.photo_file_oid ?? null) : claim(b['photo_file_oid'], 'equipment_photo');
    return out;
}

function createEquipment(ctx: Ctx): HttpResponse<unknown> {
    const row: EquipmentRow = {
        oid: newOid('eq'),
        branch_oid: ctx.branch!.oid,
        status: 'in_use',
        retired_on: null,
        retired_reason: null,
        created_on: ctx.now.date,
        ...(equipmentFields(ctx, ctx.body) as Omit<EquipmentRow, 'oid' | 'branch_oid' | 'status' | 'retired_on' | 'retired_reason' | 'created_on'>)
    };
    if (db().equipment.some(e => e.branch_oid === row.branch_oid && e.name.toLowerCase() === row.name.toLowerCase() && e.status !== 'retired'))
        fail(409, `There is already ${row.name} here. Give it a number, like ${row.name} 2.`);
    commit({ t: 'put', table: 'equipment', row });
    const out = equipmentWire(row, ctx.now.date);
    recordAudit(ctx, 'create', 'equipment', row.name, null, out);
    return ok(out, 'Equipment added');
}

function updateEquipment(ctx: Ctx): HttpResponse<unknown> {
    const before = equipmentRow(ctx, ctx.params[0]);
    if (before.status === 'retired') fail(409, 'This equipment is retired.');
    const patch = equipmentFields(ctx, ctx.body, before);
    commit({ t: 'patch', table: 'equipment', oid: before.oid, patch });
    const after = equipmentWire({ ...before, ...patch }, ctx.now.date);
    recordAudit(ctx, 'update', 'equipment', before.name, equipmentWire(before, ctx.now.date), after);
    return ok(after, 'Saved');
}

function retire(ctx: Ctx): HttpResponse<unknown> {
    const e = equipmentRow(ctx, ctx.params[0]);
    const reason = str(ctx.body['reason']);
    if (reason.length < 3) fail(400, 'Say why');
    if (e.status === 'retired') fail(409, 'This equipment is retired already.');
    if (db().tickets.some(t => t.equipment_oid === e.oid && (t.status === 'open' || t.status === 'in_progress'))) fail(409, 'Close its open tickets first.');
    commit({ t: 'patch', table: 'equipment', oid: e.oid, patch: { status: 'retired', retired_on: ctx.now.date, retired_reason: reason } });
    recordAudit(ctx, 'retire', 'equipment', e.name, { status: e.status }, { status: 'retired', reason });
    return ok(equipmentWire({ ...e, status: 'retired', retired_on: ctx.now.date, retired_reason: reason }, ctx.now.date), 'Retired');
}

function ticketCode(branchOid: string): string {
    const code = db().branches.find(b => b.oid === branchOid)!.code;
    const prefix = `TKT-${code}-`;
    const n = db()
        .tickets.filter(t => t.code.startsWith(prefix))
        .reduce((m, t) => Math.max(m, Number(t.code.slice(prefix.length))), 0);
    return `${prefix}${String(n + 1).padStart(5, '0')}`;
}

function recordService(ctx: Ctx): HttpResponse<unknown> {
    const e = equipmentRow(ctx, ctx.params[0]);
    if (e.status === 'retired') fail(409, 'This equipment is retired.');
    const on = isDate(ctx.body['on']) ? ctx.body['on'] : ctx.now.date;
    if (on > ctx.now.date) fail(400, 'Not in the future');
    const technician = str(ctx.body['technician']);
    if (technician.length < 2) fail(400, 'Who serviced it');
    const row: TicketRow = {
        oid: newOid('tkt'),
        branch_oid: e.branch_oid,
        equipment_oid: e.oid,
        code: ticketCode(e.branch_oid),
        kind: 'service',
        description: optText(ctx.body['note']) ?? 'Service',
        photo_file_oid: null,
        priority: 'normal',
        out_of_order: false,
        status: 'fixed',
        technician,
        cost: optNum(ctx.body['cost']),
        resolution: optText(ctx.body['note']),
        raised_by_name: ctx.user!.name,
        raised_at: ctx.now.iso,
        updated_at: ctx.now.iso,
        closed_at: ctx.now.iso,
        closed_by_name: ctx.user!.name
    };
    commit({ t: 'put', table: 'tickets', row });
    commit({ t: 'patch', table: 'equipment', oid: e.oid, patch: { last_serviced_on: on } });
    recordAudit(ctx, 'service', 'equipment', e.name, { last_serviced_on: e.last_serviced_on }, { last_serviced_on: on, ticket: row.code, technician });
    return ok(detail(ctx, e.oid), 'Service recorded');
}

/** Out of order while an out-of-order ticket is open (or could not be fixed); back in use when none is. */
function settleStatus(equipmentOid: string): void {
    const e = db().equipment.find(x => x.oid === equipmentOid)!;
    if (e.status === 'retired') return;
    const down = db().tickets.some(t => t.equipment_oid === e.oid && t.out_of_order && ['open', 'in_progress', 'cannot_fix'].includes(t.status));
    const status = down ? 'out_of_order' : 'in_use';
    if (status !== e.status) commit({ t: 'patch', table: 'equipment', oid: e.oid, patch: { status } });
}

function raiseTicket(ctx: Ctx): HttpResponse<unknown> {
    const e = equipmentRow(ctx, ctx.params[0]);
    if (e.status === 'retired') fail(409, 'This equipment is retired.');
    const description = str(ctx.body['description']);
    if (description.length < 3) fail(400, 'Say what is wrong');
    const priority = (ctx.body['priority'] as TicketPriority | undefined) ?? 'normal';
    const row: TicketRow = {
        oid: newOid('tkt'),
        branch_oid: e.branch_oid,
        equipment_oid: e.oid,
        code: ticketCode(e.branch_oid),
        kind: 'repair',
        description,
        photo_file_oid: claim(ctx.body['photo_file_oid'], 'ticket_photo'),
        priority,
        out_of_order: ctx.body['out_of_order'] === true,
        status: 'open',
        technician: null,
        cost: null,
        resolution: null,
        raised_by_name: ctx.user!.name,
        raised_at: ctx.now.iso,
        updated_at: ctx.now.iso,
        closed_at: null,
        closed_by_name: null
    };
    commit({ t: 'put', table: 'tickets', row });
    settleStatus(e.oid);
    const out = ticketWire(row);
    recordAudit(ctx, 'create', 'maintenance_ticket', row.code, null, out);
    return ok(out, 'Ticket raised');
}

function updateTicket(ctx: Ctx): HttpResponse<unknown> {
    const t = db().tickets.find(x => x.oid === ctx.params[0] && x.branch_oid === ctx.branch?.oid);
    if (!t) fail(404, 'Ticket not found');
    if (t.status === 'fixed' || t.status === 'cannot_fix') fail(409, 'This ticket is closed.');
    const b = ctx.body;
    const status = (b['status'] as TicketStatus | undefined) ?? t.status;
    const resolution = 'resolution' in b ? optText(b['resolution']) : t.resolution;
    if (status === 'cannot_fix' && !resolution) fail(400, 'Say why it cannot be fixed');
    const closing = status === 'fixed' || status === 'cannot_fix';
    const patch: Partial<TicketRow> = {
        status,
        priority: (b['priority'] as TicketPriority | undefined) ?? t.priority,
        technician: 'technician' in b ? optText(b['technician']) : t.technician,
        cost: 'cost' in b ? optNum(b['cost']) : t.cost,
        resolution,
        updated_at: ctx.now.iso,
        ...(closing ? { closed_at: ctx.now.iso, closed_by_name: ctx.user!.name } : {})
    };
    commit({ t: 'patch', table: 'tickets', oid: t.oid, patch });
    settleStatus(t.equipment_oid);
    const after = ticketWire({ ...t, ...patch });
    recordAudit(ctx, closing ? 'close' : 'update', 'maintenance_ticket', t.code, ticketWire(t), after);
    return ok(after, 'Saved');
}

function listTickets(ctx: Ctx): HttpResponse<unknown> {
    const status = qStr(ctx, 'status') || 'open';
    const open = (t: TicketRow): boolean => t.status === 'open' || t.status === 'in_progress';
    return ok(
        db()
            .tickets.filter(t => t.branch_oid === ctx.branch!.oid && t.kind === 'repair' && (status === 'all' || (status === 'open' ? open(t) : !open(t))))
            .sort(
                (a, b) =>
                    Number(open(b)) - Number(open(a)) ||
                    Number(b.priority === 'urgent') - Number(a.priority === 'urgent') ||
                    b.raised_at.localeCompare(a.raised_at)
            )
            .map(ticketWire)
    );
}

/* ---------- catalogue and suppliers ---------- */

function productWire(p: ProductRow): Product {
    const d = db();
    return {
        ...p,
        vat_rate_applied: vatOf(d, p),
        photos: p.photo_file_oids.map(oid => ({ file_oid: oid, url: fileUrl(oid) ?? '' })),
        supplier_name: d.suppliers.find(s => s.oid === p.supplier_oid)?.name ?? null
    };
}

function listProducts(ctx: Ctx): HttpResponse<unknown> {
    const term = qStr(ctx, 'q').toLowerCase();
    const category = qStr(ctx, 'category');
    return ok(
        db()
            .products.filter(p => (qStr(ctx, 'all') === '1' || p.active) && (!category || p.category === category))
            .filter(p => !term || p.name.toLowerCase().includes(term) || p.code.toLowerCase().includes(term))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(productWire)
    );
}

function productFields(b: Record<string, unknown>, before?: ProductRow): Partial<ProductRow> {
    const out: Partial<ProductRow> = {};
    if (!before || 'name' in b) {
        const name = str(b['name']);
        if (name.length < 2) fail(400, 'Give it a name');
        if (db().products.some(p => p.oid !== before?.oid && p.name.toLowerCase() === name.toLowerCase()))
            fail(409, 'There is a product with this name already.');
        out.name = name;
    }
    if (!before || 'category' in b) {
        if (!PRODUCT_CATEGORIES.includes(b['category'] as ProductRow['category'])) fail(400, 'Choose a category');
        out.category = b['category'] as ProductRow['category'];
    }
    if (!before || 'unit' in b) {
        if (!PRODUCT_UNITS.includes(b['unit'] as ProductRow['unit'])) fail(400, 'Choose a unit');
        out.unit = b['unit'] as ProductRow['unit'];
    }
    if (!before || 'price' in b) {
        const price = num(b['price']);
        if (price <= 0) fail(400, 'A price above 0');
        out.price = price;
    }
    if (!before || 'description' in b) out.description = optText(b['description']);
    if (!before || 'vat_rate' in b) out.vat_rate = optNum(b['vat_rate']);
    if (!before || 'reorder_level' in b) out.reorder_level = b['reorder_level'] === undefined ? (before?.reorder_level ?? 5) : num(b['reorder_level']);
    if (!before || 'active' in b) out.active = b['active'] === undefined ? (before?.active ?? true) : b['active'] === true;
    if (!before || 'supplier_oid' in b) {
        const s = b['supplier_oid'];
        if (s && !db().suppliers.some(x => x.oid === s)) fail(400, 'Choose a supplier');
        out.supplier_oid = typeof s === 'string' && s ? s : null;
    }
    if (!before || 'photo_file_oids' in b) {
        const list = (b['photo_file_oids'] as string[] | undefined) ?? [];
        if (list.length > 3) fail(400, 'At most 3 photos');
        out.photo_file_oids = list.map(oid => (before?.photo_file_oids.includes(oid) ? oid : claim(oid, 'product_photo')!));
    }
    return out;
}

function createProduct(ctx: Ctx): HttpResponse<unknown> {
    const d = db();
    const n = d.products.reduce((m, p) => Math.max(m, Number(p.code.slice(4))), 0) + 1;
    const row: ProductRow = {
        oid: newOid('prd'),
        code: `PRD-${String(n).padStart(6, '0')}`,
        updated_at: ctx.now.iso,
        ...(productFields(ctx.body) as Omit<ProductRow, 'oid' | 'code' | 'updated_at'>)
    };
    commit({ t: 'put', table: 'products', row });
    const out = productWire(row);
    recordAudit(ctx, 'create', 'product', row.code, null, out);
    return ok(out, 'Product added');
}

function updateProduct(ctx: Ctx): HttpResponse<unknown> {
    const before = db().products.find(p => p.oid === ctx.params[0]) ?? fail(404, 'Product not found');
    const patch = { ...productFields(ctx.body, before), updated_at: ctx.now.iso };
    commit({ t: 'patch', table: 'products', oid: before.oid, patch });
    const after = productWire({ ...before, ...patch });
    const action = 'active' in ctx.body && ctx.body['active'] !== before.active ? (ctx.body['active'] ? 'activate' : 'deactivate') : 'update';
    recordAudit(ctx, action, 'product', before.code, productWire(before), after);
    return ok(after, 'Saved');
}

const supplierWire = (s: SupplierRow): Supplier => ({ ...s, products: db().products.filter(p => p.supplier_oid === s.oid && p.active).length });

const PHONE = /^(?:\+?88)?01[3-9]\d{8}$/;
function supplierFields(b: Record<string, unknown>, before?: SupplierRow): Partial<SupplierRow> {
    const out: Partial<SupplierRow> = {};
    if (!before || 'name' in b) {
        const name = str(b['name']);
        if (name.length < 2) fail(400, 'Give the supplier a name');
        if (db().suppliers.some(s => s.oid !== before?.oid && s.name.toLowerCase() === name.toLowerCase()))
            fail(409, 'There is a supplier with this name already.');
        out.name = name;
    }
    if (!before || 'phone' in b) {
        const phone = str(b['phone']).replace(/[\s-]/g, '');
        if (phone && !PHONE.test(phone)) fail(400, 'A Bangladeshi mobile number');
        out.phone = phone ? `+880${phone.slice(-10)}` : null;
    }
    if (!before || 'email' in b) out.email = optText(b['email'])?.toLowerCase() ?? null;
    for (const k of ['contact_name', 'address', 'notes'] as const) if (!before || k in b) out[k] = optText(b[k]);
    if (!before || 'active' in b) out.active = b['active'] === undefined ? (before?.active ?? true) : b['active'] === true;
    return out;
}

/* ---------- stock ---------- */

function levelWire(p: ProductRow, branchOid: string, costs: boolean): StockLevel {
    const d = db();
    const s = stockRow(d, branchOid, p.oid);
    const moves = d.movements.filter(m => m.branch_oid === branchOid && m.product_oid === p.oid);
    const lastIn = [...moves].reverse().find(m => m.kind === 'received');
    return {
        product_oid: p.oid,
        code: p.code,
        name: p.name,
        category: p.category,
        unit: p.unit,
        price: p.price,
        photo_url: fileUrl(p.photo_file_oids[0] ?? null),
        on_hand: s.on_hand,
        reorder_level: s.reorder_level,
        low: s.on_hand <= s.reorder_level,
        on_order: d.purchaseOrders
            .filter(o => o.branch_oid === branchOid && ['pending', 'approved', 'sent', 'partial'].includes(o.status))
            .reduce((n, o) => n + o.lines.filter(l => l.product_oid === p.oid).reduce((t, l) => t + l.qty - l.received, 0), 0),
        in_transit: d.transfers
            .filter(t => t.to_branch_oid === branchOid && t.status === 'in_transit')
            .reduce((n, t) => n + t.lines.filter(l => l.product_oid === p.oid).reduce((x, l) => x + (l.qty_sent ?? 0), 0), 0),
        avg_cost: costs ? s.avg_cost : null,
        value: costs ? Math.round(s.avg_cost * s.on_hand) : null,
        last_cost: costs ? (lastIn?.unit_cost ?? null) : null,
        last_moved_at: moves.at(-1)?.at ?? null
    };
}

const costs = (ctx: Ctx): boolean => ctx.ability.can('update', 'Stock');

/** `GET /v1/stock` (also read by the stock export). */
export function stockLevels(ctx: Ctx): HttpResponse<unknown> {
    const term = qStr(ctx, 'q').toLowerCase();
    const all = db()
        .products.filter(p => p.active)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(p => levelWire(p, ctx.branch!.oid, costs(ctx)));
    return ok({
        rows: all.filter(r => (qStr(ctx, 'low') !== '1' || r.low) && (!term || r.name.toLowerCase().includes(term) || r.code.toLowerCase().includes(term))),
        low: all.filter(r => r.low).length,
        value: costs(ctx) ? all.reduce((s, r) => s + (r.value ?? 0), 0) : null
    });
}

function ledger(ctx: Ctx): HttpResponse<unknown> {
    const p = db().products.find(x => x.oid === ctx.params[0] && x.active) ?? fail(404, 'Product not found');
    const c = costs(ctx);
    return ok({
        product: levelWire(p, ctx.branch!.oid, c),
        movements: db()
            .movements.filter(m => m.branch_oid === ctx.branch!.oid && m.product_oid === p.oid)
            .sort((a, b) => b.seq - a.seq)
            .slice(0, 200)
            .map(m => ({ ...m, unit_cost: c ? m.unit_cost : null, avg_cost_after: c ? m.avg_cost_after : null }))
    });
}

function adjust(ctx: Ctx): HttpResponse<unknown> {
    const p = product(db(), ctx.params[0]);
    const qty = num(ctx.body['qty']);
    const reason = str(ctx.body['reason']) as 'damaged' | 'expired' | 'count' | 'other';
    const note = optText(ctx.body['note']);
    if (!['damaged', 'expired', 'count', 'other'].includes(reason)) fail(400, 'Choose a reason');
    if (!Number.isInteger(qty) || qty === 0) fail(400, 'A whole number, not 0');
    if (reason !== 'count' && qty > 0) fail(400, 'Only a count adds stock. Received goods come in on a purchase order.');
    if ((reason === 'other' || reason === 'count') && !note) fail(400, 'Say what happened');
    const before = stockRow(db(), ctx.branch!.oid, p.oid).on_hand;
    const after = moveStock(db(), commit, actor(ctx), ctx.now.iso, { product_oid: p.oid, kind: 'adjustment', qty, reason, note });
    recordAudit(ctx, 'adjust', 'stock', p.name, { on_hand: before }, { on_hand: after.on_hand, qty, reason, note });
    return ok({ product_oid: p.oid, on_hand: after.on_hand }, 'Stock adjusted');
}

function reorderLevel(ctx: Ctx): HttpResponse<unknown> {
    const p = product(db(), ctx.params[0]);
    const level = num(ctx.body['reorder_level']);
    if (!Number.isInteger(level) || level < 0) fail(400, 'A whole number, 0 or more');
    const s = stockRow(db(), ctx.branch!.oid, p.oid);
    commit({ t: 'put', table: 'stock', row: { ...s, reorder_level: level } });
    recordAudit(ctx, 'update', 'stock', p.name, { reorder_level: s.reorder_level }, { reorder_level: level });
    return ok({ product_oid: p.oid, reorder_level: level, low: s.on_hand <= level }, 'Reorder level saved');
}

function elsewhere(ctx: Ctx): HttpResponse<unknown> {
    const wanted = ctx.query.getAll('product_oid') ?? [];
    const d = db();
    return ok(
        d.stock
            .filter(s => wanted.includes(s.product_oid) && s.on_hand > 0 && s.branch_oid !== ctx.branch!.oid)
            .map(s => ({ product_oid: s.product_oid, branch_oid: s.branch_oid, branch_name: branchName(s.branch_oid), on_hand: s.on_hand }))
            .sort((a, b) => a.branch_name.localeCompare(b.branch_name))
    );
}

function hqStock(): HttpResponse<unknown> {
    const d = db();
    const branches = d.branches
        .filter(b => b.kind === 'BRANCH')
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(b => ({ oid: b.oid, code: b.code, name: b.name }));
    return ok({
        branches,
        rows: d.products
            .filter(p => p.active)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(p => ({
                product_oid: p.oid,
                code: p.code,
                name: p.name,
                category: p.category,
                cells: branches.map(b => {
                    const s = stockRow(d, b.oid, p.oid);
                    return { branch_oid: b.oid, on_hand: s.on_hand, reorder_level: s.reorder_level, low: s.on_hand <= s.reorder_level };
                })
            })),
        value: Math.round(d.stock.reduce((s, r) => s + r.on_hand * r.avg_cost, 0))
    });
}

/* ---------- purchase orders ---------- */

function poWire(o: PoRow): PurchaseOrder {
    const d = db();
    const b = d.branches.find(x => x.oid === o.branch_oid)!;
    const s = d.suppliers.find(x => x.oid === o.supplier_oid);
    return {
        ...o,
        branch: { oid: b.oid, name: b.name, code: b.code },
        supplier: { oid: o.supplier_oid, name: o.supplier_name, phone: s?.phone ?? null, email: s?.email ?? null, contact_name: s?.contact_name ?? null },
        total: o.lines.reduce((t, l) => t + l.qty * l.unit_cost, 0),
        lines: o.lines.map(l => ({ ...l, outstanding: l.qty - l.received })),
        ordered: o.lines.reduce((t, l) => t + l.qty, 0),
        received: o.lines.reduce((t, l) => t + l.received, 0),
        deliveries: o.deliveries.map(x => ({ ...x, lines: x.lines.map(l => ({ ...l, name: o.lines.find(y => y.oid === l.line_oid)?.name ?? '' })) }))
    };
}

function po(ctx: Ctx, oid: string): PoRow {
    const o = db().purchaseOrders.find(x => x.oid === oid);
    const hq = ctx.branch?.kind === 'HQ';
    if (!o || (!hq && o.branch_oid !== ctx.branch?.oid)) fail(404, 'Purchase order not found');
    return o;
}

function listPos(ctx: Ctx): HttpResponse<unknown> {
    const hq = ctx.branch?.kind === 'HQ';
    const status = qStr(ctx, 'status');
    const branch = qStr(ctx, 'branch_oid');
    return ok(
        db()
            .purchaseOrders.filter(o => (hq ? !branch || o.branch_oid === branch : o.branch_oid === ctx.branch!.oid) && (!status || o.status === status))
            .sort((a, b) => Number(b.status === 'pending') - Number(a.status === 'pending') || b.raised_at.localeCompare(a.raised_at))
            .map(poWire)
    );
}

function raise(ctx: Ctx): HttpResponse<unknown> {
    const lines = (ctx.body['lines'] as { product_oid: string; qty: number; unit_cost: number }[] | undefined) ?? [];
    if (!lines.length) fail(400, 'Add at least one product');
    if (new Set(lines.map(l => l.product_oid)).size !== lines.length) fail(400, 'Each product once');
    if (lines.some(l => !Number.isInteger(l.qty) || l.qty < 1)) fail(400, 'At least 1 of each');
    const row = raisePo(
        db(),
        commit,
        actor(ctx),
        when(ctx),
        { supplier_oid: str(ctx.body['supplier_oid']), note: optText(ctx.body['note']), lines },
        newOid('po')
    );
    const out = poWire(row);
    recordAudit(ctx, 'create', 'purchase_order', row.code, null, out);
    return ok(out, 'Sent to HQ for approval');
}

function decide(approve: boolean) {
    return (ctx: Ctx): HttpResponse<unknown> => {
        const o = po(ctx, ctx.params[0]);
        if (o.status !== 'pending') fail(409, 'This order was decided already.');
        const note = optText(ctx.body['note']);
        if (!approve && !note) fail(400, 'Say why it is rejected');
        const patch: Partial<PoRow> = {
            status: approve ? 'approved' : 'rejected',
            decided_by_name: ctx.user!.name,
            decided_at: ctx.now.iso,
            decision_note: note,
            closed_at: approve ? null : ctx.now.iso
        };
        commit({ t: 'patch', table: 'purchaseOrders', oid: o.oid, patch });
        recordAudit(ctx, approve ? 'approve' : 'reject', 'purchase_order', o.code, { status: o.status }, { status: patch.status, note });
        return ok(poWire({ ...o, ...patch }), approve ? 'Approved' : 'Rejected');
    };
}

function markSent(ctx: Ctx): HttpResponse<unknown> {
    const o = po(ctx, ctx.params[0]);
    if (o.status !== 'approved') fail(409, o.status === 'pending' ? 'HQ has not approved this order yet.' : 'This order was sent already.');
    commit({ t: 'patch', table: 'purchaseOrders', oid: o.oid, patch: { status: 'sent', sent_at: ctx.now.iso } });
    recordAudit(ctx, 'send', 'purchase_order', o.code, { status: o.status }, { status: 'sent' });
    return ok(poWire({ ...o, status: 'sent', sent_at: ctx.now.iso }), 'Marked as sent');
}

function deliver(ctx: Ctx): HttpResponse<unknown> {
    const o = po(ctx, ctx.params[0]);
    if (!['approved', 'sent', 'partial'].includes(o.status))
        fail(409, o.status === 'pending' ? 'HQ has not approved this order yet.' : 'This order is closed.');
    const on = isDate(ctx.body['received_on']) ? ctx.body['received_on'] : ctx.now.date;
    if (on > ctx.now.date || daysBetween(on, ctx.now.date) > 7) fail(400, 'Today or up to 7 days ago');
    const row = receivePo(
        db(),
        commit,
        actor(ctx),
        when(ctx),
        o,
        {
            received_on: on,
            note: optText(ctx.body['note']),
            lines: (ctx.body['lines'] as { line_oid: string; qty: number; unit_cost?: number }[] | undefined) ?? []
        },
        newOid('del')
    );
    recordAudit(ctx, 'receive', 'purchase_order', o.code, { status: o.status }, { status: row.status, delivery: row.deliveries.at(-1) });
    return ok(poWire(row), 'Delivery received');
}

function cancelPo(ctx: Ctx): HttpResponse<unknown> {
    const o = po(ctx, ctx.params[0]);
    const reason = str(ctx.body['reason']);
    if (reason.length < 3) fail(400, 'Say why');
    if (!['pending', 'approved', 'sent'].includes(o.status))
        fail(409, o.status === 'partial' ? 'Part of it came in: it cannot be cancelled now.' : 'This order is closed.');
    const patch: Partial<PoRow> = { status: 'cancelled', cancel_reason: reason, closed_at: ctx.now.iso };
    commit({ t: 'patch', table: 'purchaseOrders', oid: o.oid, patch });
    recordAudit(ctx, 'cancel', 'purchase_order', o.code, { status: o.status }, { status: 'cancelled', reason });
    return ok(poWire({ ...o, ...patch }), 'Order cancelled');
}

/* ---------- transfers ---------- */

function transferWire(t: TransferRow, branchOid: string): StockTransfer {
    return {
        ...t,
        from: { oid: t.from_branch_oid, name: branchName(t.from_branch_oid) },
        to: { oid: t.to_branch_oid, name: branchName(t.to_branch_oid) },
        direction: t.to_branch_oid === branchOid ? ('in' as const) : ('out' as const)
    };
}

function transfer(ctx: Ctx, oid: string): TransferRow {
    const t = db().transfers.find(x => x.oid === oid);
    if (!t || (t.from_branch_oid !== ctx.branch?.oid && t.to_branch_oid !== ctx.branch?.oid)) fail(404, 'Transfer not found');
    return t;
}

function listTransfers(ctx: Ctx): HttpResponse<unknown> {
    const b = ctx.branch!.oid;
    const dir = qStr(ctx, 'direction') || 'all';
    const open = (t: TransferRow): boolean => t.status === 'requested' || t.status === 'in_transit';
    return ok(
        db()
            .transfers.filter(t =>
                dir === 'in' ? t.to_branch_oid === b : dir === 'out' ? t.from_branch_oid === b : t.to_branch_oid === b || t.from_branch_oid === b
            )
            .sort((x, y) => Number(open(y)) - Number(open(x)) || y.requested_at.localeCompare(x.requested_at))
            .map(t => transferWire(t, b))
    );
}

function closeTransfer(how: 'reject' | 'cancel') {
    return (ctx: Ctx): HttpResponse<unknown> => {
        const t = transfer(ctx, ctx.params[0]);
        const note = str(ctx.body['note']);
        if (note.length < 3) fail(400, 'Say why');
        if (how === 'reject' && t.from_branch_oid !== ctx.branch!.oid) fail(403, 'The sending branch rejects a request.');
        if (how === 'cancel' && t.to_branch_oid !== ctx.branch!.oid) fail(403, 'The branch that asked cancels it.');
        if (t.status !== 'requested') fail(409, t.status === 'in_transit' ? 'It is on its way: receive it instead.' : 'This transfer is closed.');
        const status = how === 'reject' ? 'rejected' : 'cancelled';
        commit({ t: 'patch', table: 'transfers', oid: t.oid, patch: { status, closing_note: note, closed_at: ctx.now.iso } });
        recordAudit(ctx, how, 'stock_transfer', t.code, { status: t.status }, { status, note });
        return ok(transferWire({ ...t, status, closing_note: note, closed_at: ctx.now.iso }, ctx.branch!.oid), how === 'reject' ? 'Rejected' : 'Cancelled');
    };
}

/* ---------- POS ---------- */

function cart(ctx: Ctx): CartLine[] {
    return ((ctx.body['lines'] as CartLine[] | undefined) ?? []).map(l => ({
        product_oid: str(l.product_oid),
        qty: num(l.qty),
        discount: num(l.discount ?? 0),
        discount_reason: l.discount_reason ?? null
    }));
}

function customer(ctx: Ctx, walkIn?: string | null): Customer {
    const oid = ctx.body['member_oid'];
    const d = db();
    const branch = d.branches.find(b => b.oid === ctx.branch!.oid)!;
    if (!oid) return customerOf(d, branch, null, 0, walkIn);
    const m = branchMember(ctx, str(oid));
    if (m.anonymised) fail(409, 'This member was anonymised');
    const dues = (idx().invoices.get(m.oid) ?? []).reduce((s, i) => s + i.due, 0);
    return customerOf(d, branch, m, dues);
}

function posProducts(ctx: Ctx): HttpResponse<unknown> {
    const d = db();
    return ok(
        d.products
            .filter(p => p.active)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(p => ({
                oid: p.oid,
                code: p.code,
                name: p.name,
                category: p.category,
                unit: p.unit,
                price: p.price,
                vat_rate: vatOf(d, p),
                photo_url: fileUrl(p.photo_file_oids[0] ?? null),
                on_hand: stockRow(d, ctx.branch!.oid, p.oid).on_hand
            }))
    );
}

function quote(ctx: Ctx): HttpResponse<unknown> {
    const { q, short } = priceCart(db(), ctx.branch!.oid, cart(ctx), ctx.ability.can('manage', 'Sale'));
    return ok({ ...q, short, customer: customerWire(customer(ctx), q.total) });
}

function sell(ctx: Ctx): HttpResponse<unknown> {
    const c = customer(ctx, optText(ctx.body['walk_in_name']));
    const pay = (ctx.body['payment'] as { method?: PaymentMethod; amount?: number; reference?: string | null } | undefined) ?? {};
    const { invoice, charged } = sellPos(
        db(),
        commit,
        actor(ctx),
        when(ctx),
        c,
        cart(ctx),
        { method: pay.method ?? 'cash', amount: num(pay.amount), reference: pay.reference ?? null },
        ctx.ability.can('manage', 'Sale'),
        newOid('inv')
    );
    recordAudit(ctx, 'create', 'invoice', `${c.code}/${invoice.number}`, null, { invoice, charged });
    return ok({ invoice: db().invoices.find(i => i.oid === invoice.oid), charged, customer: customerWire(c, charged) }, 'Sale recorded');
}

function posInvoice(ctx: Ctx, oid: string): Invoice {
    const inv = db().invoices.find(i => i.oid === oid && i.kind === 'pos' && i.branch.oid === ctx.branch?.oid);
    if (!inv) fail(404, 'Sale not found');
    return inv;
}

function listSales(ctx: Ctx): HttpResponse<unknown> {
    const day = qStr(ctx, 'day');
    const term = qStr(ctx, 'q').toLowerCase();
    return ok(
        db()
            .invoices.filter(i => i.kind === 'pos' && i.branch.oid === ctx.branch!.oid && (!day || i.issued_at.slice(0, 10) === day))
            .filter(i => !term || [i.number, i.member_name, i.member_code].some(x => x.toLowerCase().includes(term)))
            .sort((a, b) => b.issued_at.localeCompare(a.issued_at))
            .slice(0, 100)
            .map(i => saleWire(db(), i, ctx.now.date))
    );
}

function returnSale(ctx: Ctx): HttpResponse<unknown> {
    const inv = posInvoice(ctx, ctx.params[0]);
    const before = inv.paid;
    const input = {
        lines: (ctx.body['lines'] as { index: number; qty: number; damaged?: boolean }[] | undefined) ?? [],
        method: (ctx.body['method'] as PaymentMethod | undefined) ?? 'cash',
        reference: optText(ctx.body['reference']),
        reason: str(ctx.body['reason'])
    };
    if (!input.lines.length) fail(400, 'Choose what comes back');
    returnPos(db(), commit, actor(ctx), when(ctx), inv, input, ctx.ability.can('manage', 'Sale'), newOid('ret'));
    const after = saleWire(db(), posInvoice(ctx, inv.oid), ctx.now.date);
    const ret = db().posReturns.at(-1)!;
    recordAudit(
        ctx,
        'refund',
        'invoice',
        inv.number,
        { paid: before },
        { paid: after.invoice.paid, refund: ret.payment_oid, amount: ret.amount, reason: input.reason }
    );
    return ok(after, 'Return recorded');
}

const ID = '([\\w-]+)';
const r = (s: string): RegExp => new RegExp(`^${s.replaceAll(':id', ID)}$`);

export const BUSINESS_ROUTES: Route[] = [
    // Equipment and tickets
    { method: 'GET', path: r('/v1/equipment'), scope: 'branch', can: ['read', 'Equipment'], handler: listEquipment },
    { method: 'GET', path: r('/v1/equipment-tickets'), scope: 'branch', can: ['read', 'Equipment'], handler: listTickets },
    { method: 'GET', path: r('/v1/equipment/:id'), scope: 'branch', can: ['read', 'Equipment'], handler: ctx => ok(detail(ctx, ctx.params[0])) },
    { method: 'POST', path: r('/v1/equipment'), scope: 'branch', can: ['update', 'Equipment'], handler: createEquipment },
    { method: 'PATCH', path: r('/v1/equipment/:id'), scope: 'branch', can: ['update', 'Equipment'], handler: updateEquipment },
    { method: 'POST', path: r('/v1/equipment/:id/retire'), scope: 'branch', can: ['update', 'Equipment'], handler: retire },
    { method: 'POST', path: r('/v1/equipment/:id/service'), scope: 'branch', can: ['update', 'Equipment'], handler: recordService },
    { method: 'POST', path: r('/v1/equipment/:id/tickets'), scope: 'branch', can: ['create', 'Equipment'], handler: raiseTicket },
    { method: 'PATCH', path: r('/v1/equipment-tickets/:id'), scope: 'branch', can: ['update', 'Equipment'], handler: updateTicket },
    // Catalogue and suppliers
    { method: 'GET', path: r('/v1/products'), scope: 'staff', can: ['read', 'Product'], handler: listProducts },
    {
        method: 'GET',
        path: r('/v1/products/:id'),
        scope: 'staff',
        can: ['read', 'Product'],
        handler: ctx => ok(productWire(db().products.find(p => p.oid === ctx.params[0]) ?? fail(404, 'Product not found')))
    },
    { method: 'POST', path: r('/v1/hq/products'), scope: 'hq', can: ['create', 'Product'], handler: createProduct },
    { method: 'PATCH', path: r('/v1/hq/products/:id'), scope: 'hq', can: ['update', 'Product'], handler: updateProduct },
    {
        method: 'GET',
        path: r('/v1/suppliers'),
        scope: 'staff',
        can: ['read', 'Supplier'],
        handler: ctx =>
            ok(
                db()
                    .suppliers.filter(s => qStr(ctx, 'all') === '1' || s.active)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(supplierWire)
            )
    },
    {
        method: 'POST',
        path: r('/v1/hq/suppliers'),
        scope: 'hq',
        can: ['create', 'Supplier'],
        handler: ctx => {
            const row = { oid: newOid('sup'), updated_at: ctx.now.iso, ...(supplierFields(ctx.body) as Omit<SupplierRow, 'oid' | 'updated_at'>) };
            commit({ t: 'put', table: 'suppliers', row });
            recordAudit(ctx, 'create', 'supplier', row.name, null, row);
            return ok(supplierWire(row), 'Supplier added');
        }
    },
    {
        method: 'PATCH',
        path: r('/v1/hq/suppliers/:id'),
        scope: 'hq',
        can: ['update', 'Supplier'],
        handler: ctx => {
            const before = db().suppliers.find(s => s.oid === ctx.params[0]) ?? fail(404, 'Supplier not found');
            const patch = { ...supplierFields(ctx.body, before), updated_at: ctx.now.iso };
            commit({ t: 'patch', table: 'suppliers', oid: before.oid, patch });
            recordAudit(ctx, 'update', 'supplier', before.name, before, { ...before, ...patch });
            return ok(supplierWire({ ...before, ...patch }), 'Saved');
        }
    },
    // Stock
    { method: 'GET', path: r('/v1/stock'), scope: 'branch', can: ['read', 'Stock'], handler: stockLevels },
    { method: 'GET', path: r('/v1/stock/elsewhere'), scope: 'branch', can: ['read', 'Transfer'], handler: elsewhere },
    { method: 'GET', path: r('/v1/stock/:id/movements'), scope: 'branch', can: ['read', 'Stock'], handler: ledger },
    { method: 'POST', path: r('/v1/stock/:id/adjust'), scope: 'branch', can: ['update', 'Stock'], handler: adjust },
    { method: 'PUT', path: r('/v1/stock/:id/reorder-level'), scope: 'branch', can: ['update', 'Stock'], handler: reorderLevel },
    { method: 'GET', path: r('/v1/hq/stock'), scope: 'hq', can: ['read', 'Stock'], handler: hqStock },
    // Purchase orders
    { method: 'GET', path: r('/v1/purchase-orders'), scope: 'staff', can: ['read', 'PurchaseOrder'], handler: listPos },
    { method: 'GET', path: r('/v1/purchase-orders/:id'), scope: 'staff', can: ['read', 'PurchaseOrder'], handler: ctx => ok(poWire(po(ctx, ctx.params[0]))) },
    { method: 'POST', path: r('/v1/purchase-orders'), scope: 'branch', can: ['create', 'PurchaseOrder'], handler: raise },
    { method: 'POST', path: r('/v1/purchase-orders/:id/sent'), scope: 'branch', can: ['update', 'PurchaseOrder'], handler: markSent },
    { method: 'POST', path: r('/v1/purchase-orders/:id/deliveries'), scope: 'branch', can: ['update', 'PurchaseOrder'], handler: deliver },
    { method: 'POST', path: r('/v1/purchase-orders/:id/cancel'), scope: 'branch', can: ['update', 'PurchaseOrder'], handler: cancelPo },
    { method: 'POST', path: r('/v1/hq/purchase-orders/:id/approve'), scope: 'hq', can: ['update', 'PurchaseOrder'], handler: decide(true) },
    { method: 'POST', path: r('/v1/hq/purchase-orders/:id/reject'), scope: 'hq', can: ['update', 'PurchaseOrder'], handler: decide(false) },
    // Transfers
    { method: 'GET', path: r('/v1/transfers'), scope: 'branch', can: ['read', 'Transfer'], handler: listTransfers },
    {
        method: 'GET',
        path: r('/v1/transfers/:id'),
        scope: 'branch',
        can: ['read', 'Transfer'],
        handler: ctx => ok(transferWire(transfer(ctx, ctx.params[0]), ctx.branch!.oid))
    },
    {
        method: 'POST',
        path: r('/v1/transfers'),
        scope: 'branch',
        can: ['create', 'Transfer'],
        handler: ctx => {
            const lines = (ctx.body['lines'] as { product_oid: string; qty: number }[] | undefined) ?? [];
            if (!lines.length) fail(400, 'Add at least one product');
            const row = requestTransfer(
                db(),
                commit,
                actor(ctx),
                when(ctx),
                { from_branch_oid: str(ctx.body['from_branch_oid']), note: optText(ctx.body['note']), lines },
                newOid('trf')
            );
            recordAudit(ctx, 'request', 'stock_transfer', row.code, null, row);
            return ok(transferWire(row, ctx.branch!.oid), 'Requested');
        }
    },
    {
        method: 'POST',
        path: r('/v1/transfers/:id/send'),
        scope: 'branch',
        can: ['update', 'Transfer'],
        handler: ctx => {
            const t = transfer(ctx, ctx.params[0]);
            const row = sendTransfer(db(), commit, actor(ctx), when(ctx), t, (ctx.body['lines'] as { line_oid: string; qty: number }[] | undefined) ?? []);
            recordAudit(ctx, 'send', 'stock_transfer', t.code, { status: t.status }, { status: 'in_transit' });
            return ok(transferWire(row, ctx.branch!.oid), 'Sent');
        }
    },
    {
        method: 'POST',
        path: r('/v1/transfers/:id/receive'),
        scope: 'branch',
        can: ['update', 'Transfer'],
        handler: ctx => {
            const t = transfer(ctx, ctx.params[0]);
            const row = receiveTransfer(
                db(),
                commit,
                actor(ctx),
                when(ctx),
                t,
                (ctx.body['lines'] as { line_oid: string; qty: number }[] | undefined) ?? [],
                optText(ctx.body['note'])
            );
            recordAudit(ctx, 'receive', 'stock_transfer', t.code, { status: t.status }, { status: 'received', closing_note: row.closing_note });
            return ok(transferWire(row, ctx.branch!.oid), 'Received');
        }
    },
    { method: 'POST', path: r('/v1/transfers/:id/reject'), scope: 'branch', can: ['update', 'Transfer'], handler: closeTransfer('reject') },
    { method: 'POST', path: r('/v1/transfers/:id/cancel'), scope: 'branch', can: ['update', 'Transfer'], handler: closeTransfer('cancel') },
    // POS
    { method: 'GET', path: r('/v1/pos/products'), scope: 'branch', can: ['read', 'Sale'], handler: posProducts },
    { method: 'POST', path: r('/v1/pos/quote'), scope: 'branch', can: ['create', 'Sale'], handler: quote },
    { method: 'POST', path: r('/v1/pos/sales'), scope: 'branch', can: ['create', 'Sale'], handler: sell },
    { method: 'GET', path: r('/v1/pos/sales'), scope: 'branch', can: ['read', 'Sale'], handler: listSales },
    {
        method: 'GET',
        path: r('/v1/pos/sales/:id'),
        scope: 'branch',
        can: ['read', 'Sale'],
        handler: ctx => ok(saleWire(db(), posInvoice(ctx, ctx.params[0]), ctx.now.date))
    },
    { method: 'POST', path: r('/v1/pos/sales/:id/return'), scope: 'branch', can: ['create', 'Sale'], handler: returnSale }
];
