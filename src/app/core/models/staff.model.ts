import type { BranchKind, StaffRole } from './branch.model';

/**
 * Staff management (phase 1, D-054, D-055): `GET /v1/hq/staff` (every account) and `GET /v1/branch/staff` (the people
 * assigned at the active branch). Wire shapes, as the API sends them.
 */
export interface StaffPlacement {
    branch_oid: string;
    branch_code: string;
    branch_name: string;
    branch_kind: BranchKind;
    branch_status: 'Active' | 'Inactive';
    role: StaffRole;
}

export interface StaffMember {
    oid: string;
    username: string;
    name: string;
    email: string | null;
    status: 'Active' | 'Inactive';
    /** HQ staff (the owner): every branch, with the HQ assignment's role. */
    all_branches: boolean;
    /** A temporary password is set; the person picks their own at the next sign-in (D-054). */
    must_change_password: boolean;
    created_at: string;
    updated_at: string;
    /** Explicit rows only (an `all_branches` account lists just its HQ row). */
    assignments: StaffPlacement[];
    /** Whether the caller may change this account (D-055); the UI shows the actions only then. */
    manageable: boolean;
}

export interface StaffList {
    rows: StaffMember[];
    /** The branches an assignment can name: every active one at HQ (HQ first), the active branch at a branch. */
    branches: { oid: string; code: string; name: string; kind: BranchKind }[];
    /** The roles the caller may hand out: on the HQ row, and on a branch. */
    assignable_roles: { hq: StaffRole[]; branch: StaffRole[] };
}

export interface StaffAssignmentInput {
    branch_oid: string;
    role: StaffRole;
}

/** `GET /v1/auth/sessions`: one sign-in (refresh-token family). */
export interface UserSession {
    id: string;
    signed_in_at: string;
    last_used_at: string;
    user_agent: string | null;
    current: boolean;
}

/** `GET /v1/hq/audit`, `GET /v1/branch/audit`: one append-only entry. */
export interface AuditEntry {
    oid: string;
    branch_oid: string;
    branch_code: string;
    branch_name: string;
    actor_oid: string | null;
    actor_name: string | null;
    action: string;
    entity: string;
    entity_key: string;
    before: unknown;
    after: unknown;
    request_id: string | null;
    created_at: string;
}

/** Newest first; `next` is the cursor for `?before=` (null on the last page). */
export interface AuditPage {
    rows: AuditEntry[];
    next: string | null;
}

/** The 403 the API answers until a temporary password is replaced (`errors[0].path`). */
export const PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED';
