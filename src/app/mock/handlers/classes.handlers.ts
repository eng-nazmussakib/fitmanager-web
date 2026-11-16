import { HttpResponse } from '@angular/common/http';

import type { Booking, BookingStatus, ClassSession, ClassSessionDetail } from '@core/models/class.model';

import { type Ctx, fail, ok, qStr, type Route, str } from '../http';
import { idx, memberState } from '../queries';
import { addDaysIso, dateOf, weekStart } from '../seed/clock';
import { toRef } from '../seed/organisation.seed';
import { commit, db, newOid } from '../store';

/** Sessions of one week (Saturday to Friday) at a branch; `week` is any date in it. */
export function weekSessions(branchOid: string, week: string): { from: string; to: string; sessions: ClassSession[] } {
    const from = weekStart(week || new Date().toISOString().slice(0, 10));
    const to = addDaysIso(from, 6);
    const sessions = db()
        .sessions.filter(s => s.branch_oid === branchOid && dateOf(s.starts_at) >= from && dateOf(s.starts_at) <= to)
        .sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1));
    return { from, to, sessions };
}

export function sessionDetail(s: ClassSession): ClassSessionDetail {
    const list = db().bookings.filter(b => b.session_oid === s.oid && b.status !== 'Cancelled');
    return {
        ...s,
        roster: list.filter(b => b.status !== 'Waitlist'),
        waitlisted: list.filter(b => b.status === 'Waitlist').sort((a, b) => (a.booked_at < b.booked_at ? -1 : 1))
    };
}

function schedule(ctx: Ctx): HttpResponse<unknown> {
    const result = weekSessions(ctx.branch!.oid, qStr(ctx, 'week') || ctx.now.date);
    const trainer = qStr(ctx, 'trainer');
    return ok({
        ...result,
        sessions: trainer ? result.sessions.filter(s => s.trainer_oid === trainer) : result.sessions,
        types: db().classTypes,
        trainers: db().trainers.filter(t => t.branch_oid === ctx.branch!.oid),
        my_trainer_oid: ctx.account?.trainer_oid ?? null
    });
}

function branchSession(ctx: Ctx, oid: string): ClassSession {
    const s = db().sessions.find(x => x.oid === oid && x.branch_oid === ctx.branch!.oid);
    if (!s) fail(404, 'Class not found');
    return s;
}

/**
 * Book a member, or put them on the waitlist when the class is full. Ladies-only classes take women only; a
 * member must have a running membership; the same member is never booked twice.
 */
export function book(sessionOid: string, memberOid: string, today: string, nowIso: string): Booking {
    const s = db().sessions.find(x => x.oid === sessionOid);
    if (!s) fail(404, 'Class not found');
    const m = idx().members.get(memberOid);
    if (m?.branch_oid !== s.branch_oid) fail(404, 'Member not found at this branch');
    if (s.ladies_only && m.gender !== 'Female') fail(409, 'This is a ladies-only class.');
    if (dateOf(s.starts_at) < today) fail(409, 'This class has already taken place.');
    const state = memberState(m, today);
    if (state.status !== 'Active') fail(409, `${m.name} has no active membership (${state.status.toLowerCase()}).`);
    if (db().bookings.some(b => b.session_oid === s.oid && b.member_oid === m.oid && b.status !== 'Cancelled'))
        fail(409, `${m.name} is already booked on this class.`);
    const booking: Booking = {
        oid: newOid('bk'),
        session_oid: s.oid,
        member_oid: m.oid,
        member_name: m.name,
        member_code: m.code,
        status: s.booked < s.capacity ? 'Booked' : 'Waitlist',
        booked_at: nowIso
    };
    commit({ t: 'booking.create', booking });
    return booking;
}

function bookMember(ctx: Ctx): HttpResponse<unknown> {
    const s = branchSession(ctx, ctx.params[0]);
    const booking = book(s.oid, str(ctx.body['member_oid']), ctx.now.date, ctx.now.iso);
    return ok(booking, booking.status === 'Waitlist' ? `${booking.member_name} added to the waitlist` : `${booking.member_name} booked`);
}

/** Mark attendance from the roster, cancel, or promote someone from the waitlist. */
function setStatus(ctx: Ctx): HttpResponse<unknown> {
    const b = db().bookings.find(x => x.oid === ctx.params[0]);
    if (!b) fail(404, 'Booking not found');
    const s = branchSession(ctx, b.session_oid);
    const status = str(ctx.body['status']) as BookingStatus;
    if (!['Booked', 'Attended', 'NoShow', 'Cancelled'].includes(status)) fail(400, 'Unknown booking status');
    if (b.status === 'Waitlist' && status === 'Booked' && s.booked >= s.capacity)
        fail(409, 'The class is full. Cancel a booking first, or raise the capacity.');
    commit({ t: 'booking.status', oid: b.oid, status });
    return ok(b, status === 'Booked' ? `${b.member_name} moved from the waitlist` : `Marked ${status === 'NoShow' ? 'no-show' : status.toLowerCase()}`);
}

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
            .map(t => ({ ...t, phone: '' }))
    });
}

function publicPlans(ctx: Ctx): HttpResponse<unknown> {
    const slug = qStr(ctx, 'branch');
    const list = db().branches.filter(b => b.kind === 'BRANCH' && (!slug || b.slug === slug));
    const vat = db().settings.vat_rate;
    return ok(list.map(b => ({ branch: toRef(b), plans: db().plans.filter(p => p.branch_oid === b.oid && p.active), vat_rate: vat })));
}

function publicClasses(ctx: Ctx): HttpResponse<unknown> {
    const b = db().branches.find(x => x.kind === 'BRANCH' && x.slug === qStr(ctx, 'branch'));
    if (!b) fail(404, 'Branch not found');
    const week = weekSessions(b.oid, qStr(ctx, 'week') || ctx.now.date);
    return ok({ ...week, sessions: week.sessions.map(s => ({ ...s, booked: 0, waitlist: 0 })) });
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
    { method: 'GET', path: /^\/v1\/classes\/schedule$/, scope: 'branch', can: ['read', 'Class'], handler: schedule },
    {
        method: 'GET',
        path: /^\/v1\/classes\/sessions\/([\w-]+)$/,
        scope: 'branch',
        can: ['read', 'Class'],
        handler: ctx => ok(sessionDetail(branchSession(ctx, ctx.params[0])))
    },
    { method: 'POST', path: /^\/v1\/classes\/sessions\/([\w-]+)\/bookings$/, scope: 'branch', can: ['create', 'Booking'], handler: bookMember },
    { method: 'PATCH', path: /^\/v1\/classes\/bookings\/([\w-]+)$/, scope: 'branch', can: ['update', 'Booking'], handler: setStatus },
    { method: 'GET', path: /^\/v1\/branches$/, scope: 'user', handler: branches },
    { method: 'GET', path: /^\/v1\/branches\/([\w-]+)$/, scope: 'user', handler: branch },
    { method: 'GET', path: /^\/v1\/public\/branches$/, scope: 'public', handler: publicBranches },
    { method: 'GET', path: /^\/v1\/public\/branches\/([\w-]+)$/, scope: 'public', handler: publicBranch },
    { method: 'GET', path: /^\/v1\/public\/plans$/, scope: 'public', handler: publicPlans },
    { method: 'GET', path: /^\/v1\/public\/classes$/, scope: 'public', handler: publicClasses },
    { method: 'POST', path: /^\/v1\/public\/enquiries$/, scope: 'public', handler: enquiry },
    { method: 'POST', path: /^\/v1\/public\/join-requests$/, scope: 'public', handler: joinRequest }
];
