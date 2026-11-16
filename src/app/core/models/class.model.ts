export interface ClassType {
    oid: string;
    name: string;
    /** Theme-independent hue for the scheduler: one of the kit's chart colours. */
    color: 'red' | 'orange' | 'amber' | 'green' | 'teal' | 'blue' | 'violet' | 'pink';
    minutes: number;
}

export interface ClassSession {
    oid: string;
    branch_oid: string;
    type_oid: string;
    type_name: string;
    color: ClassType['color'];
    title: string;
    trainer_oid: string;
    trainer_name: string;
    room: string;
    starts_at: string;
    ends_at: string;
    capacity: number;
    booked: number;
    waitlist: number;
    /** Ladies-only class. */
    ladies_only: boolean;
}

export type BookingStatus = 'Booked' | 'Waitlist' | 'Attended' | 'NoShow' | 'Cancelled';

export interface Booking {
    oid: string;
    session_oid: string;
    member_oid: string;
    member_name: string;
    member_code: string;
    status: BookingStatus;
    booked_at: string;
}

export interface ClassSessionDetail extends ClassSession {
    roster: Booking[];
    waitlisted: Booking[];
}

export interface Trainer {
    oid: string;
    branch_oid: string;
    name: string;
    phone: string;
    specialties: string[];
    photo_url: string | null;
    gender: 'Male' | 'Female';
}
