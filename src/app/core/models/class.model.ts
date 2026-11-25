/** Class types are HQ master data: every branch uses the same names, colours and lengths. */
export interface ClassType {
    oid: string;
    name: string;
    description?: string | null;
    /** Theme-independent hue for the scheduler: one of the kit's chart colours. */
    color: 'red' | 'orange' | 'amber' | 'green' | 'teal' | 'blue' | 'violet' | 'pink';
    minutes: number;
    sort_order?: number;
    active?: boolean;
}

/** One class on one day (made from a weekly rule when the timetable is read, or added on its own). */
export interface ClassSession {
    oid: string;
    branch_oid: string;
    /** The weekly rule it came from; null for a one-off. */
    schedule_oid?: string | null;
    type_oid: string;
    type_name: string;
    color: ClassType['color'];
    title: string;
    trainer_oid: string;
    trainer_name: string;
    room_oid?: string;
    room: string;
    /** Dhaka wall time with its offset: `2026-11-20T18:00:00+06:00`. */
    starts_at: string;
    ends_at: string;
    capacity: number;
    booked: number;
    waitlist: number;
    /** Ladies-only class. */
    ladies_only: boolean;
    /** Edited on its own: a change to its rule leaves it alone. */
    detached?: boolean;
    cancelled?: boolean;
    cancel_reason?: string | null;
    /** A maintenance block covers its room: move or cancel it. */
    blocked?: boolean;
    /** Public timetable only: the class is full. */
    full?: boolean;
}

export type BookingStatus = 'Booked' | 'Waitlist' | 'Attended' | 'NoShow' | 'Cancelled';

export interface Booking {
    oid: string;
    session_oid: string;
    member_oid: string;
    member_name: string;
    member_code: string;
    status: BookingStatus;
    /** Cancelled inside the window: counts like a no-show. */
    late_cancel?: boolean;
    source?: 'portal' | 'desk';
    booked_at: string;
}

export interface ClassSessionDetail extends ClassSession {
    roster: Booking[];
    waitlisted: Booking[];
}

export interface Certification {
    name: string;
    issuer: string | null;
    year: number | null;
}

/** A trainer's profile. The public pages get the same shape with `phone: ''` and no account fields. */
export interface Trainer {
    oid: string;
    branch_oid: string;
    branch_name?: string;
    name: string;
    phone: string;
    specialties: string[];
    photo_url: string | null;
    gender: 'Male' | 'Female';
    slug?: string;
    user_oid?: string;
    username?: string;
    headline?: string | null;
    bio?: string | null;
    certifications?: Certification[];
    photo_file_oid?: string | null;
    public?: boolean;
    active?: boolean;
    /** The staff account has a password and is active. */
    can_sign_in?: boolean;
    clients?: number;
}
