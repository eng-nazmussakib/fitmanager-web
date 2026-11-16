import { HttpResponse } from '@angular/common/http';

import type { Branch } from '@core/models/branch.model';
import type { AttentionItem, BranchComparison, Dashboard, Kpi } from '@core/models/dashboard.model';

import { daysBetween } from '../domain/access-rules';
import { type Ctx, fail, ok, qStr, type Route } from '../http';
import { idx, memberState } from '../queries';
import { addDaysIso, dateOf, weekdayOf } from '../seed/clock';
import { toRef } from '../seed/organisation.seed';
import { db } from '../store';

const DAYS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
/** Saturday-first index of a 0 = Sunday weekday. */
const satFirst = (wd: number): number => (wd + 1) % 7;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function range(ctx: Ctx): { from: string; to: string } {
    const today = ctx.now.date;
    const from = qStr(ctx, 'from') || addDaysIso(today, -29);
    const to = qStr(ctx, 'to') || today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) fail(400, 'Choose a valid date range.');
    if (daysBetween(from, to) > 400) fail(400, 'Choose a range of at most 13 months.');
    return { from, to };
}

/** Everything the HQ and branch dashboards show, for `branches`, over `from…to`. */
function build(branches: Branch[], from: string, to: string, today: string): Dashboard {
    const d = db();
    const i = idx();
    const ids = new Set(branches.map(b => b.oid));
    const len = daysBetween(from, to) + 1;
    const prevFrom = addDaysIso(from, -len);
    const prevTo = addDaysIso(from, -1);

    const members = d.members.filter(m => ids.has(m.branch_oid));
    const states = new Map(members.map(m => [m.oid, memberState(m, today)]));
    const per = <T>(fn: (b: Branch) => T): { branch: Branch; value: T }[] => branches.map(b => ({ branch: b, value: fn(b) }));

    const revenueIn = (b: Branch, a: string, z: string): number =>
        d.invoices
            .filter(inv => inv.branch.oid === b.oid)
            .reduce((s, inv) => s + inv.payments.filter(p => dateOf(p.received_at) >= a && dateOf(p.received_at) <= z).reduce((x, p) => x + p.amount, 0), 0);
    const newIn = (b: Branch, a: string, z: string): number => members.filter(m => m.branch_oid === b.oid && m.joined_on >= a && m.joined_on <= z).length;
    const active = (b: Branch): number => members.filter(m => m.branch_oid === b.oid && states.get(m.oid)!.status === 'Active').length;
    const dues = (b: Branch): number => members.filter(m => m.branch_oid === b.oid).reduce((s, m) => s + states.get(m.oid)!.dues, 0);
    const checkInsOn = (b: Branch, day: string): number => d.checkIns.filter(c => c.branch_oid === b.oid && dateOf(c.in_at) === day).length;
    const expiring = (b: Branch): number =>
        members.filter(
            m =>
                m.branch_oid === b.oid &&
                states.get(m.oid)!.status === 'Active' &&
                (states.get(m.oid)!.days_left ?? 99) <= 7 &&
                (states.get(m.oid)!.days_left ?? -1) >= 0
        ).length;

    const kpi = (id: Kpi['id'], label: string, money: boolean, values: { branch: Branch; value: number }[], previous: number | null): Kpi => {
        const value = values.reduce((s, v) => s + v.value, 0);
        return {
            id,
            label,
            money,
            value,
            delta_pct: previous ? Math.round(((value - previous) / previous) * 1000) / 10 : null,
            by_branch: values.map(v => ({ branch: toRef(v.branch), value: v.value }))
        };
    };
    const revenue = per(b => revenueIn(b, from, to));
    const kpis: Kpi[] = [
        kpi('active_members', 'Active members', false, per(active), null),
        kpi(
            'revenue',
            'Revenue',
            true,
            revenue,
            branches.reduce((s, b) => s + revenueIn(b, prevFrom, prevTo), 0)
        ),
        kpi('dues', 'Outstanding dues', true, per(dues), null),
        kpi(
            'check_ins_today',
            'Check-ins today',
            false,
            per(b => checkInsOn(b, today)),
            branches.reduce((s, b) => s + checkInsOn(b, addDaysIso(today, -7)), 0)
        ),
        kpi(
            'new_members',
            'New members',
            false,
            per(b => newIn(b, from, to)),
            branches.reduce((s, b) => s + newIn(b, prevFrom, prevTo), 0)
        ),
        kpi('expiring_7d', 'Expiring in 7 days', false, per(expiring), null)
    ];

    // Revenue trend: per day up to ~2 months, per month beyond.
    const monthly = len > 62;
    const buckets: string[] = [];
    if (monthly) for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = addDaysIso(`${m}-28`, 7).slice(0, 7)) buckets.push(m);
    else for (let x = from; x <= to; x = addDaysIso(x, 1)) buckets.push(x);
    const revenueTrend = branches.map(b => {
        const sums = new Map<string, number>(buckets.map(k => [k, 0]));
        for (const inv of d.invoices) {
            if (inv.branch.oid !== b.oid) continue;
            for (const p of inv.payments) {
                const day = dateOf(p.received_at);
                if (day < from || day > to) continue;
                const k = monthly ? day.slice(0, 7) : day;
                sums.set(k, (sums.get(k) ?? 0) + p.amount);
            }
        }
        return { label: b.name, points: buckets.map(k => ({ x: monthly ? `${MONTHS[+k.slice(5, 7) - 1]} ${k.slice(2, 4)}` : k, y: sums.get(k) ?? 0 })) };
    });

    // Average check-ins per weekday and hour over the last 8 weeks (06:00…22:00).
    const grid = DAYS.map(() => Array.from({ length: 17 }, () => 0));
    const since = addDaysIso(today, -55);
    for (const c of d.checkIns) {
        if (!ids.has(c.branch_oid) || dateOf(c.in_at) < since || dateOf(c.in_at) > today) continue;
        const h = Number(c.in_at.slice(11, 13));
        if (h >= 6 && h <= 22) grid[satFirst(weekdayOf(dateOf(c.in_at)))][h - 6]++;
    }
    const attendanceHeatmap = DAYS.map((day, k) => ({ day, hours: grid[k].map(n => Math.round((n / 8) * 10) / 10) }));

    const comparison: BranchComparison[] = branches.map(b => {
        const visits = d.checkIns.filter(c => c.branch_oid === b.oid && dateOf(c.in_at) >= from && dateOf(c.in_at) <= to).length;
        // Retention: of the plans that ended in the last 90 days, how many were renewed within 14 days.
        let ended = 0;
        let renewed = 0;
        for (const m of members.filter(x => x.branch_oid === b.oid)) {
            const subs = i.subs.get(m.oid) ?? [];
            subs.forEach((s, k) => {
                if (s.end_date < addDaysIso(today, -90) || s.end_date >= addDaysIso(today, -14)) return;
                ended++;
                const next = subs[k + 1];
                if (next && daysBetween(s.end_date, next.start_date) <= 14) renewed++;
            });
        }
        return {
            branch: toRef(b),
            members: active(b),
            revenue: revenueIn(b, from, to),
            dues: dues(b),
            avg_daily_visits: Math.round((visits / len) * 10) / 10,
            retention_pct: ended ? Math.round((renewed / ended) * 100) : 0
        };
    });

    const attention: AttentionItem[] = [];
    for (const m of members) {
        const s = states.get(m.oid)!;
        const branch = toRef(branches.find(b => b.oid === m.branch_oid)!);
        const limit = branches.find(b => b.oid === m.branch_oid)!.dues_limit;
        const base = { member_oid: m.oid, member_name: m.name, member_code: m.code, branch };
        if (s.status === 'Suspended') attention.push({ ...base, kind: 'suspended', detail: m.suspended?.reason ?? 'Suspended' });
        if (s.dues > limit)
            attention.push({ ...base, kind: 'dues', detail: `Owes ৳${s.dues.toLocaleString('en-IN')} (limit ৳${limit.toLocaleString('en-IN')})` });
        if (s.status === 'Active' && s.days_left !== null && s.days_left >= 0 && s.days_left <= 3)
            attention.push({
                ...base,
                kind: 'expiring',
                detail: s.days_left === 0 ? 'Expires today' : `Expires in ${s.days_left} day${s.days_left === 1 ? '' : 's'}`
            });
    }
    const order = { suspended: 0, dues: 1, expiring: 2 };
    attention.sort((a, b) => order[a.kind] - order[b.kind]);
    return { from, to, kpis, revenue_trend: revenueTrend, attendance_heatmap: attendanceHeatmap, comparison, attention: attention.slice(0, 30) };
}

function hqDashboard(ctx: Ctx): HttpResponse<unknown> {
    const { from, to } = range(ctx);
    return ok(
        build(
            db().branches.filter(b => b.kind === 'BRANCH'),
            from,
            to,
            ctx.now.date
        )
    );
}

function branchDashboard(ctx: Ctx): HttpResponse<unknown> {
    const { from, to } = range(ctx);
    return ok(build([ctx.branch!], from, to, ctx.now.date));
}

export const DASHBOARD_ROUTES: Route[] = [
    { method: 'GET', path: /^\/v1\/hq\/dashboard$/, scope: 'hq', can: ['read', 'HqDashboard'], handler: hqDashboard },
    { method: 'GET', path: /^\/v1\/dashboard$/, scope: 'branch', can: ['read', 'Dashboard'], handler: branchDashboard }
];
