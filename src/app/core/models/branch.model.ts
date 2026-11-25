/**
 * HQ and the branches live in one `branch` table: exactly one row has kind 'HQ', every tenant is 'BRANCH'.
 * Wire shapes: snake_case fields, `oid` ids, as the API sends them.
 */
export type BranchKind = 'HQ' | 'BRANCH';

/** What every screen needs to name and address a branch. `slug` is the console URL segment. */
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

/** One block of opening hours: weekday numbers (0 = Sunday … 6 = Saturday), HH:mm in Dhaka time. */
export interface HoursBlock {
    days: number[];
    open: string;
    close: string;
}

/** `GET /v1/branches/:oid` (staff; the public list leaves out `dues_limit` and `status`). */
export interface Branch extends BranchRef {
    address: string | null;
    area: string | null;
    phone: string | null;
    email: string | null;
    /** People allowed on the floor at once (live occupancy). */
    capacity: number;
    opened_on: string | null;
    facilities: string[];
    /** Dues above this block check-in (৳). */
    dues_limit: number;
    hours: HoursBlock[];
    /** Women-only sessions. */
    ladies_hours: HoursBlock[];
    map_url: string | null;
    /** The public page's text, written by the branch manager or HQ. */
    description?: string | null;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * [6, 0, 1, 2, 3, 4] → "Saturday–Thursday", [5] → "Friday", every day → "Every day". Days are read in the week
 * order Saturday first (the Bangladeshi week); a run of three or more becomes a range.
 */
export function formatDays(days: readonly number[]): string {
    if (new Set(days).size === 7) return 'Every day';
    const order = [6, 0, 1, 2, 3, 4, 5];
    const sorted = order.filter(d => days.includes(d));
    const runs: number[][] = [];
    for (const d of sorted) {
        const last = runs.at(-1);
        if (last && order.indexOf(last.at(-1) ?? -1) === order.indexOf(d) - 1) last.push(d);
        else runs.push([d]);
    }
    return runs.map(r => (r.length >= 3 ? `${DAY_NAMES[r[0] ?? 0]}–${DAY_NAMES[r.at(-1) ?? 0]}` : r.map(d => DAY_NAMES[d]).join(', '))).join(', ');
}
