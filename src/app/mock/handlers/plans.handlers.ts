import type { HttpResponse } from '@angular/common/http';

import type { Plan, PlanTemplate } from '@core/models/plan.model';

import { recordAudit } from '../audit';
import type { Promo } from '../domain/pricing';
import { type Ctx, fail, ok, qStr, type Route, str } from '../http';
import { commit, db } from '../store';

/**
 * HQ's plan master data (D-044: only HQ changes prices), as the API's `/v1/hq/plans`, `/v1/hq/plan-templates`
 * and `/v1/hq/promos` (fitmanager-api src/features/plans). Every change writes an audit row at HQ.
 */

type PromoRow = Promo & { active: boolean };

/** The API's wire shape for a promo code (`GET /v1/hq/promos`). */
interface WirePromo {
    code: string;
    label: string;
    percent: number | null;
    amount: number | null;
    waive_admission: boolean;
    valid_from: string;
    valid_to: string;
    active: boolean;
}

function wirePromo(p: PromoRow): WirePromo {
    return {
        code: p.code,
        label: p.label,
        percent: p.percent ?? null,
        amount: p.amount ?? null,
        waive_admission: !!p.waive_admission,
        valid_from: p.from,
        valid_to: p.to,
        active: p.active
    };
}

const taka = (v: unknown, field: string): number => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 10_000_000) fail(400, `${field}: a number of taka, 0 or more.`);
    return Math.round(v);
};
const bool = (v: unknown, field: string): boolean => {
    if (typeof v !== 'boolean') fail(400, `${field}: true or false.`);
    return v;
};

function hqPlans(ctx: Ctx): HttpResponse<unknown> {
    const branch = qStr(ctx, 'branch_oid');
    return ok(db().plans.filter(p => !branch || p.branch_oid === branch));
}

function updatePlan(ctx: Ctx): HttpResponse<unknown> {
    const plan = db().plans.find(p => p.oid === ctx.params[0]);
    if (!plan) fail(404, 'Plan not found');
    const patch: Partial<Pick<Plan, 'price' | 'admission_fee' | 'active'>> = {};
    if ('price' in ctx.body) patch.price = taka(ctx.body['price'], 'price');
    if ('admission_fee' in ctx.body) patch.admission_fee = taka(ctx.body['admission_fee'], 'admission_fee');
    if ('active' in ctx.body) patch.active = bool(ctx.body['active'], 'active');
    if (!Object.keys(patch).length) fail(400, 'Nothing to change');
    const before = { ...plan };
    commit({ t: 'plan.update', oid: plan.oid, patch });
    recordAudit(ctx, 'update', 'plan', plan.code, before, plan);
    return ok(plan, `${plan.code}: saved`);
}

function updateTemplate(ctx: Ctx): HttpResponse<unknown> {
    const tpl = db().templates.find(t => t.oid === ctx.params[0]);
    if (!tpl) fail(404, 'Plan template not found');
    const patch: Partial<PlanTemplate> = {};
    for (const key of ['featured', 'freezable', 'active'] as const) if (key in ctx.body) patch[key] = bool(ctx.body[key], key);
    if ('base_price' in ctx.body) patch.base_price = taka(ctx.body['base_price'], 'base_price');
    for (const key of ['tier_name', 'period_label'] as const) {
        if (!(key in ctx.body)) continue;
        const value = str(ctx.body[key]);
        if (!value || value.length > 60) fail(400, `${key}: 1 to 60 characters.`);
        patch[key] = value;
    }
    if (!Object.keys(patch).length) fail(400, 'Nothing to change');
    const before = { ...tpl };
    commit({ t: 'template.update', oid: tpl.oid, patch });
    recordAudit(ctx, 'update', 'plan_template', `${tpl.tier}/${tpl.period}`, before, tpl);
    return ok(tpl, `${tpl.tier_name} · ${tpl.period_label}: saved`);
}

/** The promo body the API takes: exactly one effect (a percent, an amount, or waiving the admission fee). */
function readPromo(body: Record<string, unknown>, base?: PromoRow): PromoRow {
    const effectSent = 'percent' in body || 'amount' in body || 'waive_admission' in body;
    const percent = effectSent ? (body['percent'] ?? undefined) : base?.percent;
    const amount = effectSent ? (body['amount'] ?? undefined) : base?.amount;
    const waive = effectSent ? body['waive_admission'] === true : !!base?.waive_admission;
    if (percent !== undefined && (typeof percent !== 'number' || percent <= 0 || percent > 100)) fail(400, 'percent: more than 0, at most 100.');
    if (amount !== undefined && (typeof amount !== 'number' || amount <= 0)) fail(400, 'amount: more than 0 taka.');
    if ([percent !== undefined, amount !== undefined, waive].filter(Boolean).length !== 1) {
        fail(400, 'A promo code does exactly one thing: a percent off, an amount off, or no admission fee.');
    }
    const from = 'valid_from' in body ? str(body['valid_from']) : (base?.from ?? '');
    const to = 'valid_to' in body ? str(body['valid_to']) : (base?.to ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) fail(400, 'Dates as YYYY-MM-DD.');
    if (from > to) fail(400, '`valid_from` must not be after `valid_to`');
    const label = 'label' in body ? str(body['label']) : (base?.label ?? '');
    if (!label || label.length > 80) fail(400, 'label: 1 to 80 characters.');
    return {
        code: base?.code ?? str(body['code']).toUpperCase(),
        label,
        ...(percent !== undefined && { percent }),
        ...(amount !== undefined && { amount: Math.round(amount) }),
        ...(waive && { waive_admission: true }),
        from,
        to,
        active: 'active' in body ? bool(body['active'], 'active') : (base?.active ?? true)
    };
}

function createPromo(ctx: Ctx): HttpResponse<unknown> {
    const code = str(ctx.body['code']).toUpperCase();
    if (!/^[A-Z0-9]{3,20}$/.test(code)) fail(400, 'code: 3 to 20 letters or digits.');
    if (db().promos.some(p => p.code === code)) fail(409, 'This promo code exists');
    const promo = readPromo({ ...ctx.body, code });
    commit({ t: 'promo.put', promo });
    recordAudit(ctx, 'create', 'promo', code, null, wirePromo(promo));
    return ok(wirePromo(promo), `${code}: created`);
}

function updatePromo(ctx: Ctx): HttpResponse<unknown> {
    const base = db().promos.find(p => p.code === (ctx.params[0] ?? '').toUpperCase());
    if (!base) fail(404, 'Promo code not found');
    const promo = readPromo(ctx.body, base);
    commit({ t: 'promo.put', promo });
    recordAudit(ctx, 'update', 'promo', promo.code, wirePromo(base), wirePromo(promo));
    return ok(wirePromo(promo), `${promo.code}: saved`);
}

export const PLAN_ROUTES: Route[] = [
    { method: 'GET', path: /^\/v1\/hq\/plans$/, scope: 'hq', can: ['read', 'Plan'], handler: hqPlans },
    { method: 'PATCH', path: /^\/v1\/hq\/plans\/([\w-]+)$/, scope: 'hq', can: ['update', 'Plan'], handler: updatePlan },
    { method: 'PATCH', path: /^\/v1\/hq\/plan-templates\/([\w-]+)$/, scope: 'hq', can: ['update', 'PlanTemplate'], handler: updateTemplate },
    { method: 'GET', path: /^\/v1\/hq\/promos$/, scope: 'hq', can: ['read', 'PlanTemplate'], handler: () => ok(db().promos.map(wirePromo)) },
    { method: 'POST', path: /^\/v1\/hq\/promos$/, scope: 'hq', can: ['create', 'PlanTemplate'], handler: createPromo },
    { method: 'PATCH', path: /^\/v1\/hq\/promos\/(\w+)$/, scope: 'hq', can: ['update', 'PlanTemplate'], handler: updatePromo }
];
