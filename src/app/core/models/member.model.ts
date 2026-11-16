import type { BranchRef } from './branch.model';

/**
 * - Active: a running subscription. Expired: the last one ended. Frozen: paused for a period.
 * - Suspended: blocked by the branch (behaviour, unpaid dues). Pending: a join request without a first payment (D-022).
 */
export type MemberStatus = 'Active' | 'Expired' | 'Frozen' | 'Suspended' | 'Pending';

export type Gender = 'Male' | 'Female';

/** A row of `GET /v1/members` (branch from `X-Branch-Id`). */
export interface MemberListItem {
    oid: string;
    /** Printed on the member card as a barcode: `MEM-GUL-000123`. */
    code: string;
    name: string;
    phone: string;
    gender: Gender;
    photo_url: string | null;
    status: MemberStatus;
    plan_name: string | null;
    /** Last day of the current (or last) subscription, `yyyy-MM-dd`. */
    valid_until: string | null;
    /** Days left on the current subscription; negative = days since it expired. */
    days_left: number | null;
    /** Unpaid amount, ৳. */
    dues: number;
    last_visit: string | null;
    joined_on: string;
}

export interface Member extends MemberListItem {
    branch: BranchRef;
    email: string | null;
    date_of_birth: string | null;
    address: string | null;
    emergency_contact: { name: string; phone: string; relation: string } | null;
    /** From the health declaration: e.g. 'Asthma', 'Knee injury'. */
    health_flags: string[];
    health_declared: boolean;
    trainer_name: string | null;
    current_subscription_oid: string | null;
    notes: string | null;
}

export interface MemberQuery {
    q?: string;
    status?: MemberStatus | '';
    plan?: string;
    /** 'expiring' (≤ 7 days left) or 'dues' (owes money). */
    flag?: 'expiring' | 'dues' | '';
    page?: number;
    size?: number;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
}

export interface MemberPayload {
    name: string;
    phone: string;
    gender: Gender;
    email?: string | null;
    date_of_birth?: string | null;
    address?: string | null;
    emergency_contact?: { name: string; phone: string; relation: string } | null;
    health_flags: string[];
    health_declared: boolean;
    photo_url?: string | null;
}

export type TimelineKind = 'joined' | 'subscription' | 'payment' | 'freeze' | 'check_in' | 'override' | 'note' | 'status';

/** `GET /v1/members/:id/timeline`: the audit-style history of a member. */
export interface TimelineEvent {
    oid: string;
    kind: TimelineKind;
    at: string;
    title: string;
    detail: string | null;
    by: string | null;
}

/** Weight and measurements, for the progress chart. */
export interface Measurement {
    date: string;
    weight_kg: number;
    body_fat_pct: number | null;
    waist_cm: number | null;
}
