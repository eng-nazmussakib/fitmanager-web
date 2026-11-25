import type { MemberPolicy, PolicyState, SanctionState } from '@core/models/governance.model';

import { daysBetween } from './domain/access-rules';
import { addDaysIso } from './seed/clock';
import { db } from './store';
import type { MemberRow, MockDb, SanctionRow } from './types';

/**
 * Governance's derived state, worked out when read as the API does: the sanction behind a member's status, the
 * sanctions the access rules check, where a member stands with each policy, and a staff suspension at sign-in.
 * Used by the queries (member status), the access rules and the governance handlers.
 */

export function sanctionState(s: Pick<SanctionRow, 'level' | 'starts_on' | 'ends_on' | 'lifted' | 'overturned_at'>, today: string): SanctionState {
    if (s.overturned_at) return 'overturned';
    if (s.level === 'ban') return s.lifted ? 'lifted' : 'in_force';
    if (s.level === 'suspension') return today < s.starts_on ? 'upcoming' : s.ends_on !== null && today > s.ends_on ? 'ended' : 'in_force';
    return 'recorded';
}

const branchName = (d: MockDb, oid: string): string => d.branches.find(b => b.oid === oid)?.name ?? '';

/** Suspensions and bans not overturned or lifted (the API's `member_access_facts.sanctions`). */
function standing(memberOid: string, d: MockDb): SanctionRow[] {
    return (d.sanctions ?? []).filter(s => s.member_oid === memberOid && (s.level === 'suspension' || s.level === 'ban') && !s.overturned_at && !s.lifted);
}

/** What makes the member Suspended or Banned at home: a ban covering the home branch, else a suspension in force. */
export function memberSanction(
    m: MemberRow,
    today: string,
    d: MockDb = db()
): { level: 'suspension' | 'ban'; reason: string; until: string | null; branch_name: string } | null {
    const list = standing(m.oid, d);
    const ban = list.find(s => s.level === 'ban' && (s.scope === 'all' || s.branch_oid === m.branch_oid));
    const susp = list
        .filter(s => s.level === 'suspension' && s.starts_on <= today && s.ends_on !== null && today <= s.ends_on)
        .sort((a, b) => (b.ends_on ?? '').localeCompare(a.ends_on ?? ''))[0];
    const x = ban ?? susp;
    return x ? { level: x.level as 'suspension' | 'ban', reason: x.reason, until: x.ends_on, branch_name: branchName(d, x.branch_oid) } : null;
}

/** The access rules' facts: suspensions anywhere, and the bans that reach the branch entered. */
export interface AccessSanction {
    level: 'suspension' | 'ban';
    starts_on: string;
    ends_on: string | null;
    scope: 'branch' | 'all' | null;
    branch_name: string;
    reason: string;
}

export function accessSanctions(memberOid: string, branchOid: string, d: MockDb = db()): AccessSanction[] {
    return standing(memberOid, d)
        .filter(s => s.level === 'suspension' || s.scope === 'all' || s.branch_oid === branchOid)
        .map(s => ({
            level: s.level as 'suspension' | 'ban',
            starts_on: s.starts_on,
            ends_on: s.ends_on,
            scope: s.scope,
            branch_name: branchName(d, s.branch_oid),
            reason: s.reason
        }));
}

/** Each active policy and where the member stands with it (the API's `memberPolicies`). */
export function memberPolicies(m: Pick<MemberRow, 'oid' | 'joined_on'>, today: string, d: MockDb = db()): MemberPolicy[] {
    const grace = d.settings.policy_grace_days;
    return (d.policies ?? [])
        .filter(p => p.active)
        .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title))
        .map(p => {
            const versions = (d.policyVersions ?? []).filter(v => v.policy_oid === p.oid).sort((a, b) => b.version - a.version);
            const current = versions[0];
            const required = versions.find(v => v.mode === 'accept_again') ?? current;
            const a = (d.acceptances ?? []).filter(x => x.member_oid === m.oid && x.policy_oid === p.oid).sort((x, y) => y.version - x.version)[0] ?? null;
            const accepted = a !== null && a.version >= required.version;
            const blocksOn = addDaysIso(required.published_on > m.joined_on ? required.published_on : m.joined_on, grace);
            const state: PolicyState = accepted ? 'accepted' : !p.required ? 'optional' : blocksOn <= today ? 'overdue' : 'due';
            return {
                policy_oid: p.oid,
                slug: p.slug,
                title: p.title,
                summary: p.summary,
                required: p.required,
                current_version: current.version,
                current_version_oid: current.oid,
                required_version: required.version,
                change_note: a && required.version > 1 ? required.change_note : null,
                accepted_version: a?.version ?? null,
                accepted_at: a?.accepted_at ?? null,
                method: a?.method ?? null,
                recorded_by_name: a?.recorded_by_name ?? null,
                state,
                blocks_on: state === 'due' || state === 'overdue' ? blocksOn : null
            };
        });
}

/** The required policies not accepted, with the day each one blocks (the access rules' `policies`). */
export function policiesOutstanding(m: Pick<MemberRow, 'oid' | 'joined_on'>, today: string): { title: string; blocks_on: string }[] {
    return memberPolicies(m, today)
        .filter(p => p.state === 'due' || p.state === 'overdue')
        .map(p => ({ title: p.title, blocks_on: p.blocks_on! }));
}

/** The last day of a staff suspension in force today, or null (sign-in is refused until then). */
export function staffSuspendedUntil(username: string, today: string, d: MockDb = db()): string | null {
    const ends = (d.sanctions ?? [])
        .filter(
            s =>
                s.staff_username === username &&
                s.level === 'suspension' &&
                !s.overturned_at &&
                s.starts_on <= today &&
                s.ends_on !== null &&
                today <= s.ends_on
        )
        .map(s => s.ends_on!)
        .sort();
    return ends.at(-1) ?? null;
}

/** Days since `iso` (a date or a timestamp) to `today`. */
export const daysSince = (iso: string, today: string): number => daysBetween(iso.slice(0, 10), today);
