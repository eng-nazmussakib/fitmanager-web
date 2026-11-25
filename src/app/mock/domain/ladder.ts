/**
 * The discipline ladder: `Warning → Written → Suspension → Ban`, and who may give each step. Pure
 * functions, copied from the API's (fitmanager-api src/features/discipline/ladder.ts), with the same cases in
 * ladder.spec.ts: keep them in step.
 *
 * - The desk and trainers record incidents and give verbal warnings.
 * - A branch manager gives any step at their branch, but bans only there (scope `branch`).
 * - HQ (the owner and HQ admins) gives any step, and may ban at every branch.
 * - A case about a branch manager is HQ's only (`hq_only`); nobody acts on a case about themselves.
 * - The suggested step comes from the person's strikes in the last 12 months: sanctions not overturned on appeal.
 */
import type { StaffRole } from '@core/models/branch.model';

import { addDaysIso as addDays } from '../seed/clock';

export const LADDER = ['verbal', 'written', 'suspension', 'ban'] as const;
export type Level = (typeof LADDER)[number];
export type GiverRole = 'desk' | 'trainer' | 'manager' | 'hq';

/** Strikes count back this many days (12 months). */
export const STRIKE_DAYS = 365;
/** An appeal is filed within this many days of the sanction. */
export const APPEAL_DAYS = 7;
/** The longest suspension, and how far ahead one may start. */
export const MAX_SUSPENSION_DAYS = 90;
export const MAX_SUSPENSION_LEAD_DAYS = 30;

export const LEVEL_LABEL: Record<Level, string> = { verbal: 'Verbal warning', written: 'Written warning', suspension: 'Suspension', ban: 'Ban' };

/** The caller's place on the ladder, from their role where they act (HQ staff count as HQ at any branch). */
export function giverRole(role: StaffRole, atHq: boolean): GiverRole {
    if (atHq || role === 'OWNER' || role === 'HQ_ADMIN') return 'hq';
    if (role === 'BRANCH_MANAGER') return 'manager';
    return role === 'TRAINER' ? 'trainer' : 'desk';
}

export interface StrikeRow {
    level: Level;
    starts_on: string;
    overturned: boolean;
}

/** Sanctions in the 12 months to `today`, not overturned. */
export function strikes<T extends StrikeRow>(rows: T[], today: string): T[] {
    const from = addDays(today, -STRIKE_DAYS);
    return rows.filter(r => !r.overturned && r.starts_on > from && r.starts_on <= today);
}

/** The next step: one per strike, capped at a ban. */
export function suggestLevel(strikeCount: number): Level {
    return LADDER[Math.min(strikeCount, LADDER.length - 1)] ?? 'ban';
}

/** The steps this caller may give on this case. Empty: they may only read it (or it is about them). */
export function allowedLevels(role: GiverRole, c: { hq_only: boolean; about_caller: boolean }): Level[] {
    if (c.about_caller) return [];
    if (role === 'hq') return [...LADDER];
    if (c.hq_only) return [];
    if (role === 'manager') return [...LADDER];
    return ['verbal'];
}

export function banScopes(role: GiverRole): ('branch' | 'all')[] {
    return role === 'hq' ? ['branch', 'all'] : role === 'manager' ? ['branch'] : [];
}

/** May this caller decide an appeal? Not the person who gave the sanction; HQ only for a ban. */
export function mayDecideAppeal(role: GiverRole, s: { level: Level; given_by: string | null; hq_only: boolean }, callerOid: string): boolean {
    if (s.given_by === callerOid) return false;
    if (role === 'hq') return true;
    return role === 'manager' && s.level !== 'ban' && !s.hq_only;
}

/** May this caller lift a ban? HQ any; a manager the branch bans given at their branch, not HQ's. */
export function mayLift(role: GiverRole, s: { level: Level; scope: 'branch' | 'all' | null; given_role: GiverRole; hq_only: boolean }): boolean {
    if (s.level !== 'ban') return false;
    if (role === 'hq') return true;
    return role === 'manager' && s.scope === 'branch' && s.given_role !== 'hq' && !s.hq_only;
}

/** The last day an appeal may be filed. */
export function appealDeadline(givenOn: string): string {
    return addDays(givenOn, APPEAL_DAYS);
}
