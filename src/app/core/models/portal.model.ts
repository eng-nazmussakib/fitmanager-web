import type { Booking, ClassSession } from './class.model';
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
