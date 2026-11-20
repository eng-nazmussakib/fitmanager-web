import type { Branch } from '@core/models/branch.model';
import type { Booking, ClassSession, ClassType, Trainer } from '@core/models/class.model';
import type { Gender } from '@core/models/member.model';
import type { Invoice } from '@core/models/payment.model';
import type { Plan, PlanTemplate } from '@core/models/plan.model';
import type { OrgSettings, SiteGroup } from '@core/models/settings.model';
import type { AuditEntry } from '@core/models/staff.model';
import type { Subscription } from '@core/models/subscription.model';
import type { Equipment, ExerciseCategory, Goal, Level, Measure, Muscle, RoutineDay, WorkoutSet } from '@core/models/training.model';

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
    phone: string | null;
    gender: Gender | null;
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
    /** For the BMI (D-089), set with a measurement. */
    height_cm?: number | null;
    notes: string | null;
    /** How often this member trains (0–1), for the attendance seed. */
    regularity: number;
    /** Usual training time, minutes after midnight. */
    habit_minutes: number;
    /** "Delete my data" (D-068 c). */
    anonymised?: boolean;
    /** A portal account was given (D-064). */
    portal?: boolean;
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

/** A staff member's end-of-day count (`POST /v1/cash-closing`). */
export interface ClosingRow {
    branch_oid: string;
    day: string;
    staff_oid: string;
    staff_name: string;
    expected_cash: number;
    counted_cash: number;
    note: string | null;
    at: string;
}

/** An uploaded photo or document. `url` is an object URL: it lasts for the browser session only. */
export interface FileRow {
    oid: string;
    branch_oid: string;
    member_oid: string | null;
    kind: 'member_photo' | 'member_document' | 'trainer_photo' | 'exercise_photo' | 'exercise_video' | 'measurement_photo';
    name: string;
    content_type: string;
    size_bytes: number;
    status: 'pending' | 'ready' | 'deleted';
    url: string | null;
    created_at: string;
    created_by_name: string | null;
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

/* ---------- phase 3: scheduling (D-078 to D-083) ---------- */

export interface RoomRow {
    oid: string;
    branch_oid: string;
    name: string;
    capacity: number;
    active: boolean;
}

/** A weekly class rule; its sessions are made when the timetable is read, as the API does. */
export interface RuleRow {
    oid: string;
    branch_oid: string;
    class_type_oid: string;
    trainer_oid: string;
    room_oid: string;
    weekdays: number[];
    start_time: string;
    minutes: number;
    capacity: number;
    ladies_only: boolean;
    valid_from: string;
    valid_to: string | null;
    active: boolean;
}

export interface AvailabilityRow {
    oid: string;
    branch_oid: string;
    trainer_oid: string;
    weekday: number;
    start_time: string;
    end_time: string;
}

export interface LeaveRow {
    oid: string;
    trainer_oid: string;
    from_date: string;
    to_date: string;
    reason: string | null;
    removed?: boolean;
}

export interface PtRow {
    oid: string;
    branch_oid: string;
    trainer_oid: string;
    trainer_name: string;
    member_oid: string;
    member_code: string;
    member_name: string;
    subscription_oid: string;
    room_oid: string | null;
    room_name: string | null;
    starts_at: string;
    ends_at: string;
    status: 'Booked' | 'Completed' | 'NoShow' | 'Cancelled';
    charged: boolean;
    cancelled_by: 'member' | 'trainer' | 'staff' | null;
    cancel_reason: string | null;
    notes: string | null;
    source: 'portal' | 'desk';
}

export interface LockerRow {
    oid: string;
    branch_oid: string;
    number: string;
    size: 'S' | 'M' | 'L';
    monthly_fee: number;
    active: boolean;
}

export interface RentalRow {
    oid: string;
    branch_oid: string;
    locker_oid: string;
    member_oid: string;
    member_code: string;
    member_name: string;
    start_date: string;
    end_date: string;
    months: number;
    invoice_oid: string;
    /** The day the key came back; the rental does not run from then. */
    ended_on: string | null;
}

export interface BlockRow {
    oid: string;
    branch_oid: string;
    room_oid: string | null;
    locker_oid: string | null;
    starts_at: string;
    ends_at: string;
    reason: string;
    created_by_name: string | null;
    removed?: boolean;
}

/** An in-app message written by a scheduling change (D-081); receipts and reminders are derived instead. */
export interface MessageRow {
    oid: string;
    member_oid: string;
    kind: 'class_cancelled' | 'waitlist_promoted' | 'pt_booked' | 'pt_cancelled';
    subject: string;
    body: string;
    created_at: string;
}

/** The tables the generic `put` / `patch` mutations reach. */
/** Phase 4 (D-084): an exercise of HQ's library (HQ branch oid) or a branch's own. */
export interface ExerciseRow {
    oid: string;
    branch_oid: string;
    name: string;
    category: ExerciseCategory;
    measure: Measure;
    muscles: Muscle[];
    equipment: Equipment;
    instructions: string | null;
    photo_file_oids: string[];
    video_file_oid: string | null;
    active: boolean;
}

/** Phase 4 (D-087): a template (`member_oid` null) or a member's snapshot copy. */
export interface RoutineRow {
    oid: string;
    branch_oid: string;
    member_oid: string | null;
    source_oid: string | null;
    name: string;
    goal: Goal;
    level: Level;
    description: string | null;
    days: RoutineDay[];
    trainer_oid: string | null;
    trainer_name: string | null;
    assigned_by: 'trainer' | 'staff' | 'member' | null;
    started_on: string | null;
    ended_on: string | null;
    active: boolean;
    created_at: string;
}

/** Phase 4 (D-088): a workout with its sets (names copied). */
export interface WorkoutRow {
    oid: string;
    branch_oid: string;
    member_oid: string;
    routine_oid: string | null;
    day_index: number | null;
    day_name: string | null;
    performed_on: string;
    minutes: number | null;
    notes: string | null;
    source: 'member' | 'trainer' | 'desk';
    logged_by_name: string | null;
    created_at: string;
    exercises: { exercise_oid: string; name: string; measure: Measure; sets: WorkoutSet[] }[];
}

/** Phase 4 (D-089): a body measurement; photos are file oids. */
export interface MeasurementRow {
    oid: string;
    branch_oid: string;
    member_oid: string;
    measured_on: string;
    weight_kg: number | null;
    body_fat_pct: number | null;
    waist_cm: number | null;
    chest_cm: number | null;
    hips_cm: number | null;
    arm_cm: number | null;
    thigh_cm: number | null;
    photo_front_oid: string | null;
    photo_side_oid: string | null;
    photo_back_oid: string | null;
    notes: string | null;
    source: 'member' | 'trainer' | 'desk';
    recorded_by_name: string | null;
    created_at: string;
}

export interface Tables {
    exercises: ExerciseRow[];
    routines: RoutineRow[];
    workouts: WorkoutRow[];
    measurements: MeasurementRow[];
    messages: MessageRow[];
    rooms: RoomRow[];
    rules: RuleRow[];
    availability: AvailabilityRow[];
    leave: LeaveRow[];
    ptSessions: PtRow[];
    lockers: LockerRow[];
    rentals: RentalRow[];
    blocks: BlockRow[];
    sessions: ClassSession[];
    bookings: Booking[];
    trainers: Trainer[];
    classTypes: ClassType[];
}
export type TableName = keyof Tables;

export interface MockDb extends Tables {
    seedDay: string;
    branches: Branch[];
    accounts: MockAccount[];
    templates: PlanTemplate[];
    plans: Plan[];
    /** HQ's promo codes; `active: false` codes are kept but never apply. */
    promos: (Promo & { active: boolean })[];
    settings: OrgSettings;
    siteGroups: SiteGroup[];
    /** Append-only, newest last (migration 005 / phase 1): staff and settings changes. */
    audit: AuditEntry[];
    members: MemberRow[];
    subscriptions: Subscription[];
    invoices: Invoice[];
    checkIns: CheckInRow[];
    notes: NoteRow[];
    enquiries: EnquiryRow[];
    closings?: ClosingRow[];
    files?: FileRow[];
    /** Next number per sequence ('member:GUL', 'invoice:GUL', 'oid'). */
    counters: Record<string, number>;
}
