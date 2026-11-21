/**
 * Access rules engine: may a member come in right now? PURE TypeScript, the same code as the API's
 * (fitmanager-api src/features/attendance/access-rules.ts): keep them in step. A member trains at EVERY branch
 * (D-059): no "own branch only" rule; the dues limit is the HOME branch's, the hours the branch being entered.
 *
 * Every rule that fails is reported (not just the first), each with the reason the front desk reads out and
 * whether a manager may override it. Order = the order shown on screen.
 *
 * Phase 5 (D-091, D-093): a suspension in force blocks every branch and a ban the branches it covers, neither
 * overridable; a required policy not accepted blocks once its grace period is over, and a manager may override that.
 */
import type { RuleFailure } from '@core/models/attendance.model';
import type { MemberStatus } from '@core/models/member.model';

export interface AccessFacts {
    member: { status: MemberStatus; dues: number; home_branch_name: string; dues_limit: number };
    /** The member's current (or most relevant) subscription. */
    subscription: { start_date: string; end_date: string; freezes: { from: string; to: string }[] } | null;
    /** The branch being entered: its opening hours. */
    branch: { name: string; hours: { days: number[]; open: string; close: string }[] };
    /** An open visit (not checked out), anywhere: its branch and time, `HH:mm`. */
    open_check_in: { branch_name: string; time: string } | null;
    /** Suspensions not overturned, anywhere, and the bans covering the branch entered (D-093). `branch_name`: where given. */
    sanctions?: {
        level: 'suspension' | 'ban';
        starts_on: string;
        ends_on: string | null;
        scope: 'branch' | 'all' | null;
        branch_name: string;
        reason: string;
    }[];
    /** Required policies the member has not accepted, and the first day each one blocks (D-091). */
    policies?: { title: string; blocks_on: string }[];
}

/** "Now" at the branch, already in Asia/Dhaka: `yyyy-MM-dd`, `HH:mm`, weekday 0 = Sunday … 6 = Saturday. */
export interface AccessClock {
    date: string;
    time: string;
    weekday: number;
}

const taka = (n: number): string => `৳${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n)}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** `2026-03-05` → `5 Mar 2026`. */
export function shortDate(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Whole days from `a` to `b` (both `yyyy-MM-dd`). */
export function daysBetween(a: string, b: string): number {
    return Math.round(
        (Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86_400_000
    );
}

/** `18:05` → `6:05 pm`. */
export function clock12(hhmm: string): string {
    const [h, m] = hhmm.split(':').map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

const fail = (rule: RuleFailure['rule'], message: string, overridable: boolean): RuleFailure => ({ rule, message, overridable });

export function evaluateAccess(facts: AccessFacts, now: AccessClock): RuleFailure[] {
    const failures: RuleFailure[] = [];
    const { member, subscription: sub, branch } = facts;

    if (member.status === 'Pending') failures.push(fail('pending', 'Join request only: the membership starts with the first payment.', false));
    for (const x of facts.sanctions ?? []) {
        if (x.level === 'suspension' && x.starts_on <= now.date && x.ends_on !== null && now.date <= x.ends_on)
            failures.push(fail('suspended', `Suspended until ${shortDate(x.ends_on)} (${x.branch_name}): ${x.reason}`, false));
        if (x.level === 'ban') failures.push(fail('banned', `Banned ${x.scope === 'all' ? 'from every branch' : `from ${x.branch_name}`}: ${x.reason}`, false));
    }

    if (!sub) {
        if (member.status !== 'Pending') failures.push(fail('membership', 'No membership on record.', false));
    } else if (now.date < sub.start_date) {
        failures.push(fail('membership', `Membership starts on ${shortDate(sub.start_date)}.`, true));
    } else if (now.date > sub.end_date) {
        const ago = daysBetween(sub.end_date, now.date);
        failures.push(fail('expired', `Subscription expired ${ago === 1 ? 'yesterday' : `${ago} days ago`} (${shortDate(sub.end_date)}).`, true));
    } else {
        const freeze = sub.freezes.find(f => f.from <= now.date && now.date <= f.to);
        if (freeze) failures.push(fail('frozen', `Membership frozen until ${shortDate(freeze.to)}.`, true));
    }

    if (member.dues > member.dues_limit) {
        failures.push(fail('dues', `Dues ${taka(member.dues)} exceed the limit of ${taka(member.dues_limit)} (${member.home_branch_name}).`, true));
    }

    const overdue = (facts.policies ?? []).filter(p => p.blocks_on <= now.date);
    if (overdue.length) {
        failures.push(fail('policy', `Not accepted: ${overdue.map(p => p.title).join(', ')}. Accept in the member portal or sign at the desk.`, true));
    }

    const today = branch.hours.filter(h => h.days.includes(now.weekday));
    const open = today.some(h => h.open <= now.time && now.time < h.close);
    if (!open) {
        const next = today.find(h => now.time < h.open);
        failures.push(fail('hours', next ? `${branch.name} opens at ${clock12(next.open)} today.` : `${branch.name} is closed for the day.`, true));
    }

    if (facts.open_check_in) {
        failures.push(
            fail('already_in', `Already checked in at ${facts.open_check_in.branch_name} at ${clock12(facts.open_check_in.time)}. Check out first.`, false)
        );
    }
    return failures;
}
