import { HttpResponse } from '@angular/common/http';

import type { AccessDecision, CheckIn, Occupancy } from '@core/models/attendance.model';

import { evaluateAccess } from '../domain/access-rules';
import { type Ctx, fail, ok, type Route, str } from '../http';
import { idx, memberState } from '../queries';
import { dateOf, timeOf } from '../seed/clock';
import { openingHours } from '../seed/organisation.seed';
import { commit, db, newOid } from '../store';
import type { CheckInRow, MemberRow } from '../types';

/** Finds the member by oid or by exact code (scanner), at ANY branch: the branch rule then explains a mismatch. */
function findMember(ctx: Ctx): MemberRow {
    const key = str(ctx.body['member_oid']) || str(ctx.body['code']);
    const i = idx();
    const m = i.members.get(key) ?? i.byCode.get(key.toUpperCase());
    if (!m) fail(404, 'No member with this code');
    // Tenancy: another branch's member is only named, never shown in detail.
    return m;
}

export function decide(ctx: Ctx, m: MemberRow): AccessDecision {
    const d = db();
    const s = memberState(m, ctx.now.date);
    const branch = d.branches.find(b => b.oid === ctx.branch!.oid)!;
    const memberBranch = d.branches.find(b => b.oid === m.branch_oid)!;
    const open = idx().openCheckIn.get(m.oid);
    const failures = evaluateAccess(
        {
            member: { branch_oid: m.branch_oid, branch_name: memberBranch.name, status: s.status, dues: s.dues },
            subscription: s.relevant ? { start_date: s.relevant.start_date, end_date: s.relevant.end_date, freezes: s.relevant.freezes } : null,
            branch: { oid: branch.oid, dues_limit: branch.dues_limit, hours: openingHours(branch.name) },
            open_check_in: open && dateOf(open.in_at) === ctx.now.date ? timeOf(open.in_at) : null
        },
        { date: ctx.now.date, time: ctx.now.time, weekday: ctx.now.weekday }
    );
    const sameBranch = m.branch_oid === branch.oid;
    return {
        allowed: failures.length === 0,
        failures,
        member: {
            oid: m.oid,
            code: m.code,
            name: m.name,
            photo_url: sameBranch ? m.photo_url : null,
            status: s.status,
            plan_name: sameBranch ? (s.relevant?.plan_name ?? null) : null,
            valid_until: sameBranch ? s.valid_until : null,
            days_left: sameBranch ? s.days_left : null,
            dues: sameBranch ? s.dues : 0
        },
        can_override: failures.length > 0 && failures.every(f => f.overridable) && ctx.ability.can('create', 'AttendanceOverride')
    };
}

function evaluate(ctx: Ctx): HttpResponse<unknown> {
    return ok(decide(ctx, findMember(ctx)));
}

function toCheckIn(c: CheckInRow): CheckIn {
    const m = idx().members.get(c.member_oid)!;
    return {
        oid: c.oid,
        member_oid: c.member_oid,
        member_code: m.code,
        member_name: m.name,
        photo_url: m.photo_url,
        checked_in_at: c.in_at,
        checked_out_at: c.out_at,
        override: c.override,
        by: c.by
    };
}

function checkIn(ctx: Ctx): HttpResponse<unknown> {
    const m = findMember(ctx);
    const decision = decide(ctx, m);
    const override = ctx.body['override'] as { reason?: string } | null | undefined;
    if (!decision.allowed) {
        if (!override) fail(409, decision.failures.map(f => f.message).join(' '));
        if (!ctx.ability.can('create', 'AttendanceOverride')) fail(403, 'Only a branch manager can override a blocked check-in.');
        if (!decision.can_override)
            fail(
                409,
                'This block cannot be overridden: ' +
                    decision.failures
                        .filter(f => !f.overridable)
                        .map(f => f.message)
                        .join(' ')
            );
        if (str(override.reason).length < 5) fail(400, 'Give a reason for the override (at least 5 characters).');
    }
    const row: CheckInRow = {
        oid: newOid('ci'),
        branch_oid: ctx.branch!.oid,
        member_oid: m.oid,
        in_at: ctx.now.iso,
        out_at: null,
        override: decision.allowed ? null : { reason: str(override?.reason), by: ctx.user!.name },
        by: ctx.user!.name
    };
    commit({ t: 'checkin.create', row });
    return ok(toCheckIn(row), decision.allowed ? `${m.name} checked in` : `${m.name} checked in with an override`);
}

function checkOut(ctx: Ctx): HttpResponse<unknown> {
    const row = db().checkIns.find(c => c.oid === ctx.params[0] && c.branch_oid === ctx.branch!.oid);
    if (!row) fail(404, 'Check-in not found');
    if (row.out_at) fail(409, 'Already checked out');
    commit({ t: 'checkin.out', oid: row.oid, at: ctx.now.iso });
    return ok(toCheckIn(row), 'Checked out');
}

function today(ctx: Ctx): HttpResponse<unknown> {
    const rows = db()
        .checkIns.filter(c => c.branch_oid === ctx.branch!.oid && dateOf(c.in_at) === ctx.now.date)
        .sort((a, b) => (a.in_at < b.in_at ? 1 : -1))
        .map(toCheckIn);
    return ok(rows);
}

function occupancy(ctx: Ctx): HttpResponse<unknown> {
    const branch = db().branches.find(b => b.oid === ctx.branch!.oid)!;
    const todays = db().checkIns.filter(c => c.branch_oid === branch.oid && dateOf(c.in_at) === ctx.now.date);
    const result: Occupancy = { inside: todays.filter(c => !c.out_at).length, capacity: branch.capacity, today: todays.length };
    return ok(result);
}

export const ATTENDANCE_ROUTES: Route[] = [
    { method: 'POST', path: /^\/v1\/attendance\/evaluate$/, scope: 'branch', can: ['read', 'Attendance'], handler: evaluate },
    { method: 'POST', path: /^\/v1\/attendance\/check-in$/, scope: 'branch', can: ['create', 'Attendance'], handler: checkIn },
    { method: 'POST', path: /^\/v1\/attendance\/([\w-]+)\/check-out$/, scope: 'branch', can: ['update', 'Attendance'], handler: checkOut },
    { method: 'GET', path: /^\/v1\/attendance\/today$/, scope: 'branch', can: ['read', 'Attendance'], handler: today },
    { method: 'GET', path: /^\/v1\/attendance\/occupancy$/, scope: 'branch', can: ['read', 'Attendance'], handler: occupancy }
];
