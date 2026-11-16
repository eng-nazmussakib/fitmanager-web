import type { Booking, ClassSession } from './class.model';
import type { Measurement } from './member.model';
import type { Subscription } from './subscription.model';

/** `GET /v1/me/summary`: the portal home. */
export interface PortalSummary {
    member: { oid: string; code: string; name: string; photo_url: string | null; branch_name: string; status: string };
    subscription: Subscription | null;
    days_left: number | null;
    days_total: number | null;
    dues: number;
    next_booking: (Booking & { session: ClassSession }) | null;
    streak_days: number;
    visits_this_month: number;
}

export interface Exercise {
    name: string;
    sets: number;
    reps: string;
    rest_s: number;
    note?: string;
}

/** `GET /v1/me/routine/today`. */
export interface RoutineDay {
    title: string;
    focus: string;
    trainer_name: string;
    exercises: Exercise[];
    logged_today: boolean;
}

export interface Progress {
    measurements: Measurement[];
    /** Visits per week for the last 12 weeks. */
    weekly_visits: { week: string; visits: number }[];
    streak_days: number;
}
