import type { BranchRef } from './branch.model';

/**
 * - Active: a running subscription. Expired: the last one ended. Frozen: paused for a period.
 * - Suspended: a suspension in force (D-093): no entry at any branch, the plan keeps running. Banned: a ban covering the
 *   home branch (the plan was cancelled). Pending: a join request without a first payment (D-022).
 */
export type MemberStatus = 'Active' | 'Expired' | 'Frozen' | 'Suspended' | 'Banned' | 'Pending';

export type Gender = 'Male' | 'Female';

/** A row of `GET /v1/members` (branch from `X-Branch-Id`). */
export interface MemberListItem {
    oid: string;
    /** Printed on the member card as a barcode: `MEM-GUL-000123`. */
    code: string;
    name: string;
    /** `+8801712345678` from the API (any Bangladeshi format is accepted when sent). Null once anonymised. */
    phone: string | null;
    /** Null only for a web join request, until the desk fills it in. */
    gender: Gender | null;
    /** A signed link that works for an hour (D-058): never stored, never shared. */
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
    trainer_oid?: string | null;
    trainer_name: string | null;
    current_subscription_oid: string | null;
    notes: string | null;
    /** The uploaded photo's file (send it back to keep or replace the photo). */
    photo_file_oid?: string | null;
    /** What makes the member Suspended or Banned (D-093); the cases are on the Discipline tab. */
    sanction?: { level: 'suspension' | 'ban'; reason: string; until: string | null; branch_name: string } | null;
    /** "Delete my data" was done (D-068 c): the record keeps only its code. */
    anonymised?: boolean;
    frozen_until?: string | null;
    /** Where the member came from: the desk, or the public site's forms (D-022). */
    source?: 'desk' | 'web';
}

/** `GET /v1/members/:oid/documents`. */
export interface MemberDocument {
    oid: string;
    name: string;
    content_type: string;
    size_bytes: number | null;
    created_at: string;
    created_by_name: string | null;
    /** Signed, 1 hour. */
    url: string;
}

/** `GET /v1/members/:oid/notifications`, `/v1/me/notifications`: in-app messages (D-075: no email or SMS provider). */
export interface MemberNotification {
    oid: string;
    kind: 'receipt' | 'expiry_7d' | 'expiry_1d' | 'welcome' | 'class_cancelled' | 'waitlist_promoted' | 'pt_booked' | 'pt_cancelled';
    channel: 'email' | 'sms' | 'log';
    subject: string;
    body: string;
    status: 'logged' | 'sent' | 'failed' | 'skipped';
    created_at: string;
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
    /** Signed the current policies on paper at the desk (D-090): recorded as accepted. */
    policies_signed?: boolean;
    /** From `POST /v1/files` (kind `member_photo`) once completed. */
    photo_file_oid?: string | null;
}

export type TimelineKind = 'joined' | 'subscription' | 'payment' | 'freeze' | 'check_in' | 'override' | 'note' | 'status' | 'discipline' | 'policy';

/** `GET /v1/members/:id/timeline`: the audit-style history of a member. */
export interface TimelineEvent {
    oid: string;
    kind: TimelineKind;
    at: string;
    title: string;
    detail: string | null;
    by: string | null;
}
