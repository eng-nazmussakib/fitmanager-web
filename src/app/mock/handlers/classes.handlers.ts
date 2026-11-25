import { HttpResponse } from '@angular/common/http';

import { type Ctx, fail, ok, qStr, type Route, str } from '../http';
import { toRef } from '../seed/organisation.seed';
import { commit, db, newOid } from '../store';
import { photosOf } from './website.handlers';

function branches(ctx: Ctx): HttpResponse<unknown> {
    const allowed = new Set(ctx.user!.assignments.map(a => a.branch.oid));
    return ok(db().branches.filter(b => allowed.has(b.oid)));
}

function branch(ctx: Ctx): HttpResponse<unknown> {
    const b = db().branches.find(x => x.oid === ctx.params[0]);
    if (!b || !ctx.user!.assignments.some(a => a.branch.oid === b.oid)) fail(404, 'Branch not found');
    return ok(b);
}

/* ---------- public (prerendered pages and the join form) ---------- */

function publicBranches(): HttpResponse<unknown> {
    return ok(db().branches.filter(b => b.kind === 'BRANCH'));
}

function publicBranch(ctx: Ctx): HttpResponse<unknown> {
    const b = db().branches.find(x => x.kind === 'BRANCH' && x.slug === ctx.params[0]);
    if (!b) fail(404, 'Branch not found');
    return ok({
        ...b,
        trainers: db()
            .trainers.filter(t => t.branch_oid === b.oid)
            .map(t => ({ ...t, phone: '' })),
        // Phase 7c (D-109): its photos.
        photos: photosOf(b.slug)
    });
}

function publicPlans(ctx: Ctx): HttpResponse<unknown> {
    const slug = qStr(ctx, 'branch');
    const list = db().branches.filter(b => b.kind === 'BRANCH' && (!slug || b.slug === slug));
    const settings = db().settings;
    if (slug && !list.length) fail(404, 'Branch not found');
    return ok(
        list.map(b => ({
            branch: toRef(b),
            plans: db().plans.filter(p => p.branch_oid === b.oid && p.sellable && p.kind !== 'pt'),
            vat_rate: settings.vat_rate,
            vat_inclusive: settings.vat_inclusive
        }))
    );
}

function enquiry(ctx: Ctx): HttpResponse<unknown> {
    const name = str(ctx.body['name']);
    const phone = str(ctx.body['phone']).replace(/\D/g, '');
    const b = db().branches.find(x => x.kind === 'BRANCH' && x.slug === str(ctx.body['branch']));
    if (name.length < 3) fail(400, 'Enter your name.');
    if (!/^01[3-9]\d{8}$/.test(phone)) fail(400, 'Enter a valid Bangladeshi mobile number, e.g. 01712345678.');
    if (!b) fail(400, 'Choose a branch.');
    commit({
        t: 'enquiry.create',
        row: { oid: newOid('enq'), branch_oid: b.oid, name, phone, message: str(ctx.body['message']).slice(0, 500), at: ctx.now.iso }
    });
    return ok({ received: true }, `Thanks, ${name.split(' ')[0]}. The ${b.name} team will call you within a day.`);
}

/** Sign-up: the request waits for the branch's front desk, where the member pays and gets a card (D-022). */
function joinRequest(ctx: Ctx): HttpResponse<unknown> {
    if (str(ctx.body['phone']) === '01700000000') fail(409, 'This mobile number already has an account. Sign in instead.');
    return ok({ id: `JR-${Date.now().toString(36).toUpperCase()}`, status: 'pending' }, 'Request received');
}

export const CLASS_ROUTES: Route[] = [
    { method: 'GET', path: /^\/v1\/branches$/, scope: 'user', handler: branches },
    { method: 'GET', path: /^\/v1\/branches\/([\w-]+)$/, scope: 'user', handler: branch },
    { method: 'GET', path: /^\/v1\/public\/branches$/, scope: 'public', handler: publicBranches },
    { method: 'GET', path: /^\/v1\/public\/branches\/([\w-]+)$/, scope: 'public', handler: publicBranch },
    { method: 'GET', path: /^\/v1\/public\/plans$/, scope: 'public', handler: publicPlans },
    { method: 'POST', path: /^\/v1\/public\/enquiries$/, scope: 'public', handler: enquiry },
    { method: 'POST', path: /^\/v1\/public\/join-requests$/, scope: 'public', handler: joinRequest }
];
