import type { Branch } from '@core/models/branch.model';
import type { Booking, ClassSession, ClassType, Trainer } from '@core/models/class.model';
import type { Gender, Measurement } from '@core/models/member.model';
import type { Invoice } from '@core/models/payment.model';
import type { Plan, PlanTemplate } from '@core/models/plan.model';
import type { RoutineDay } from '@core/models/portal.model';
import type { OrgSettings, SiteGroup } from '@core/models/settings.model';
import type { Subscription } from '@core/models/subscription.model';

import type { Promo } from './domain/pricing';
import type { MockAccount } from './seed/staff.seed';

/**
 * The mock's stored rows. Derived values (status, days left, dues, last visit) are computed per request from
 * these, the way the API's queries will, so a sale or check-in shows up everywhere at once.
 */
export interface MemberRow {
    oid: string;
    code: string;
    branch_oid: string;
    name: string;
    phone: string;
    gender: Gender;
    email: string | null;
    date_of_birth: string | null;
    address: string | null;
    emergency_contact: { name: string; phone: string; relation: string } | null;
    health_flags: string[];
    health_declared: boolean;
    photo_url: string | null;
    joined_on: string;
    /** Set by the branch; overrides the subscription-derived status. */
    suspended: { since: string; reason: string } | null;
    /** A join request without a first payment (D-022). */
    pending: boolean;
    trainer_oid: string | null;
    notes: string | null;
    /** How often this member trains (0–1), for the attendance seed. */
    regularity: number;
    /** Usual training time, minutes after midnight. */
    habit_minutes: number;
}

export interface CheckInRow {
    oid: string;
    branch_oid: string;
    member_oid: string;
    in_at: string;
    out_at: string | null;
    override: { reason: string; by: string } | null;
    by: string;
}

export interface NoteRow {
    oid: string;
    member_oid: string;
    at: string;
    title: string;
    detail: string | null;
    by: string | null;
}

export interface EnquiryRow {
    oid: string;
    branch_oid: string;
    name: string;
    phone: string;
    message: string;
    at: string;
}

export interface MockDb {
    seedDay: string;
    branches: Branch[];
    accounts: MockAccount[];
    trainers: Trainer[];
    templates: PlanTemplate[];
    plans: Plan[];
    promos: Promo[];
    settings: OrgSettings;
    siteGroups: SiteGroup[];
    members: MemberRow[];
    subscriptions: Subscription[];
    invoices: Invoice[];
    checkIns: CheckInRow[];
    classTypes: ClassType[];
    sessions: ClassSession[];
    bookings: Booking[];
    measurements: Record<string, Measurement[]>;
    routines: Record<string, RoutineDay[]>;
    workoutLog: Record<string, string[]>;
    notes: NoteRow[];
    enquiries: EnquiryRow[];
    /** Next number per sequence ('member:GUL', 'invoice:GUL', 'oid'). */
    counters: Record<string, number>;
}
