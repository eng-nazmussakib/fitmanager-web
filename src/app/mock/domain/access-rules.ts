/**
 * Access rules engine: may a member come in right now? PURE TypeScript (no Angular, no mock imports), so it is
 * ported to fitmanager-api in phase 2 as is, with access-rules.spec.ts as its test cases.
 *
 * Every rule that fails is reported (not just the first), each with the reason the front desk reads out and
 * whether a manager may override it. Order = the order shown on screen.
 */
import type { AccessRuleId, RuleFailure } from '@core/models/attendance.model';
import type { MemberStatus } from '@core/models/member.model';

export interface AccessFacts {
    member: { branch_oid: string; branch_name: string; status: MemberStatus; dues: number };
    /** The member's current (or most recent) subscription. */
    subscription: { start_date: string; end_date: string; freezes: { from: string; to: string }[] } | null;
    /** The branch the member is trying to enter. */
    branch: { oid: string; dues_limit: number; hours: { days: number[]; open: string; close: string }[] };
    /** An open check-in (not checked out) today, if any: its time, `HH:mm`. */
    open_check_in: string | null;
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

function fail(rule: AccessRuleId, message: string, overridable: boolean): RuleFailure {
    return { rule, message, overridable };
}

export function evaluateAccess(facts: AccessFacts, now: AccessClock): RuleFailure[] {
    const failures: RuleFailure[] = [];
    const { member, subscription: sub, branch } = facts;

    if (member.branch_oid !== branch.oid)
        failures.push(fail('branch', `Member of the ${member.branch_name} branch. Members train at their own branch (transfer first).`, false));

    if (member.status === 'Pending') failures.push(fail('pending', 'Join request only: the membership starts with the first payment.', false));
    if (member.status === 'Suspended') failures.push(fail('suspended', 'Membership suspended by the branch.', true));

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

    if (member.dues > branch.dues_limit) failures.push(fail('dues', `Dues ${taka(member.dues)} exceed the limit of ${taka(branch.dues_limit)}.`, true));

    const today = branch.hours.filter(h => h.days.includes(now.weekday));
    const open = today.some(h => h.open <= now.time && now.time < h.close);
    if (!open) {
        const next = today.find(h => now.time < h.open);
        failures.push(fail('hours', next ? `The branch opens at ${clock12(next.open)} today.` : 'The branch is closed for the day.', true));
    }

    if (facts.open_check_in) failures.push(fail('already_in', `Already checked in at ${clock12(facts.open_check_in)}. Check out first.`, false));

    return failures;
}
