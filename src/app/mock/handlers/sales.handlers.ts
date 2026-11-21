import { HttpResponse } from '@angular/common/http';

import type { BranchRef } from '@core/models/branch.model';
import type { CashClosing, Invoice, PaymentRecord } from '@core/models/payment.model';
import type { Plan } from '@core/models/plan.model';
import { type DiscountKind, METHODS_NEEDING_REFERENCE, type PaymentMethod, type Subscription } from '@core/models/subscription.model';

import { daysBetween } from '../domain/access-rules';
import { endDate, quote } from '../domain/pricing';
import { type Ctx, fail, num, ok, type Route, str } from '../http';
import { idx, memberState } from '../queries';
import { addDaysIso, dateOf } from '../seed/clock';
import { toRef } from '../seed/organisation.seed';
import { commit, db, newOid } from '../store';
import { branchMember } from './members.handlers';
import { staffTakings } from './phase2.handlers';

const METHODS: PaymentMethod[] = ['cash', 'card', 'bkash', 'nagad', 'bank'];

function branchPlan(ctx: Ctx, oid: string): Plan {
    const plan = db().plans.find(p => p.oid === oid && p.branch_oid === ctx.branch!.oid && p.sellable);
    if (!plan) fail(404, 'Plan not found at this branch');
    return plan;
}

interface SaleInput {
    member_oid: string;
    plan_oid: string;
    start_date: string;
    discount: { kind: DiscountKind; value: number; code?: string };
    charge_admission: boolean;
}

function readSale(ctx: Ctx): SaleInput {
    const discount = (ctx.body['discount'] as SaleInput['discount'] | undefined) ?? { kind: 'none', value: 0 };
    const start = str(ctx.body['start_date']) || ctx.now.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) fail(400, 'Choose a valid start date.');
    if (start < addDaysIso(ctx.now.date, -7)) fail(400, 'A membership cannot start more than 7 days in the past.');
    return {
        member_oid: str(ctx.body['member_oid']),
        plan_oid: str(ctx.body['plan_oid']),
        start_date: start,
        discount,
        charge_admission: ctx.body['charge_admission'] === true
    };
}

function priceOf(ctx: Ctx, sale: SaleInput, plan: Plan): ReturnType<typeof quote> {
    // Discounts above 20% need a manager (the same rule the API will apply).
    const big = (sale.discount.kind === 'percent' && sale.discount.value > 20) || (sale.discount.kind === 'amount' && sale.discount.value > plan.price * 0.2);
    if (big && !ctx.ability.can('manage', 'Subscription')) fail(403, 'Discounts above 20% need a branch manager.');
    return quote({
        plan_name: plan.name,
        price: plan.price,
        months: plan.months,
        admission_fee: plan.admission_fee,
        charge_admission: sale.charge_admission,
        discount: sale.discount,
        start_date: sale.start_date,
        today: ctx.now.date,
        vat_rate: db().settings.vat_rate,
        vat_inclusive: db().settings.vat_inclusive,
        promos: db().promos.filter(p => p.active)
    });
}

/** Admission is due for a new member and for one whose last plan ended more than 30 days ago. */
function admissionDue(memberOid: string, start: string): boolean {
    const last = idx().subs.get(memberOid)?.at(-1);
    return !last || daysBetween(last.end_date, start) > 30;
}

function plans(ctx: Ctx): HttpResponse<unknown> {
    return ok(db().plans.filter(p => p.branch_oid === ctx.branch!.oid && p.active));
}

function templates(): HttpResponse<unknown> {
    return ok(db().templates);
}

function quoteHandler(ctx: Ctx): HttpResponse<unknown> {
    const sale = readSale(ctx);
    const member = branchMember(ctx, sale.member_oid);
    const plan = branchPlan(ctx, sale.plan_oid);
    // Renewals start the day after the running plan ends, unless the desk chose a date.
    const q = priceOf(ctx, sale, plan);
    return ok({ ...q, admission_suggested: admissionDue(member.oid, sale.start_date) });
}

function createSale(ctx: Ctx): HttpResponse<unknown> {
    const sale = readSale(ctx);
    const member = branchMember(ctx, sale.member_oid);
    const status = memberState(member, ctx.now.date).status;
    if (status === 'Suspended') fail(409, 'This member is suspended. Sell after the suspension ends.');
    if (status === 'Banned') fail(409, 'This member is banned from their home branch.');
    const plan = branchPlan(ctx, sale.plan_oid);
    const q = priceOf(ctx, sale, plan);
    if (q.promo_error) fail(400, q.promo_error);
    const pay = ctx.body['payment'] as { method?: PaymentMethod; amount?: number; reference?: string } | undefined;
    const amount = Math.round(num(pay?.amount));
    const method = pay?.method ?? 'cash';
    if (!METHODS.includes(method)) fail(400, 'Choose a payment method.');
    if (amount < 0 || amount > q.total) fail(400, `The payment must be between ৳0 and ৳${q.total.toLocaleString('en-IN')}.`);
    if (amount > 0 && METHODS_NEEDING_REFERENCE.includes(method) && !str(pay?.reference)) fail(400, 'Enter the transaction reference for this payment method.');
    // Memberships may not overlap; a PT package runs next to one, and only with one (D-079).
    const memberships = idx().subs.get(member.oid) ?? [];
    if (plan.kind === 'pt' && !memberships.some(s => !s.cancelled_at && s.end_date >= sale.start_date))
        fail(409, 'A PT package goes with a membership. Sell the membership first.');
    const overlapping =
        plan.kind === 'pt' ? undefined : memberships.find(s => s.end_date >= sale.start_date && s.start_date <= endDate(sale.start_date, plan.months));
    if (overlapping) fail(409, `This overlaps the ${overlapping.plan_name} plan that runs until ${overlapping.end_date}. Start the day after.`);

    const d = db();
    const branch = d.branches.find(b => b.oid === ctx.branch!.oid)!;
    const invoiceSeq = (d.counters[`invoice:${branch.code}`] ?? 0) + 1;
    const invoiceOid = newOid('inv');
    const receivedBy = ctx.user!.name;
    const payments: PaymentRecord[] =
        amount > 0
            ? [
                  {
                      oid: newOid('pay'),
                      invoice_oid: invoiceOid,
                      amount,
                      method,
                      reference: str(pay?.reference) || null,
                      received_at: ctx.now.iso,
                      received_by: receivedBy
                  }
              ]
            : [];
    const invoice: Invoice = {
        oid: invoiceOid,
        number: `INV-${branch.code}-${ctx.now.date.slice(0, 4)}-${String(invoiceSeq).padStart(5, '0')}`,
        branch: toRef(branch),
        member_oid: member.oid,
        member_name: member.name,
        member_code: member.code,
        member_phone: member.phone,
        issued_at: ctx.now.iso,
        lines: q.discount ? [...q.lines, { label: q.discount_label ?? 'Discount', amount: -q.discount }] : q.lines,
        subtotal: q.subtotal,
        discount: q.discount,
        vat_rate: q.vat_rate,
        vat_bin: db().settings.vat_bin,
        vat: q.vat,
        total: q.total,
        paid: amount,
        due: q.total - amount,
        status: amount >= q.total ? 'Paid' : amount > 0 ? 'Partial' : 'Due',
        payments
    };
    const sub: Subscription = {
        oid: newOid('sub'),
        member_oid: member.oid,
        plan_oid: plan.oid,
        plan_name: plan.name,
        start_date: sale.start_date,
        end_date: q.end_date,
        status: sale.start_date > ctx.now.date ? 'Upcoming' : 'Active',
        total: q.total,
        paid: amount,
        due: q.total - amount,
        invoice_oid: invoiceOid,
        freezes: [],
        created_at: ctx.now.iso,
        freezable: plan.kind !== 'pt' && plan.freezable,
        kind: plan.kind,
        sessions: plan.sessions
    };
    commit({ t: 'subscription.create', sub, invoice, invoiceSeq });
    return ok(
        { subscription: sub, invoice },
        invoice.due ? `Membership sold. ৳${invoice.due.toLocaleString('en-IN')} recorded as dues.` : 'Membership sold and paid'
    );
}

function freeze(ctx: Ctx): HttpResponse<unknown> {
    const sub = db().subscriptions.find(s => s.oid === ctx.params[0]);
    if (!sub) fail(404, 'Subscription not found');
    branchMember(ctx, sub.member_oid);
    const from = str(ctx.body['from']) || ctx.now.date;
    const days = Math.round(num(ctx.body['days']));
    const reason = str(ctx.body['reason']);
    // The rule is HQ's (D-063, D-067 e): the range and count from the settings, `freezable` from the plan's template.
    const { freeze_min_days: min, freeze_max_days: max, freeze_max_count: count } = db().settings;
    const plan = db().plans.find(p => p.oid === sub.plan_oid);
    if (plan && !plan.freezable) fail(409, 'This plan cannot be frozen.');
    if (days < min || days > max) fail(400, `A freeze lasts ${min} to ${max} days.`);
    if (!reason) fail(400, 'Give a reason for the freeze.');
    if (from < ctx.now.date || from > sub.end_date) fail(400, 'The freeze must start today or later, before the plan ends.');
    if (sub.freezes.length >= count) fail(409, count === 1 ? 'This plan has already been frozen once.' : `This plan has already been frozen ${count} times.`);
    const to = addDaysIso(from, days - 1);
    commit({ t: 'subscription.freeze', oid: sub.oid, freeze: { from, to, reason }, end_date: addDaysIso(sub.end_date, days) });
    return ok(sub, `Frozen until ${to}; the plan now ends ${addDaysIso(sub.end_date, 0)}`);
}

/** Pay towards an invoice's dues. */
function pay(ctx: Ctx): HttpResponse<unknown> {
    const inv = db().invoices.find(i => i.oid === str(ctx.body['invoice_oid']));
    if (inv?.branch.oid !== ctx.branch!.oid) fail(404, 'Invoice not found');
    const amount = Math.round(num(ctx.body['amount']));
    const method = (ctx.body['method'] as PaymentMethod) ?? 'cash';
    if (!METHODS.includes(method)) fail(400, 'Choose a payment method.');
    if (amount <= 0 || amount > inv.due) fail(400, `Enter an amount between ৳1 and ৳${inv.due.toLocaleString('en-IN')}.`);
    if (METHODS_NEEDING_REFERENCE.includes(method) && !str(ctx.body['reference'])) fail(400, 'Enter the transaction reference for this payment method.');
    const payment: PaymentRecord = {
        oid: newOid('pay'),
        invoice_oid: inv.oid,
        amount,
        method,
        reference: str(ctx.body['reference']) || null,
        received_at: ctx.now.iso,
        received_by: ctx.user!.name
    };
    commit({ t: 'payment.create', invoice_oid: inv.oid, payment });
    return ok(inv, `Payment of ৳${amount.toLocaleString('en-IN')} recorded`);
}

function invoice(ctx: Ctx): HttpResponse<unknown> {
    const inv = db().invoices.find(i => i.oid === ctx.params[0]);
    if (inv?.branch.oid !== ctx.branch!.oid) fail(404, 'Invoice not found');
    return ok(inv);
}

/** Today's takings by method, for the end-of-day cash count. */
function cashClosing(ctx: Ctx): HttpResponse<unknown> {
    const today = ctx.now.date;
    const byMethod = new Map<PaymentMethod, { count: number; amount: number }>();
    let invoicesToday = 0;
    let newMembers = 0;
    let renewals = 0;
    let posSales = 0;
    for (const inv of db().invoices) {
        if (inv.branch.oid !== ctx.branch!.oid) continue;
        if (dateOf(inv.issued_at) === today) {
            invoicesToday++;
            // POS sales (D-102) are counted on their own, not as renewals.
            if (inv.kind === 'pos') posSales++;
            else if (inv.lines.some(l => l.label === 'Admission fee')) newMembers++;
            else renewals++;
        }
        for (const p of inv.payments) {
            if (dateOf(p.received_at) !== today) continue;
            const e = byMethod.get(p.method) ?? { count: 0, amount: 0 };
            e.count++;
            e.amount += p.kind === 'refund' ? -p.amount : p.amount;
            byMethod.set(p.method, e);
        }
    }
    const result: CashClosing = {
        date: today,
        by_method: METHODS.map(method => ({ method, ...(byMethod.get(method) ?? { count: 0, amount: 0 }) })),
        total: [...byMethod.values()].reduce((s, e) => s + e.amount, 0),
        invoices: invoicesToday,
        new_members: newMembers,
        renewals,
        pos_sales: posSales,
        by_staff: staffTakings(ctx)
    };
    return ok(result);
}

/** Recent payments at the branch (payments page). */
function recentPayments(ctx: Ctx): HttpResponse<unknown> {
    const rows: (PaymentRecord & { invoice_number: string; member_name: string; member_oid: string | null; member_code: string; branch: BranchRef })[] = [];
    for (const inv of db().invoices) {
        if (inv.branch.oid !== ctx.branch!.oid) continue;
        for (const p of inv.payments)
            rows.push({
                ...p,
                invoice_number: inv.number,
                member_name: inv.member_name,
                member_oid: inv.member_oid,
                member_code: inv.member_code,
                branch: inv.branch
            });
    }
    rows.sort((a, b) => (a.received_at < b.received_at ? 1 : -1));
    const dues = db()
        .members.filter(m => m.branch_oid === ctx.branch!.oid)
        .map(m => ({ m, dues: memberState(m, ctx.now.date).dues }))
        .filter(x => x.dues > 0)
        .sort((a, b) => b.dues - a.dues)
        .slice(0, 10)
        .map(x => ({ member_oid: x.m.oid, member_name: x.m.name, member_code: x.m.code, dues: x.dues }));
    return ok({ payments: rows.slice(0, 50), top_dues: dues });
}

export const SALES_ROUTES: Route[] = [
    { method: 'GET', path: /^\/v1\/plans$/, scope: 'branch', can: ['read', 'Plan'], handler: plans },
    { method: 'GET', path: /^\/v1\/hq\/plan-templates$/, scope: 'hq', can: ['read', 'PlanTemplate'], handler: templates },
    { method: 'POST', path: /^\/v1\/subscriptions\/quote$/, scope: 'branch', can: ['create', 'Subscription'], handler: quoteHandler },
    { method: 'POST', path: /^\/v1\/subscriptions$/, scope: 'branch', can: ['create', 'Subscription'], handler: createSale },
    { method: 'POST', path: /^\/v1\/subscriptions\/([\w-]+)\/freeze$/, scope: 'branch', can: ['update', 'Subscription'], handler: freeze },
    { method: 'POST', path: /^\/v1\/payments$/, scope: 'branch', can: ['create', 'Payment'], handler: pay },
    { method: 'GET', path: /^\/v1\/payments$/, scope: 'branch', can: ['read', 'Payment'], handler: recentPayments },
    { method: 'GET', path: /^\/v1\/invoices\/([\w-]+)$/, scope: 'branch', can: ['read', 'Invoice'], handler: invoice },
    { method: 'GET', path: /^\/v1\/cash-closing\/today$/, scope: 'branch', can: ['read', 'CashClosing'], handler: cashClosing }
];
