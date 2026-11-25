import type { Branch } from '@core/models/branch.model';
import type {
    AdjustReason,
    EquipmentCategory,
    EquipmentStatus,
    MovementKind,
    PoStatus,
    ProductCategory,
    ProductUnit,
    TicketPriority,
    TicketStatus,
    TransferStatus
} from '@core/models/business.model';
import type { Booking, ClassSession, ClassType, Trainer } from '@core/models/class.model';
import type { ComplaintCategory, ComplaintStatus, GiverRole, IncidentCategory, PolicyMode, SanctionLevel } from '@core/models/governance.model';
import type { Gender } from '@core/models/member.model';
import type { Invoice } from '@core/models/payment.model';
import type { Plan, PlanTemplate } from '@core/models/plan.model';
import type { OrgSettings, SiteGroup } from '@core/models/settings.model';
import type { AuditEntry } from '@core/models/staff.model';
import type { Subscription } from '@core/models/subscription.model';
import type { Equipment, ExerciseCategory, Goal, Level, Measure, Muscle, RoutineDay, WorkoutSet } from '@core/models/training.model';
import type { FileKind } from '@core/services/files.service';

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
    kind: FileKind;
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
    kind: 'class_cancelled' | 'waitlist_promoted' | 'pt_booked' | 'pt_cancelled' | 'welcome';
    subject: string;
    body: string;
    created_at: string;
}

/** Phase 7b (D-108): a read mark on a derived message; `oid` is `<reader>|<message oid>` (mock/inbox.ts). */
export interface ReadRow {
    oid: string;
    read_at: string;
}

/* ---------- phase 7c: the website (D-109) ---------- */

export interface PostCategoryRow {
    oid: string;
    name: string;
    slug: string;
    sort_order: number;
}

export interface PostRow {
    oid: string;
    branch_oid: string;
    slug: string;
    title: string;
    excerpt: string;
    body: string;
    category_oid: string | null;
    cover_file_oid: string | null;
    cover_url: string | null;
    cover_alt: string;
    author_name: string;
    published_at: string | null;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
}

export interface GalleryRow {
    oid: string;
    branch_oid: string;
    file_oid: string | null;
    image_url: string | null;
    thumb_url: string | null;
    alt: string;
    width: number;
    height: number;
    sort_order: number;
    deleted_at: string | null;
}

export interface OfferRow {
    oid: string;
    slug: string;
    title: string;
    summary: string;
    body: string;
    conditions: string[];
    promo_code: string | null;
    starts_on: string;
    ends_on: string | null;
    sort_order: number;
    published: boolean;
    deleted_at: string | null;
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

/* ---------- phase 5: governance (D-090 to D-097) ---------- */

/** HQ master data, read by every branch (no RLS in the API). */
export interface PolicyRow {
    oid: string;
    slug: string;
    title: string;
    summary: string | null;
    required: boolean;
    public: boolean;
    sort_order: number;
    active: boolean;
    updated_at: string;
}

export interface PolicyVersionRow {
    oid: string;
    policy_oid: string;
    version: number;
    mode: PolicyMode;
    change_note: string | null;
    published_on: string;
    published_by_name: string | null;
    clauses: { oid: string; number: string; heading: string; body: string }[];
}

export interface AcceptanceRow {
    oid: string;
    branch_oid: string;
    member_oid: string;
    policy_oid: string;
    version_oid: string;
    version: number;
    method: 'portal' | 'paper';
    recorded_by_name: string | null;
    accepted_at: string;
}

export interface IncidentRow {
    oid: string;
    branch_oid: string;
    subject_kind: 'member' | 'staff';
    member_oid: string | null;
    member_branch_oid: string | null;
    /** The staff member's username (the mock's account key). */
    staff_username: string | null;
    subject_name: string;
    subject_code: string;
    subject_role: string | null;
    occurred_at: string;
    category: IncidentCategory;
    summary: string;
    description: string;
    clause_oid: string | null;
    clause_label: string | null;
    witnesses: string | null;
    internal_notes: string | null;
    evidence_file_oids: string[];
    hq_only: boolean;
    reported_by: string | null;
    reported_by_name: string | null;
    reported_role: GiverRole;
    closed_at: string | null;
    created_at: string;
}

export interface SanctionRow {
    oid: string;
    branch_oid: string;
    incident_oid: string;
    member_oid: string | null;
    member_branch_oid: string | null;
    staff_username: string | null;
    level: SanctionLevel;
    starts_on: string;
    ends_on: string | null;
    scope: 'branch' | 'all' | null;
    reason: string;
    suggested_level: SanctionLevel;
    choice_reason: string | null;
    given_by: string | null;
    given_by_name: string;
    given_role: GiverRole;
    given_on: string;
    membership_cancelled: boolean;
    lifted: { at: string; by: string; reason: string } | null;
    overturned_at: string | null;
    appeal: {
        oid: string;
        body: string;
        status: 'open' | 'upheld' | 'rejected';
        filed_at: string;
        filed_by_name: string;
        decided_by_name: string | null;
        decision_note: string | null;
        decided_at: string | null;
    } | null;
}

export interface ComplaintRow {
    oid: string;
    branch_oid: string;
    code: string;
    member_oid: string | null;
    member_code: string | null;
    member_name: string;
    category: ComplaintCategory;
    subject: string;
    body: string;
    photo_file_oid: string | null;
    named_staff: string | null;
    named_staff_name: string | null;
    hq_only: boolean;
    filed_via: 'portal' | 'desk';
    status: ComplaintStatus;
    first_response_at: string | null;
    resolution: string | null;
    resolved_at: string | null;
    escalated: { at: string; by: 'manager' | 'member'; reason: string } | null;
    member_accepted_at: string | null;
    created_at: string;
    updates: { oid: string; author: 'staff' | 'member'; author_name: string; body: string; status: ComplaintStatus | null; at: string }[];
}

export interface NpsRow {
    oid: string;
    branch_oid: string;
    member_oid: string;
    score: number | null;
    comment: string | null;
    created_at: string;
}

export interface RatingRow {
    oid: string;
    branch_oid: string;
    member_oid: string;
    member_name: string;
    kind: 'class' | 'pt';
    booking_oid: string | null;
    pt_session_oid: string | null;
    trainer_oid: string | null;
    trainer_name: string | null;
    label: string;
    session_at: string;
    score: number;
    comment: string | null;
    created_at: string;
}

/* ---------- phase 6: business (D-098 to D-102) ---------- */

export interface EquipmentRow {
    oid: string;
    branch_oid: string;
    name: string;
    category: EquipmentCategory;
    brand: string | null;
    model: string | null;
    serial: string | null;
    purchased_on: string | null;
    cost: number | null;
    warranty_until: string | null;
    room_oid: string | null;
    photo_file_oid: string | null;
    status: EquipmentStatus;
    service_every_days: number | null;
    last_serviced_on: string | null;
    notes: string | null;
    retired_on: string | null;
    retired_reason: string | null;
    created_on: string;
}

export interface TicketRow {
    oid: string;
    branch_oid: string;
    equipment_oid: string;
    code: string;
    kind: 'repair' | 'service';
    description: string;
    photo_file_oid: string | null;
    priority: TicketPriority;
    out_of_order: boolean;
    status: TicketStatus;
    technician: string | null;
    cost: number | null;
    resolution: string | null;
    raised_by_name: string;
    raised_at: string;
    updated_at: string;
    closed_at: string | null;
    closed_by_name: string | null;
}

export interface ProductRow {
    oid: string;
    code: string;
    name: string;
    category: ProductCategory;
    unit: ProductUnit;
    description: string | null;
    price: number;
    vat_rate: number | null;
    photo_file_oids: string[];
    supplier_oid: string | null;
    reorder_level: number;
    active: boolean;
    updated_at: string;
}

export interface SupplierRow {
    oid: string;
    name: string;
    contact_name: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
    active: boolean;
    updated_at: string;
}

/** One branch's stock of one product; `oid` = `<branch oid>:<product oid>`. */
export interface StockRow {
    oid: string;
    branch_oid: string;
    product_oid: string;
    on_hand: number;
    avg_cost: number;
    reorder_level: number;
}

/** The ledger, append-only; `seq` orders moves made at the same time. */
export interface MovementRow {
    oid: string;
    seq: number;
    branch_oid: string;
    product_oid: string;
    kind: MovementKind;
    qty: number;
    unit_cost: number;
    on_hand_after: number;
    avg_cost_after: number;
    reason: AdjustReason | null;
    note: string | null;
    ref_oid: string | null;
    ref_label: string | null;
    by_name: string;
    at: string;
}

export interface PoRow {
    oid: string;
    branch_oid: string;
    code: string;
    supplier_oid: string;
    supplier_name: string;
    status: PoStatus;
    note: string | null;
    raised_by_name: string;
    raised_at: string;
    decided_by_name: string | null;
    decided_at: string | null;
    decision_note: string | null;
    sent_at: string | null;
    closed_at: string | null;
    cancel_reason: string | null;
    lines: { oid: string; product_oid: string; code: string; name: string; qty: number; unit_cost: number; received: number }[];
    deliveries: {
        oid: string;
        received_on: string;
        note: string | null;
        by_name: string;
        at: string;
        lines: { line_oid: string; product_oid: string; qty: number; unit_cost: number }[];
    }[];
}

export interface TransferRow {
    oid: string;
    code: string;
    from_branch_oid: string;
    to_branch_oid: string;
    status: TransferStatus;
    note: string | null;
    requested_by_name: string;
    requested_at: string;
    sent_by_name: string | null;
    sent_at: string | null;
    received_by_name: string | null;
    received_at: string | null;
    closing_note: string | null;
    closed_at: string | null;
    lines: {
        oid: string;
        product_oid: string;
        code: string;
        name: string;
        qty_requested: number;
        qty_sent: number | null;
        qty_received: number | null;
        unit_cost: number | null;
    }[];
}

export interface PosReturnRow {
    oid: string;
    branch_oid: string;
    invoice_oid: string;
    payment_oid: string;
    lines: { index: number; product_oid: string; qty: number; damaged: boolean; amount: number }[];
    amount: number;
    reason: string;
    by_name: string;
    at: string;
}

export interface Tables {
    equipment: EquipmentRow[];
    tickets: TicketRow[];
    products: ProductRow[];
    suppliers: SupplierRow[];
    stock: StockRow[];
    movements: MovementRow[];
    purchaseOrders: PoRow[];
    transfers: TransferRow[];
    posReturns: PosReturnRow[];
    policies: PolicyRow[];
    policyVersions: PolicyVersionRow[];
    acceptances: AcceptanceRow[];
    incidents: IncidentRow[];
    sanctions: SanctionRow[];
    complaints: ComplaintRow[];
    nps: NpsRow[];
    ratings: RatingRow[];
    exercises: ExerciseRow[];
    routines: RoutineRow[];
    workouts: WorkoutRow[];
    measurements: MeasurementRow[];
    messages: MessageRow[];
    reads: ReadRow[];
    posts: PostRow[];
    postCategories: PostCategoryRow[];
    gallery: GalleryRow[];
    offers: OfferRow[];
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
