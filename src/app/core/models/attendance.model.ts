import type { MemberStatus } from './member.model';

export type AccessRuleId = 'membership' | 'expired' | 'frozen' | 'suspended' | 'dues' | 'hours' | 'branch' | 'already_in' | 'pending';

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
}

/** `POST /v1/attendance/check-in`. */
export interface CheckInRequest {
    member_oid: string;
    override?: { reason: string } | null;
}

export interface Occupancy {
    inside: number;
    capacity: number;
    today: number;
}
