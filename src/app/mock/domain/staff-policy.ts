import type { BranchKind, StaffRole } from '@core/models/branch.model';

/**
 * Who may manage which staff (D-055). The SAME rules as the API's `src/features/staff/staff.policy.ts`; change both
 * together.
 * - OWNER at HQ: every role, every branch.
 * - HQ_ADMIN at HQ: branch roles at any branch; never OWNER or HQ_ADMIN.
 * - BRANCH_MANAGER: FRONT_DESK and TRAINER at their own branch.
 * - OWNER or HQ_ADMIN acting at a branch: branch roles at that branch.
 * A person is managed only by someone who may manage every role they hold; only an OWNER at HQ changes an
 * every-branch account.
 */
export const HQ_ROLES: readonly StaffRole[] = ['OWNER', 'HQ_ADMIN'];
export const BRANCH_ROLES: readonly StaffRole[] = ['BRANCH_MANAGER', 'FRONT_DESK', 'TRAINER'];
const DESK_ROLES: readonly StaffRole[] = ['FRONT_DESK', 'TRAINER'];

export interface Actor {
    oid: string;
    role: StaffRole;
    branch: { oid: string; kind: BranchKind };
}

export interface Placement {
    branch_oid: string;
    branch_kind: BranchKind;
    role: StaffRole;
}

export function fitsBranch(role: StaffRole, kind: BranchKind): boolean {
    return kind === 'HQ' ? HQ_ROLES.includes(role) : BRANCH_ROLES.includes(role);
}

export function mayAssign(actor: Actor, p: Placement): boolean {
    if (!fitsBranch(p.role, p.branch_kind)) return false;
    const here = p.branch_oid === actor.branch.oid;
    if (actor.branch.kind === 'HQ') {
        if (actor.role === 'OWNER') return true;
        return actor.role === 'HQ_ADMIN' && BRANCH_ROLES.includes(p.role);
    }
    if (actor.role === 'OWNER' || actor.role === 'HQ_ADMIN') return here && BRANCH_ROLES.includes(p.role);
    return actor.role === 'BRANCH_MANAGER' && here && DESK_ROLES.includes(p.role);
}

export function mayManage(actor: Actor, person: { all_branches: boolean; assignments: readonly Placement[] }): boolean {
    if (person.all_branches && !(actor.branch.kind === 'HQ' && actor.role === 'OWNER')) return false;
    return person.assignments.every(a => mayAssign(actor, a));
}

export function assignableRoles(actor: Actor, branch: { oid: string; kind: BranchKind }): StaffRole[] {
    return [...HQ_ROLES, ...BRANCH_ROLES].filter(role => mayAssign(actor, { branch_oid: branch.oid, branch_kind: branch.kind, role }));
}
