import { HttpResponse } from '@angular/common/http';

import type { MemberListItem, MemberStatus, TimelineEvent } from '@core/models/member.model';

import { recordAudit } from '../audit';
import { clock12, shortDate } from '../domain/access-rules';
import { type Ctx, fail, num, ok, page, qStr, type Route, sortBy, str } from '../http';
import { idx, listItem, memberDetail, memberState } from '../queries';
import { addDaysIso, dateOf, timeOf } from '../seed/clock';
import { commit, db, newOid } from '../store';
import type { MemberRow } from '../types';
import { photoUrl } from './core.handlers';
import { acceptAllOnPaper } from './governance.handlers';

/** A member of the request's branch, or 404 (never another branch's: tenancy). */
export function branchMember(ctx: Ctx, oid: string): MemberRow {
    const m = idx().members.get(oid);
    if (!m || m.branch_oid !== ctx.branch?.oid) fail(404, 'Member not found');
    return m;
}

const PHONE = /^01[3-9]\d{8}$/;

/** `GET /v1/members` (also paged through by the member export). */
export function list(ctx: Ctx): HttpResponse<unknown> {
    const today = ctx.now.date;
    const q = qStr(ctx, 'q').toLowerCase();
    const digits = q.replace(/\D/g, '');
    const status = qStr(ctx, 'status') as MemberStatus | '';
    const plan = qStr(ctx, 'plan');
    const flag = qStr(ctx, 'flag');
    let rows: MemberListItem[] = db()
        .members.filter(m => m.branch_oid === ctx.branch!.oid)
        .map(m => listItem(m, today))
        .filter(
            m =>
                (!q || m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q) || (digits.length >= 3 && (m.phone ?? '').includes(digits))) &&
                (!status || m.status === status) &&
                (!plan || (m.plan_name ?? '').toLowerCase().startsWith(plan.toLowerCase())) &&
                (flag !== 'expiring' || (m.status === 'Active' && m.days_left !== null && m.days_left >= 0 && m.days_left <= 7)) &&
                (flag !== 'dues' || m.dues > 0)
        );
    rows = qStr(ctx, 'sort_by')
        ? sortBy(rows, ctx, ['name', 'code', 'status', 'valid_until', 'days_left', 'dues', 'last_visit', 'joined_on'])
        : [...rows].sort((a, b) => (a.code < b.code ? 1 : -1));
    const counts: Record<string, number> = {};
    for (const m of db().members.filter(x => x.branch_oid === ctx.branch!.oid)) {
        const s = memberState(m, today).status;
        counts[s] = (counts[s] ?? 0) + 1;
    }
    return ok({ ...page(rows, ctx), counts });
}

/** Barcode scanner: an exact member code at this branch. */
function lookup(ctx: Ctx): HttpResponse<unknown> {
    const code = qStr(ctx, 'code').toUpperCase();
    const m = idx().byCode.get(code);
    if (m?.branch_oid !== ctx.branch!.oid) fail(404, `No member with code ${code} at this branch`);
    return ok(listItem(m, ctx.now.date));
}

function detail(ctx: Ctx): HttpResponse<unknown> {
    return ok(memberDetail(branchMember(ctx, ctx.params[0]), ctx.now.date));
}

function validate(body: Record<string, unknown>, partial: boolean): Partial<MemberRow> {
    const out: Partial<MemberRow> = {};
    const name = str(body['name']);
    const phone = str(body['phone']).replace(/\D/g, '').replace(/^880/, '0');
    if (!partial || 'name' in body) {
        if (name.length < 3) fail(400, 'Enter the member’s full name.');
        out.name = name;
    }
    if (!partial || 'phone' in body) {
        if (!PHONE.test(phone)) fail(400, 'Enter a valid Bangladeshi mobile number, e.g. 01712345678.');
        out.phone = phone;
    }
    if ('gender' in body) out.gender = body['gender'] === 'Female' ? 'Female' : 'Male';
    if ('email' in body) out.email = str(body['email']) || null;
    if ('date_of_birth' in body) out.date_of_birth = str(body['date_of_birth']) || null;
    if ('address' in body) out.address = str(body['address']) || null;
    if ('emergency_contact' in body) out.emergency_contact = (body['emergency_contact'] as MemberRow['emergency_contact']) ?? null;
    if ('health_flags' in body)
        out.health_flags = Array.isArray(body['health_flags']) ? (body['health_flags'] as string[]).filter(f => typeof f === 'string') : [];
    if ('health_declared' in body) out.health_declared = body['health_declared'] === true;

    return out;
}

/** `photo_file_oid` from an upload → the photo's link; `null` removes the photo. */
function photoOf(ctx: Ctx): Partial<MemberRow> {
    if (!('photo_file_oid' in ctx.body)) return {};
    const oid = str(ctx.body['photo_file_oid']);
    return { photo_url: oid ? photoUrl(ctx, oid) : null };
}

function create(ctx: Ctx): HttpResponse<unknown> {
    const fields = { ...validate(ctx.body, false), ...photoOf(ctx) };
    if (!fields.health_declared) fail(400, 'The member must sign the health declaration.');
    const d = db();
    // One mobile number, one member, across every branch.
    if (d.members.some(m => m.phone === fields.phone)) fail(409, 'This mobile number already belongs to a member (at this or another branch).');
    const code = ctx.branch!.code;
    const seq = (d.counters[`member:${code}`] ?? 0) + 1;
    const row: MemberRow = {
        oid: newOid('mem'),
        code: `MEM-${code}-${String(seq).padStart(6, '0')}`,
        branch_oid: ctx.branch!.oid,
        name: fields.name!,
        phone: fields.phone!,
        gender: fields.gender ?? 'Male',
        email: fields.email ?? null,
        date_of_birth: fields.date_of_birth ?? null,
        address: fields.address ?? null,
        emergency_contact: fields.emergency_contact ?? null,
        health_flags: fields.health_flags ?? [],
        health_declared: true,
        photo_url: fields.photo_url ?? null,
        joined_on: ctx.now.date,
        // No subscription yet: the membership starts with the first payment.
        pending: true,
        trainer_oid: null,
        notes: null,
        regularity: 0.5,
        habit_minutes: 18 * 60
    };
    commit({ t: 'member.create', row, seq });
    recordAudit(ctx, 'create', 'member', row.code, null, { name: row.name });
    // Signed the policies on paper at the desk: recorded as accepted.
    if (ctx.body['policies_signed'] === true) acceptAllOnPaper(ctx, row);
    return ok(memberDetail(row, ctx.now.date), `Member ${row.code} created`);
}

function update(ctx: Ctx): HttpResponse<unknown> {
    const m = branchMember(ctx, ctx.params[0]);
    if (m.anonymised) fail(409, 'This member was anonymised: the record cannot be changed');
    const patch = { ...validate(ctx.body, true), ...photoOf(ctx) };
    commit({ t: 'member.update', oid: m.oid, patch });
    return ok(memberDetail(m, ctx.now.date), 'Member updated');
}

/** The member's history, newest first: joined, subscriptions, payments, freezes, visits (last 10), overrides, notes. */
function timeline(ctx: Ctx): HttpResponse<unknown> {
    const m = branchMember(ctx, ctx.params[0]);
    const d = db();
    const i = idx();
    const events: TimelineEvent[] = [
        { oid: `${m.oid}-joined`, kind: 'joined', at: `${m.joined_on}T09:00:00+06:00`, title: 'Joined', detail: `Member code ${m.code}`, by: null }
    ];
    for (const s of i.subs.get(m.oid) ?? []) {
        events.push({
            oid: `${s.oid}-tl`,
            kind: 'subscription',
            at: s.created_at,
            title: `Subscribed: ${s.plan_name}`,
            detail: `${shortDate(s.start_date)} to ${shortDate(s.end_date)}`,
            by: null
        });
        for (const f of s.freezes)
            events.push({
                oid: `${s.oid}-${f.from}`,
                kind: 'freeze',
                at: `${f.from}T09:00:00+06:00`,
                title: 'Membership frozen',
                detail: `${shortDate(f.from)} to ${shortDate(f.to)}: ${f.reason}`,
                by: null
            });
    }
    for (const inv of i.invoices.get(m.oid) ?? []) {
        for (const p of inv.payments)
            events.push({
                oid: p.oid,
                kind: 'payment',
                at: p.received_at,
                title: `Payment ৳${p.amount.toLocaleString('en-IN')} (${p.method})`,
                detail: `${inv.number}${p.reference ? ` · ref ${p.reference}` : ''}`,
                by: p.received_by
            });
    }
    const visits = d.checkIns.filter(c => c.member_oid === m.oid);
    for (const c of visits.filter(c => c.override)) {
        events.push({ oid: `${c.oid}-ov`, kind: 'override', at: c.in_at, title: 'Check-in override', detail: c.override!.reason, by: c.override!.by });
    }
    for (const c of visits.slice(-10))
        events.push({
            oid: c.oid,
            kind: 'check_in',
            at: c.in_at,
            title: 'Checked in',
            detail: c.out_at ? `${clock12(timeOf(c.in_at))} to ${clock12(timeOf(c.out_at))}` : `${clock12(timeOf(c.in_at))}, still inside`,
            by: c.by
        });
    // Sanctions and policy acceptances, as the API's timeline lists them.
    const LEVEL = { verbal: 'Verbal warning', written: 'Written warning', suspension: 'Suspended', ban: 'Banned' } as const;
    for (const x of (d.sanctions ?? []).filter(s => s.member_oid === m.oid)) {
        const where = d.branches.find(b => b.oid === x.branch_oid)?.name ?? '';
        const reach =
            x.level === 'suspension'
                ? ` (${shortDate(x.starts_on)} to ${shortDate(x.ends_on ?? x.starts_on)})`
                : x.level === 'ban' && x.scope === 'all'
                  ? ' at every branch'
                  : ` at ${where}`;
        events.push({
            oid: x.oid,
            kind: 'discipline',
            at: `${x.given_on}T18:30:00+06:00`,
            title: `${LEVEL[x.level]}${reach}`,
            detail: x.reason,
            by: x.given_by_name
        });
        if (x.overturned_at)
            events.push({ oid: `${x.oid}-ot`, kind: 'discipline', at: x.overturned_at, title: 'Overturned on appeal', detail: LEVEL[x.level], by: null });
        if (x.lifted) events.push({ oid: `${x.oid}-lift`, kind: 'discipline', at: x.lifted.at, title: 'Ban lifted', detail: x.lifted.reason, by: x.lifted.by });
    }
    for (const a of (d.acceptances ?? []).filter(x => x.member_oid === m.oid)) {
        const p = d.policies.find(x => x.oid === a.policy_oid);
        events.push({
            oid: a.oid,
            kind: 'policy',
            at: a.accepted_at,
            title: `Accepted ${p?.title ?? 'a policy'} v${a.version}`,
            detail: a.method === 'paper' ? 'Signed on paper at the desk' : 'Accepted in the member portal',
            by: a.recorded_by_name
        });
    }
    for (const n of d.notes.filter(n => n.member_oid === m.oid))
        events.push({ oid: n.oid, kind: 'note', at: n.at, title: n.title, detail: n.detail, by: n.by });
    events.sort((a, b) => (a.at < b.at ? 1 : -1));
    return ok(events);
}

function subscriptions(ctx: Ctx): HttpResponse<unknown> {
    const m = branchMember(ctx, ctx.params[0]);
    const today = ctx.now.date;
    const used = (s: { oid: string }): number => db().ptSessions.filter(p => p.subscription_oid === s.oid && p.charged).length;
    const list = [...(idx().allSubs.get(m.oid) ?? [])].reverse().map(s => ({
        ...s,
        sessions_used: s.kind === 'pt' ? used(s) : 0,
        sessions_left: s.kind === 'pt' && s.sessions ? Math.max(0, s.sessions - used(s)) : null,
        status: s.start_date > today ? 'Upcoming' : s.end_date < today ? 'Expired' : s.freezes.some(f => f.from <= today && today <= f.to) ? 'Frozen' : 'Active'
    }));
    return ok(list);
}

function invoices(ctx: Ctx): HttpResponse<unknown> {
    const m = branchMember(ctx, ctx.params[0]);
    return ok([...(idx().invoices.get(m.oid) ?? [])].sort((a, b) => (a.issued_at < b.issued_at ? 1 : -1)));
}

/** Visit days for the calendar heatmap: `{ date, count }` for the last `days` days. */
function attendance(ctx: Ctx): HttpResponse<unknown> {
    const m = branchMember(ctx, ctx.params[0]);
    const days = Math.min(num(ctx.query.get('days')) || 84, 366);
    const from = addDaysIso(ctx.now.date, -days + 1);
    const counts = new Map<string, number>();
    for (const c of db().checkIns) if (c.member_oid === m.oid && dateOf(c.in_at) >= from) counts.set(dateOf(c.in_at), (counts.get(dateOf(c.in_at)) ?? 0) + 1);
    return ok({ from, to: ctx.now.date, days: [...counts].map(([date, count]) => ({ date, count })) });
}

export const MEMBER_ROUTES: Route[] = [
    { method: 'GET', path: /^\/v1\/members$/, scope: 'branch', can: ['read', 'Member'], handler: list },
    { method: 'GET', path: /^\/v1\/members\/lookup$/, scope: 'branch', can: ['read', 'Member'], handler: lookup },
    { method: 'POST', path: /^\/v1\/members$/, scope: 'branch', can: ['create', 'Member'], handler: create },
    { method: 'GET', path: /^\/v1\/members\/([\w-]+)$/, scope: 'branch', can: ['read', 'Member'], handler: detail },
    { method: 'PATCH', path: /^\/v1\/members\/([\w-]+)$/, scope: 'branch', can: ['update', 'Member'], handler: update },
    { method: 'GET', path: /^\/v1\/members\/([\w-]+)\/timeline$/, scope: 'branch', can: ['read', 'Member'], handler: timeline },
    { method: 'GET', path: /^\/v1\/members\/([\w-]+)\/subscriptions$/, scope: 'branch', can: ['read', 'Subscription'], handler: subscriptions },
    { method: 'GET', path: /^\/v1\/members\/([\w-]+)\/invoices$/, scope: 'branch', can: ['read', 'Invoice'], handler: invoices },
    { method: 'GET', path: /^\/v1\/members\/([\w-]+)\/attendance$/, scope: 'branch', can: ['read', 'Attendance'], handler: attendance }
];
