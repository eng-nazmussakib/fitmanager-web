import type { Booking, ClassSession, ClassType, Trainer } from './class.model';
import type { Invoice } from './payment.model';

/** Phase 3 (D-078 to D-083): rooms, weekly rules, PT, lockers and maintenance. The wire contract with fitmanager-api. */

export interface Room {
    oid: string;
    branch_oid: string;
    name: string;
    capacity: number;
    active: boolean;
}

/** `GET /v1/classes/schedule`: one week, Saturday to Friday. */
export interface WeekSchedule {
    from: string;
    to: string;
    sessions: ClassSession[];
    types: ClassType[];
    trainers: Trainer[];
    rooms: Room[];
    my_trainer_oid: string | null;
}

/** A weekly class rule. Weekdays: 0 = Sunday … 6 = Saturday. */
export interface ClassRule {
    oid: string;
    branch_oid: string;
    class_type_oid: string;
    type_name: string;
    color: ClassType['color'];
    trainer_oid: string;
    trainer_name: string;
    room_oid: string;
    room_name: string;
    weekdays: number[];
    start_time: string;
    end_time: string | null;
    minutes: number;
    capacity: number;
    ladies_only: boolean;
    valid_from: string;
    valid_to: string | null;
    active: boolean;
    sessions_changed?: number;
    sessions_cancelled?: number;
}

export interface ClassRuleInput {
    class_type_oid: string;
    trainer_oid: string;
    room_oid: string;
    weekdays: number[];
    start_time: string;
    minutes?: number;
    capacity: number;
    ladies_only: boolean;
    valid_from?: string;
    valid_to?: string | null;
}

export interface OneOffInput {
    class_type_oid: string;
    trainer_oid: string;
    room_oid: string;
    date: string;
    start_time: string;
    minutes?: number;
    capacity: number;
    ladies_only: boolean;
}

export interface AvailabilitySlot {
    weekday: number;
    start_time: string;
    end_time: string;
}

export interface TrainerLeave {
    oid: string;
    from_date: string;
    to_date: string;
    reason: string | null;
}

/** `GET /v1/trainers/:oid`. */
export interface TrainerDetail extends Trainer {
    availability: AvailabilitySlot[];
    leave: TrainerLeave[];
    clients: number;
    client_list?: { oid: string; code: string; name: string; photo_url: string | null }[];
    upcoming: { kind: 'class' | 'pt'; oid: string; title: string; starts_at: string; ends_at: string; room_name: string | null }[];
}

export interface TrainerInput {
    user_oid?: string;
    slug?: string;
    gender?: 'Male' | 'Female';
    phone?: string | null;
    headline?: string | null;
    bio?: string | null;
    specialties?: string[];
    certifications?: { name: string; issuer: string | null; year: number | null }[];
    photo_file_oid?: string | null;
    public?: boolean;
    active?: boolean;
}

/** A public trainer page (`GET /v1/public/trainers/:slug`). */
export interface PublicTrainer extends Trainer {
    branch_slug: string | null;
    classes: { title: string; starts_at: string; ends_at: string; branch_name: string; branch_slug: string; ladies_only: boolean }[];
}

export type PtStatus = 'Booked' | 'Completed' | 'NoShow' | 'Cancelled';

export interface PtSession {
    oid: string;
    branch_oid: string;
    trainer_oid: string;
    trainer_name: string;
    member_oid: string;
    member_code: string;
    member_name: string;
    subscription_oid: string;
    plan_name: string;
    room_oid: string | null;
    room_name: string | null;
    starts_at: string;
    ends_at: string;
    date: string;
    start_time: string;
    status: PtStatus;
    /** Used a credit of the package. */
    charged: boolean;
    cancelled_by: 'member' | 'trainer' | 'staff' | null;
    cancel_reason: string | null;
    notes: string | null;
    source: 'portal' | 'desk';
}

export interface PtPackage {
    oid: string;
    plan_name: string;
    start_date: string;
    end_date: string;
    sessions: number;
    used: number;
    left: number;
}

/** `GET /v1/members/:oid/pt` and `GET /v1/me/pt`. */
export interface MemberPt {
    trainer: Trainer | null;
    packages: PtPackage[];
    upcoming: PtSession[];
    past: PtSession[];
    cancel_hours: number;
}

export interface PtWeek {
    from: string;
    to: string;
    sessions: PtSession[];
    trainers: Trainer[];
}

export interface PtSlots {
    trainer_oid: string;
    date: string;
    minutes: number;
    slots: string[];
}

export interface PtInput {
    member_oid: string;
    trainer_oid: string;
    date: string;
    start_time: string;
    minutes?: number;
    room_oid?: string | null;
}

export type LockerStatus = 'Free' | 'Rented' | 'Blocked' | 'Inactive';

export interface Locker {
    oid: string;
    number: string;
    size: 'S' | 'M' | 'L';
    monthly_fee: number;
    active: boolean;
    status: LockerStatus;
    rental: {
        oid: string;
        member_oid: string;
        member_code: string;
        member_name: string;
        start_date: string;
        end_date: string;
        invoice_oid: string;
        ends_soon: boolean;
    } | null;
    blocked: { reason: string; until: string | null } | null;
}

export interface LockerList {
    lockers: Locker[];
    totals: Record<'free' | 'rented' | 'blocked' | 'inactive', number>;
}

export interface RentInput {
    member_oid: string;
    months: number;
    start_date?: string;
    payment: { method: string; amount: number; reference: string | null };
}

export interface MaintenanceBlock {
    oid: string;
    room_oid: string | null;
    room_name: string | null;
    locker_oid: string | null;
    locker_number: string | null;
    starts_at: string;
    ends_at: string;
    reason: string;
    created_by_name: string | null;
    current: boolean;
}

export interface MaintenanceList {
    blocks: MaintenanceBlock[];
    affected_classes: { oid: string; title: string; starts_at: string; room_name: string; booked: number }[];
}

/** `GET /v1/me/bookings`. */
export interface PortalBookings {
    upcoming: (Booking & { session: ClassSession })[];
    available: ClassSession[];
    rules: { open_days: number; max_active: number; cancel_hours: number; blocked_until: string | null };
}

export type { Invoice };
