import type { AppRule } from '@core/auth/ability';

import type { BranchRef, StaffRole } from './branch.model';

export interface AuthTokens {
    access_token: string;
    refresh_token: string;
}

/** A staff member's role at one branch, with the CASL rules that role gives there. */
export interface StaffAssignment {
    branch: BranchRef;
    role: StaffRole;
    rules: AppRule[];
}

/**
 * `GET /v1/auth/me`. Staff get one assignment per branch they work at (an HQ assignment covers HQ screens and,
 * with `all_branches`, every branch). Members get `member` (their one branch, D-003) and portal rules.
 *
 * The ability in the UI = `rules` (global) + the active branch's assignment rules (AuthService). The API checks the
 * same rules against `X-Branch-Id` on every request; the UI check is only a convenience.
 */
export interface CurrentUser {
    user_id: string;
    username?: string;
    name: string;
    email?: string | null;
    kind: 'staff' | 'member';
    /** Shown in the user menu: the role at the active branch, else the first. */
    photo_url?: string | null;
    /** Rules that do not depend on a branch (the member portal; HQ screens for HQ staff). */
    rules: AppRule[];
    assignments: StaffAssignment[];
    /** HQ staff (owner): every branch is reachable, with the role of the HQ assignment. */
    all_branches: boolean;
    /** A temporary password is set (D-054): every screen except the password page is closed until it is changed. */
    must_change_password?: boolean;
    /** Members only. */
    member?: { oid: string; code: string; branch: BranchRef } | null;
}
