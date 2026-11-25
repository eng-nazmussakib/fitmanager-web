import type { Report, ReportBranch } from '@core/models/report.model';

import { invoiceDue } from './domain/pricing';
import { addComp, type Comp, type DayRow, type GroupRow, previousRange, type Range, upsert } from './domain/report-build';
import * as defs from './domain/report-defs';
import { addDaysIso, dateOf, timeOf, weekdayOf } from './seed/clock';
import { db } from './store';
import type { MockDb } from './types';

/**
 * The reports in demo mode: each SQL query of the API's `reports.repo.ts` done over the mock's tables,
 * then the very same definitions (`domain/report-defs.ts`, a copy of the API's). Keep the two loaders in step.
 */

const inRange = (day: string, r: Range): boolean => day >= r.from && day <= r.to;
const daysApart = (a: string, b: string): number => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Sums components by (branch, key): a day or a dimension. */
class Acc {
    private readonly _m = new Map<string, { branch_oid: string; key: string; comp: Comp }>();
    add(branchOid: string, key: string, comp: Comp): void {
        const row = upsert(this._m, `${branchOid}|${key}`, () => ({ branch_oid: branchOid, key, comp: {} }));
        addComp(row.comp, comp);
    }
    days(): DayRow[] {
        return [...this._m.values()].map(r => ({ branch_oid: r.branch_oid, day: r.key, comp: r.comp }));
    }
    groups(): GroupRow[] {
        return [...this._m.values()].map(r => ({ branch_oid: r.branch_oid, dim: r.key, comp: r.comp }));
    }
    perBranch(): Map<string, Comp> {
        const out = new Map<string, Comp>();
        for (const r of this._m.values())
            addComp(
                upsert(out, r.branch_oid, (): Comp => ({})),
                r.comp
            );
        return out;
    }
}

const isMembership = (s: MockDb['subscriptions'][number]): boolean => (s.kind ?? 'membership') === 'membership';

/* ---------- revenue ---------- */

function revenueDays(d: MockDb, b: Set<string>, r: Range): DayRow[] {
    const acc = new Acc();
    for (const inv of d.invoices) {
        if (!b.has(inv.branch.oid)) continue;
        const day = dateOf(inv.issued_at);
        if (inRange(day, r))
            acc.add(inv.branch.oid, day, { invoices: 1, invoiced: inv.total, shop: inv.kind === 'pos' ? inv.total : 0, discount: inv.discount, vat: inv.vat });
        for (const p of inv.payments) {
            const pd = dateOf(p.received_at);
            if (!inRange(pd, r)) continue;
            acc.add(inv.branch.oid, pd, p.kind === 'refund' ? { received: 0, refunded: p.amount } : { received: p.amount, refunded: 0 });
        }
    }
    return acc.days();
}

function revenueBySource(d: MockDb, b: Set<string>, r: Range): GroupRow[] {
    const plan = new Map(d.subscriptions.map(s => [s.invoice_oid, s.plan_name]));
    const acc = new Acc();
    for (const inv of d.invoices) {
        if (!b.has(inv.branch.oid) || !inRange(dateOf(inv.issued_at), r)) continue;
        const dim = inv.kind === 'pos' ? 'Shop' : inv.kind === 'locker' ? 'Locker rentals' : (plan.get(inv.oid) ?? 'Other');
        acc.add(inv.branch.oid, dim, { invoices: 1, invoiced: inv.total, discount: inv.discount, vat: inv.vat });
    }
    return acc.groups();
}

function revenueByMethod(d: MockDb, b: Set<string>, r: Range): GroupRow[] {
    const acc = new Acc();
    for (const inv of d.invoices) {
        if (!b.has(inv.branch.oid)) continue;
        for (const p of inv.payments) {
            if (!inRange(dateOf(p.received_at), r)) continue;
            const refund = p.kind === 'refund';
            acc.add(inv.branch.oid, p.method, { payments: refund ? 0 : 1, received: refund ? 0 : p.amount, refunded: refund ? p.amount : 0 });
        }
    }
    return acc.groups();
}

/* ---------- dues ---------- */

interface Owing {
    branch_oid: string;
    member_oid: string | null;
    member_code: string;
    member_name: string;
    number: string;
    age: number;
    due: number;
}

function owing(d: MockDb, b: Set<string>, asOf: string): Owing[] {
    const out: Owing[] = [];
    for (const inv of d.invoices) {
        const issued = dateOf(inv.issued_at);
        if (!b.has(inv.branch.oid) || issued > asOf) continue;
        const upTo = inv.payments.filter(p => dateOf(p.received_at) <= asOf);
        const paidIn = upTo.filter(p => p.kind !== 'refund').reduce((s, p) => s + p.amount, 0);
        const refunded = upTo.filter(p => p.kind === 'refund').reduce((s, p) => s + p.amount, 0);
        const due = invoiceDue(inv.total, paidIn, refunded);
        if (due > 0)
            out.push({
                branch_oid: inv.branch.oid,
                member_oid: inv.member_oid,
                member_code: inv.member_code,
                member_name: inv.member_name,
                number: inv.number,
                age: daysApart(issued, asOf),
                due
            });
    }
    return out;
}

function duesTotals(rows: Owing[]): Map<string, Comp> {
    const out = new Map<string, Comp>();
    const who = new Map<string, Set<string>>();
    for (const o of rows) {
        addComp(
            upsert(out, o.branch_oid, (): Comp => ({})),
            { due: o.due, invoices: 1, over_30: o.age > 30 ? o.due : 0 }
        );
        upsert(who, o.branch_oid, () => new Set<string>()).add(o.member_oid ?? o.number);
    }
    for (const [branch, set] of who) upsert(out, branch, (): Comp => ({}))['members'] = set.size;
    return out;
}

function duesLargest(rows: Owing[]): defs.DuesInput['largest'] {
    const by = new Map<string, { branch_oid: string; member_code: string; member_name: string; due: number; invoices: number; oldest: number }>();
    for (const o of rows) {
        if (!o.member_oid) continue;
        const m = upsert(by, `${o.branch_oid}|${o.member_code}`, () => ({
            branch_oid: o.branch_oid,
            member_code: o.member_code,
            member_name: o.member_name,
            due: 0,
            invoices: 0,
            oldest: 0
        }));
        m.due += o.due;
        m.invoices += 1;
        m.oldest = Math.max(m.oldest, o.age);
    }
    return [...by.values()].sort((a, z) => z.due - a.due || a.member_code.localeCompare(z.member_code)).slice(0, 25);
}

/* ---------- members ---------- */

function memberDays(d: MockDb, b: Set<string>, r: Range): DayRow[] {
    const acc = new Acc();
    const home = new Map(d.members.map(m => [m.oid, m]));
    for (const m of d.members)
        if (b.has(m.branch_oid) && !m.pending && !m.anonymised && inRange(m.joined_on, r)) acc.add(m.branch_oid, m.joined_on, { joined: 1 });
    const kind = new Map(d.invoices.map(i => [i.oid, i.kind]));
    for (const s of d.subscriptions) {
        const m = home.get(s.member_oid);
        if (!m || !b.has(m.branch_oid) || !isMembership(s) || !inRange(dateOf(s.created_at), r)) continue;
        const upgrade = kind.get(s.invoice_oid) === 'upgrade';
        const before = d.subscriptions.some(e => e.member_oid === s.member_oid && isMembership(e) && e.created_at < s.created_at);
        acc.add(m.branch_oid, dateOf(s.created_at), {
            first_plans: !upgrade && !before ? 1 : 0,
            renewals: !upgrade && before ? 1 : 0,
            upgrades: upgrade ? 1 : 0
        });
    }
    return acc.days();
}

/** Each member's last plan sold by the end of `r` (one that ran). */
function lastPlans(d: MockDb, b: Set<string>, r: Range): { s: MockDb['subscriptions'][number]; m: MockDb['members'][number] }[] {
    const home = new Map(d.members.map(m => [m.oid, m]));
    const last = new Map<string, MockDb['subscriptions'][number]>();
    for (const s of d.subscriptions) {
        const m = home.get(s.member_oid);
        if (!m || !b.has(m.branch_oid) || !isMembership(s) || dateOf(s.created_at) > r.to || s.end_date < s.start_date) continue;
        const was = last.get(s.member_oid);
        if (!was || s.end_date > was.end_date) last.set(s.member_oid, s);
    }
    return [...last.values()].map(s => ({ s, m: home.get(s.member_oid)! }));
}

function memberState(d: MockDb, b: Set<string>, r: Range): Map<string, Comp> {
    const acc = new Acc();
    for (const { s, m } of lastPlans(d, b, r)) {
        acc.add(m.branch_oid, '', {
            active: s.start_date <= r.to && s.end_date >= r.to ? 1 : 0,
            lapsed: s.end_date >= r.from && s.end_date <= addDaysIso(r.to, -1) ? 1 : 0,
            expiring: s.end_date >= addDaysIso(r.to, 1) && s.end_date <= addDaysIso(r.to, 14) ? 1 : 0
        });
    }
    return acc.perBranch();
}

function plansSold(d: MockDb, b: Set<string>, r: Range): GroupRow[] {
    const home = new Map(d.members.map(m => [m.oid, m]));
    const inv = new Map(d.invoices.map(i => [i.oid, i]));
    const acc = new Acc();
    for (const s of d.subscriptions) {
        const m = home.get(s.member_oid);
        if (!m || !b.has(m.branch_oid) || !isMembership(s) || !inRange(dateOf(s.created_at), r)) continue;
        const i = inv.get(s.invoice_oid);
        const before = d.subscriptions.some(e => e.member_oid === s.member_oid && isMembership(e) && e.created_at < s.created_at);
        acc.add(m.branch_oid, s.plan_name, { sold: 1, renewals: before && i?.kind !== 'upgrade' ? 1 : 0, invoiced: i?.total ?? 0 });
    }
    return acc.groups();
}

function expiringSoon(d: MockDb, b: Set<string>, r: Range): defs.MembersInput['expiring'] {
    return lastPlans(d, b, r)
        .filter(({ s }) => !s.cancelled_at && s.end_date >= addDaysIso(r.to, 1) && s.end_date <= addDaysIso(r.to, 14))
        .sort((a, z) => a.s.end_date.localeCompare(z.s.end_date) || a.m.code.localeCompare(z.m.code))
        .slice(0, 50)
        .map(({ s, m }) => ({ branch_oid: m.branch_oid, member_code: m.code, member_name: m.name, plan: s.plan_name, ends: s.end_date }));
}

/* ---------- attendance ---------- */

function visits(d: MockDb, b: Set<string>, r: Range): { days: DayRow[]; unique: Map<string, Comp>; hours: defs.AttendanceInput['hours'] } {
    const home = new Map(d.members.map(m => [m.oid, m.branch_oid]));
    const acc = new Acc();
    const daily = new Map<string, Set<string>>();
    const all = new Map<string, Set<string>>();
    const hours = new Map<string, { branch_oid: string; dow: number; hour: number; visits: number }>();
    for (const c of d.checkIns) {
        const day = dateOf(c.in_at);
        if (!b.has(c.branch_oid) || !inRange(day, r)) continue;
        const stay = c.out_at ? Math.round((Date.parse(c.out_at) - Date.parse(c.in_at)) / 60_000) : 0;
        acc.add(c.branch_oid, day, { visits: 1, visitors: home.get(c.member_oid) !== c.branch_oid ? 1 : 0, stays: c.out_at ? 1 : 0, stay_minutes: stay });
        upsert(daily, `${c.branch_oid}|${day}`, () => new Set<string>()).add(c.member_oid);
        upsert(all, c.branch_oid, () => new Set<string>()).add(c.member_oid);
        const dow = weekdayOf(day);
        const hour = Number(timeOf(c.in_at).slice(0, 2));
        upsert(hours, `${c.branch_oid}|${dow}|${hour}`, () => ({ branch_oid: c.branch_oid, dow, hour, visits: 0 })).visits += 1;
    }
    const days = acc.days().map(row => ({ ...row, comp: { ...row.comp, members: daily.get(`${row.branch_oid}|${row.day}`)?.size ?? 0 } }));
    return { days, unique: new Map([...all].map(([branch, set]) => [branch, { unique_members: set.size }])), hours: [...hours.values()] };
}

/* ---------- classes ---------- */

function classRows(d: MockDb, b: Set<string>, r: Range, dim: 'day' | 'type'): Acc {
    const bookings = new Map<string, MockDb['bookings']>();
    for (const k of d.bookings) upsert(bookings, k.session_oid, (): MockDb['bookings'] => []).push(k);
    const acc = new Acc();
    for (const s of d.sessions) {
        const day = dateOf(s.starts_at);
        if (!b.has(s.branch_oid) || !inRange(day, r)) continue;
        const list = bookings.get(s.oid) ?? [];
        const held = !s.cancelled;
        acc.add(s.branch_oid, dim === 'day' ? day : s.type_name, {
            held: held ? 1 : 0,
            cancelled: held ? 0 : 1,
            capacity: held ? s.capacity : 0,
            booked: held ? list.filter(k => k.status === 'Booked' || k.status === 'Attended' || k.status === 'NoShow').length : 0,
            attended: held ? list.filter(k => k.status === 'Attended').length : 0,
            no_shows: held ? list.filter(k => k.status === 'NoShow').length : 0,
            waitlist: held ? list.filter(k => k.status === 'Waitlist').length : 0,
            late_cancels: held ? list.filter(k => k.late_cancel).length : 0
        });
    }
    return acc;
}

/* ---------- trainers ---------- */

function trainerRows(d: MockDb, b: Set<string>, r: Range, trainerOid?: string): defs.TrainerNumbers[] {
    const rows = new Map<string, defs.TrainerNumbers>();
    const name = new Map(d.trainers.map(t => [t.oid, t.name]));
    const row = (branchOid: string, trainerOid2: string, trainer: string): defs.TrainerNumbers =>
        upsert(rows, `${branchOid}|${trainerOid2}`, () => ({
            branch_oid: branchOid,
            trainer_oid: trainerOid2,
            trainer: name.get(trainerOid2) ?? trainer,
            pt_completed: 0,
            pt_no_shows: 0,
            pt_cancelled: 0,
            pt_booked: 0,
            classes: 0,
            class_attended: 0,
            class_no_shows: 0,
            ratings: 0,
            rating_sum: 0
        }));
    const mine = (oid: string | null): boolean => !!oid && (!trainerOid || oid === trainerOid);
    for (const p of d.ptSessions) {
        if (!b.has(p.branch_oid) || !mine(p.trainer_oid) || !inRange(dateOf(p.starts_at), r)) continue;
        const t = row(p.branch_oid, p.trainer_oid, p.trainer_name);
        if (p.status === 'Completed') t.pt_completed++;
        else if (p.status === 'NoShow') t.pt_no_shows++;
        else if (p.status === 'Cancelled') t.pt_cancelled++;
        else t.pt_booked++;
    }
    const bookings = new Map<string, MockDb['bookings']>();
    for (const k of d.bookings) upsert(bookings, k.session_oid, (): MockDb['bookings'] => []).push(k);
    for (const s of d.sessions) {
        if (!b.has(s.branch_oid) || s.cancelled || !mine(s.trainer_oid) || !inRange(dateOf(s.starts_at), r)) continue;
        const t = row(s.branch_oid, s.trainer_oid, s.trainer_name);
        const list = bookings.get(s.oid) ?? [];
        t.classes++;
        t.class_attended += list.filter(k => k.status === 'Attended').length;
        t.class_no_shows += list.filter(k => k.status === 'NoShow').length;
    }
    for (const x of d.ratings) {
        if (!b.has(x.branch_oid) || !mine(x.trainer_oid) || !inRange(dateOf(x.created_at), r)) continue;
        const t = row(x.branch_oid, x.trainer_oid!, x.trainer_name ?? '');
        t.ratings++;
        t.rating_sum += x.score;
    }
    return [...rows.values()].sort((a, z) => a.trainer.localeCompare(z.trainer));
}

function ptDays(d: MockDb, b: Set<string>, r: Range, trainerOid?: string): DayRow[] {
    const acc = new Acc();
    for (const p of d.ptSessions)
        if (b.has(p.branch_oid) && p.status === 'Completed' && (!trainerOid || p.trainer_oid === trainerOid) && inRange(dateOf(p.starts_at), r))
            acc.add(p.branch_oid, dateOf(p.starts_at), { pt_completed: 1, classes: 0 });
    for (const s of d.sessions)
        if (b.has(s.branch_oid) && !s.cancelled && (!trainerOid || s.trainer_oid === trainerOid) && inRange(dateOf(s.starts_at), r))
            acc.add(s.branch_oid, dateOf(s.starts_at), { pt_completed: 0, classes: 1 });
    return acc.days();
}

/* ---------- shop ---------- */

function shopRows(d: MockDb, b: Set<string>, r: Range, by: 'day' | 'product' | 'category'): Acc {
    const product = new Map(d.products.map(p => [p.oid, p]));
    const key = (day: string, productOid: string): string =>
        by === 'day' ? day : by === 'product' ? (product.get(productOid)?.name ?? '') : (product.get(productOid)?.category ?? '');
    const invoices = new Map(d.invoices.map(i => [i.oid, i]));
    const acc = new Acc();
    for (const inv of d.invoices) {
        const day = dateOf(inv.issued_at);
        if (inv.kind !== 'pos' || !b.has(inv.branch.oid) || !inRange(day, r)) continue;
        if (by === 'day') acc.add(inv.branch.oid, day, { sales: 1 });
        for (const l of inv.lines) {
            if (!l.product_oid) continue;
            const total = l.total ?? l.amount;
            acc.add(inv.branch.oid, key(day, l.product_oid), { qty: l.qty ?? 0, net: total - (l.vat ?? 0), gross: total });
        }
    }
    for (const ret of d.posReturns) {
        const day = dateOf(ret.at);
        if (!b.has(ret.branch_oid) || !inRange(day, r)) continue;
        const inv = invoices.get(ret.invoice_oid);
        for (const x of ret.lines) {
            const line = inv?.lines[x.index];
            const total = line?.total ?? 0;
            const share = total > 0 ? 1 - (line?.vat ?? 0) / total : 1;
            acc.add(ret.branch_oid, key(day, x.product_oid), { returned_net: Math.round(x.amount * share), returned_qty: x.qty });
        }
    }
    for (const m of d.movements) {
        const day = dateOf(m.at);
        if ((m.kind !== 'sold' && m.kind !== 'returned') || !b.has(m.branch_oid) || !inRange(day, r)) continue;
        // Sold moves are negative (a cost), returned ones positive (the cost back).
        acc.add(m.branch_oid, key(day, m.product_oid), { cost: -m.qty * m.unit_cost });
    }
    return acc;
}

/* ---------- operations ---------- */

function stockValue(d: MockDb, b: Set<string>): GroupRow[] {
    const product = new Map(d.products.map(p => [p.oid, p]));
    const acc = new Acc();
    for (const s of d.stock) {
        const p = product.get(s.product_oid);
        if (!b.has(s.branch_oid) || !p) continue;
        acc.add(s.branch_oid, p.category, { units: s.on_hand, value: s.on_hand * s.avg_cost, low: s.on_hand <= s.reorder_level && p.active ? 1 : 0 });
    }
    return acc.groups();
}

function equipmentSpend(d: MockDb, b: Set<string>, r: Range): GroupRow[] {
    const kit = new Map(d.equipment.map(e => [e.oid, e]));
    const acc = new Acc();
    for (const t of d.tickets) {
        const e = kit.get(t.equipment_oid);
        if (!b.has(t.branch_oid) || !e || !t.closed_at || !inRange(dateOf(t.closed_at), r)) continue;
        acc.add(t.branch_oid, e.category, { repairs: 1, repair_cost: t.cost ?? 0, bought: 0, purchase_cost: 0 });
    }
    for (const e of d.equipment)
        if (b.has(e.branch_oid) && e.purchased_on && inRange(e.purchased_on, r))
            acc.add(e.branch_oid, e.category, { repairs: 0, repair_cost: 0, bought: 1, purchase_cost: e.cost ?? 0 });
    return acc.groups();
}

function complaintsByCategory(d: MockDb, b: Set<string>, r: Range): GroupRow[] {
    const acc = new Acc();
    for (const c of d.complaints) {
        if (!b.has(c.branch_oid) || !inRange(dateOf(c.created_at), r)) continue;
        acc.add(c.branch_oid, c.category, {
            complaints: 1,
            resolved: c.status === 'resolved' || c.status === 'closed' ? 1 : 0,
            escalated: c.escalated ? 1 : 0,
            responded: c.first_response_at ? 1 : 0,
            response_hours: c.first_response_at ? (Date.parse(c.first_response_at) - Date.parse(c.created_at)) / 3_600_000 : 0
        });
    }
    return acc.groups();
}

function feedbackDays(d: MockDb, b: Set<string>, r: Range): DayRow[] {
    const acc = new Acc();
    for (const n of d.nps) {
        if (!b.has(n.branch_oid) || n.score === null || !inRange(dateOf(n.created_at), r)) continue;
        acc.add(n.branch_oid, dateOf(n.created_at), { answers: 1, promoters: n.score >= 9 ? 1 : 0, detractors: n.score <= 6 ? 1 : 0 });
    }
    for (const c of d.complaints) if (b.has(c.branch_oid) && inRange(dateOf(c.created_at), r)) acc.add(c.branch_oid, dateOf(c.created_at), { complaints: 1 });
    for (const x of d.ratings)
        if (b.has(x.branch_oid) && inRange(dateOf(x.created_at), r)) acc.add(x.branch_oid, dateOf(x.created_at), { ratings: 1, rating_sum: x.score });
    return acc.days();
}

function openTickets(d: MockDb, b: Set<string>): Map<string, Comp> {
    const acc = new Acc();
    for (const t of d.tickets) {
        if (!b.has(t.branch_oid)) continue;
        const open = t.status === 'open' || t.status === 'in_progress';
        acc.add(t.branch_oid, '', { open_tickets: open ? 1 : 0, urgent: open && t.priority === 'urgent' ? 1 : 0 });
    }
    for (const e of d.equipment) if (b.has(e.branch_oid) && e.status === 'out_of_order') acc.add(e.branch_oid, '', { out_of_order: 1 });
    return acc.perBranch();
}

/* ---------- the reports ---------- */

type Load = (d: MockDb, b: Set<string>, s: defs.Scope) => defs.Built;

const LOADERS: Record<defs.ReportKey, Load> = {
    revenue: (d, b, s) =>
        defs.revenue(s, {
            days: revenueDays(d, b, s.range),
            previous: s.previous ? revenueDays(d, b, s.previous) : null,
            bySource: revenueBySource(d, b, s.range),
            byMethod: revenueByMethod(d, b, s.range)
        }),
    dues: (d, b, s) => {
        const now = owing(d, b, s.range.to);
        return defs.dues(s, {
            totals: duesTotals(now),
            previous: s.previous ? duesTotals(owing(d, b, s.previous.to)) : null,
            byAge: now.map(o => ({ branch_oid: o.branch_oid, dim: defs.dueAge(o.age), comp: { due: o.due, invoices: 1 } })),
            largest: duesLargest(now)
        });
    },
    members: (d, b, s) =>
        defs.members(s, {
            days: memberDays(d, b, s.range),
            state: memberState(d, b, s.range),
            previousDays: s.previous ? memberDays(d, b, s.previous) : null,
            previousState: s.previous ? memberState(d, b, s.previous) : null,
            plans: plansSold(d, b, s.range),
            expiring: expiringSoon(d, b, s.range)
        }),
    attendance: (d, b, s) => {
        const now = visits(d, b, s.range);
        const prev = s.previous ? visits(d, b, s.previous) : null;
        return defs.attendance(
            s,
            { days: now.days, unique: now.unique, previousDays: prev?.days ?? null, previousUnique: prev?.unique ?? null, hours: now.hours },
            daysApart(s.range.from, s.range.to) + 1
        );
    },
    classes: (d, b, s) =>
        defs.classes(s, {
            days: classRows(d, b, s.range, 'day').days(),
            previous: s.previous ? classRows(d, b, s.previous, 'day').days() : null,
            byType: classRows(d, b, s.range, 'type').groups()
        }),
    trainers: (d, b, s) =>
        defs.trainers(s, { rows: trainerRows(d, b, s.range), previous: s.previous ? trainerRows(d, b, s.previous) : null, days: ptDays(d, b, s.range) }),
    shop: (d, b, s) =>
        defs.shop(s, {
            days: shopRows(d, b, s.range, 'day').days(),
            previous: s.previous ? shopRows(d, b, s.previous, 'day').days() : null,
            byProduct: shopRows(d, b, s.range, 'product').groups(),
            byCategory: shopRows(d, b, s.range, 'category').groups()
        }),
    operations: (d, b, s) =>
        defs.operations(s, {
            stock: stockValue(d, b),
            spend: equipmentSpend(d, b, s.range),
            complaints: complaintsByCategory(d, b, s.range),
            feedback: feedbackDays(d, b, s.range),
            tickets: openTickets(d, b),
            previous: s.previous
                ? { spend: equipmentSpend(d, b, s.previous), complaints: complaintsByCategory(d, b, s.previous), feedback: feedbackDays(d, b, s.previous) }
                : null
        })
};

function branchesOf(d: MockDb, oids: readonly string[]): ReportBranch[] {
    return d.branches
        .filter(x => x.kind === 'BRANCH' && oids.includes(x.oid))
        .map(x => ({ oid: x.oid, code: x.code, name: x.name }))
        .sort((a, z) => a.name.localeCompare(z.name));
}

export function mockReport(key: defs.ReportKey, branchOids: readonly string[], range: Range, compare: boolean, d: MockDb = db()): Report {
    const branches = branchesOf(d, branchOids);
    const scope: defs.Scope = { branches, range, previous: compare ? previousRange(range) : null };
    return defs.frame(key, scope, LOADERS[key](d, new Set(branches.map(x => x.oid)), scope));
}

export function mockTrainerReport(branchOid: string, trainerOid: string, range: Range, d: MockDb = db()): Report {
    const b = new Set([branchOid]);
    return defs.trainerNumbers(
        { branches: branchesOf(d, [branchOid]), range, previous: null },
        { rows: trainerRows(d, b, range, trainerOid), days: ptDays(d, b, range, trainerOid) }
    );
}
