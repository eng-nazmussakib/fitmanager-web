import type { MemberStatus } from './member.model';

/** No 'branch' rule: a member trains at every branch. */
export type AccessRuleId = 'membership' | 'expired' | 'frozen' | 'suspended' | 'banned' | 'dues' | 'policy' | 'hours' | 'already_in' | 'pending';

/** One failed rule, with the reason shown to the front desk. */
export interface RuleFailure {
    rule: AccessRuleId;
    message: string;
    /** Whether a manager may override this failure. */
    overridable: boolean;
}

/** `POST /v1/attendance/evaluate`: may this member come in now? */
export interface AccessDecision {
    allowed: boolean;
    failures: RuleFailure[];
    /** Required policies due but not blocking yet: ask the member to sign. */
    policies_due?: { title: string; blocks_on: string }[];
    member: {
        oid: string;
        code: string;
        name: string;
        photo_url: string | null;
        status: MemberStatus;
        plan_name: string | null;
        valid_until: string | null;
        days_left: number | null;
        dues: number;
        /** Another branch's member: the plan and dues stay with their home branch. */
        visitor?: boolean;
        home_branch_name?: string;
    };
    /** Every failure can be overridden (and the user may: `create AttendanceOverride`). */
    can_override: boolean;
}

export interface CheckIn {
    oid: string;
    member_oid: string;
    member_code: string;
    member_name: string;
    photo_url: string | null;
    checked_in_at: string;
    checked_out_at: string | null;
    override: { reason: string; by: string } | null;
    by: string;
    /** A visitor from another branch, and their home branch. */
    visitor?: boolean;
    home_branch_name?: string;
    /** Closed automatically at closing time. */
    auto_out?: boolean;
    backdated?: boolean;
}

/** `POST /v1/attendance/check-in`. */
export interface CheckInRequest {
    member_oid?: string;
    /** The scanned code: any branch's member. */
    code?: string;
    override?: { reason: string } | null;
}

export interface Occupancy {
    inside: number;
    capacity: number;
    today: number;
}
