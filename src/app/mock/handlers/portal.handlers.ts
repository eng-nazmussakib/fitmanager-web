import { HttpResponse } from '@angular/common/http';

import type { PortalSummary, Progress, RoutineDay } from '@core/models/portal.model';

import { daysBetween } from '../domain/access-rules';
import { type Ctx, fail, ok, type Route, str } from '../http';
import { idx, memberState } from '../queries';
import { addDaysIso, dateOf, weekStart } from '../seed/clock';
import { commit, db } from '../store';
import type { MemberRow } from '../types';
import { book } from './classes.handlers';

/** The signed-in member (portal routes: scope 'member'). Their branch comes from the account, never a header. */
function me(ctx: Ctx): MemberRow {
    const oid = ctx.user?.member?.oid;
    const m = oid ? idx().members.get(oid) : undefined;
    if (!m) fail(404, 'Member not found');
    return m;
}

/** Consecutive days with a visit, ending today or yesterday. */
function streak(memberOid: string, today: string): number {
    const days = new Set(
        db()
            .checkIns.filter(c => c.member_oid === memberOid)
            .map(c => dateOf(c.in_at))
    );
    let n = 0;
    let day = days.has(today) ? today : addDaysIso(today, -1);
    while (days.has(day)) {
        n++;
        day = addDaysIso(day, -1);
    }
    return n;
}

function upcomingBookings(m: MemberRow, ctx: Ctx): ({ session: ReturnType<typeof db>['sessions'][number] } & ReturnType<typeof db>['bookings'][number])[] {
    const d = db();
    return d.bookings
        .filter(b => b.member_oid === m.oid && (b.status === 'Booked' || b.status === 'Waitlist'))
        .map(b => ({ ...b, session: d.sessions.find(s => s.oid === b.session_oid)! }))
        .filter(b => b.session && b.session.starts_at >= ctx.now.iso)
        .sort((a, b) => (a.session.starts_at < b.session.starts_at ? -1 : 1));
}

function summary(ctx: Ctx): HttpResponse<unknown> {
    const m = me(ctx);
    const s = memberState(m, ctx.now.date);
    const branch = db().branches.find(b => b.oid === m.branch_oid)!;
    const sub = s.current ?? s.relevant;
    const monthStart = `${ctx.now.date.slice(0, 8)}01`;
    const result: PortalSummary = {
        member: { oid: m.oid, code: m.code, name: m.name, photo_url: m.photo_url, branch_name: branch.name, status: s.status },
        subscription: sub,
        days_left: s.days_left,
        days_total: sub ? daysBetween(sub.start_date, sub.end_date) + 1 : null,
        dues: s.dues,
        next_booking: upcomingBookings(m, ctx)[0] ?? null,
        streak_days: streak(m.oid, ctx.now.date),
        visits_this_month: db().checkIns.filter(c => c.member_oid === m.oid && dateOf(c.in_at) >= monthStart).length
    };
    return ok(result);
}

function payments(ctx: Ctx): HttpResponse<unknown> {
    const m = me(ctx);
    return ok([...(idx().invoices.get(m.oid) ?? [])].sort((a, b) => (a.issued_at < b.issued_at ? 1 : -1)));
}

function attendance(ctx: Ctx): HttpResponse<unknown> {
    const m = me(ctx);
    const from = addDaysIso(ctx.now.date, -83);
    const counts = new Map<string, number>();
    for (const c of db().checkIns) if (c.member_oid === m.oid && dateOf(c.in_at) >= from) counts.set(dateOf(c.in_at), (counts.get(dateOf(c.in_at)) ?? 0) + 1);
    return ok({ from, to: ctx.now.date, days: [...counts].map(([date, count]) => ({ date, count })) });
}

function bookings(ctx: Ctx): HttpResponse<unknown> {
    const m = me(ctx);
    const d = db();
    const week = weekStart(ctx.now.date);
    const available = d.sessions
        .filter(
            s =>
                s.branch_oid === m.branch_oid &&
                s.starts_at >= ctx.now.iso &&
                dateOf(s.starts_at) <= addDaysIso(week, 13) &&
                (!s.ladies_only || m.gender === 'Female')
        )
        .sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1));
    return ok({ upcoming: upcomingBookings(m, ctx), available });
}

function bookClass(ctx: Ctx): HttpResponse<unknown> {
    const m = me(ctx);
    const booking = book(str(ctx.body['session_oid']), m.oid, ctx.now.date, ctx.now.iso);
    return ok(booking, booking.status === 'Waitlist' ? 'The class is full: you are on the waitlist' : 'Class booked');
}

/** Members may cancel up to 2 hours before the class. */
function cancelBooking(ctx: Ctx): HttpResponse<unknown> {
    const m = me(ctx);
    const b = db().bookings.find(x => x.oid === ctx.params[0] && x.member_oid === m.oid);
    if (!b) fail(404, 'Booking not found');
    const s = db().sessions.find(x => x.oid === b.session_oid)!;
    const cutoff = new Date(Date.parse(s.starts_at) - 2 * 3600_000);
    if (Date.now() > cutoff.getTime()) fail(409, 'Bookings can be cancelled up to 2 hours before the class.');
    commit({ t: 'booking.status', oid: b.oid, status: 'Cancelled' });
    return ok(null, 'Booking cancelled');
}

function routine(ctx: Ctx): HttpResponse<unknown> {
    const m = me(ctx);
    const days = db().routines[m.oid];
    if (!days?.length) return ok(null);
    const index = Math.floor(Date.parse(`${ctx.now.date}T00:00:00Z`) / 86_400_000) % days.length;
    const day: RoutineDay = { ...days[index], logged_today: (db().workoutLog[m.oid] ?? []).includes(ctx.now.date) };
    return ok(day);
}

function logWorkout(ctx: Ctx): HttpResponse<unknown> {
    const m = me(ctx);
    if ((db().workoutLog[m.oid] ?? []).includes(ctx.now.date)) fail(409, 'Today’s workout is already logged.');
    commit({ t: 'workout.log', member_oid: m.oid, date: ctx.now.date });
    return ok({ logged: true }, 'Workout logged. Nice work!');
}

function progress(ctx: Ctx): HttpResponse<unknown> {
    const m = me(ctx);
    const today = ctx.now.date;
    const start = addDaysIso(weekStart(today), -77);
    const weeks = Array.from({ length: 12 }, (_, k) => addDaysIso(start, k * 7));
    const visits = db().checkIns.filter(c => c.member_oid === m.oid && dateOf(c.in_at) >= start);
    const result: Progress = {
        measurements: db().measurements[m.oid] ?? [],
        weekly_visits: weeks.map(w => ({ week: w, visits: visits.filter(c => dateOf(c.in_at) >= w && dateOf(c.in_at) < addDaysIso(w, 7)).length })),
        streak_days: streak(m.oid, today)
    };
    return ok(result);
}

export const PORTAL_ROUTES: Route[] = [
    { method: 'GET', path: /^\/v1\/me\/summary$/, scope: 'member', can: ['read', 'Portal'], handler: summary },
    { method: 'GET', path: /^\/v1\/me\/payments$/, scope: 'member', can: ['read', 'Portal'], handler: payments },
    { method: 'GET', path: /^\/v1\/me\/attendance$/, scope: 'member', can: ['read', 'Portal'], handler: attendance },
    { method: 'GET', path: /^\/v1\/me\/bookings$/, scope: 'member', can: ['read', 'Portal'], handler: bookings },
    { method: 'POST', path: /^\/v1\/me\/bookings$/, scope: 'member', can: ['create', 'Portal'], handler: bookClass },
    { method: 'DELETE', path: /^\/v1\/me\/bookings\/([\w-]+)$/, scope: 'member', can: ['delete', 'Portal'], handler: cancelBooking },
    { method: 'GET', path: /^\/v1\/me\/routine\/today$/, scope: 'member', can: ['read', 'Portal'], handler: routine },
    { method: 'POST', path: /^\/v1\/me\/workouts$/, scope: 'member', can: ['create', 'Portal'], handler: logWorkout },
    { method: 'GET', path: /^\/v1\/me\/progress$/, scope: 'member', can: ['read', 'Portal'], handler: progress }
];
