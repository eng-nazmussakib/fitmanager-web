import { HttpResponse } from '@angular/common/http';

import type { PortalSummary } from '@core/models/portal.model';

import { daysBetween } from '../domain/access-rules';
import { type Ctx, fail, ok, type Route } from '../http';
import { idx, memberState } from '../queries';
import { addDaysIso, dateOf } from '../seed/clock';
import { db } from '../store';
import type { MemberRow } from '../types';

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

export const PORTAL_ROUTES: Route[] = [
    { method: 'GET', path: /^\/v1\/me\/summary$/, scope: 'member', can: ['read', 'Portal'], handler: summary },
    { method: 'GET', path: /^\/v1\/me\/payments$/, scope: 'member', can: ['read', 'Portal'], handler: payments },
    { method: 'GET', path: /^\/v1\/me\/attendance$/, scope: 'member', can: ['read', 'Portal'], handler: attendance }
];
