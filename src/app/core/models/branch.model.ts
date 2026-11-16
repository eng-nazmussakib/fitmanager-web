/**
 * HQ and the branches live in one `branch` table (D-023): exactly one row has kind 'HQ', every tenant is 'BRANCH'.
 * Wire shapes: snake_case fields, `oid` ids, as the API sends them.
 */
export type BranchKind = 'HQ' | 'BRANCH';

/** What every screen needs to name and address a branch. `slug` is the console URL segment (D-014). */
export interface BranchRef {
    oid: string;
    /** Short readable code, e.g. 'GUL'. */
    code: string;
    slug: string;
    name: string;
    kind: BranchKind;
}

/** Staff roles. One user can hold different roles at different branches (StaffAssignment). */
export type StaffRole = 'OWNER' | 'HQ_ADMIN' | 'BRANCH_MANAGER' | 'FRONT_DESK' | 'TRAINER';

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
    OWNER: 'Owner',
    HQ_ADMIN: 'HQ admin',
    BRANCH_MANAGER: 'Branch manager',
    FRONT_DESK: 'Front desk',
    TRAINER: 'Trainer'
};

/** `GET /v1/branches/:id`, `GET /v1/public/branches/:slug`. */
export interface Branch extends BranchRef {
    address: string;
    area: string;
    phone: string;
    email: string;
    /** People allowed on the floor at once (live occupancy). */
    capacity: number;
    opened_on: string;
    facilities: string[];
    /** Dues above this block check-in (৳). */
    dues_limit: number;
    hours: { days: string; open: string; close: string; note?: string }[];
    /** Women-only sessions. */
    ladies_hours: { days: string; open: string; close: string }[];
    map_url: string;
}
