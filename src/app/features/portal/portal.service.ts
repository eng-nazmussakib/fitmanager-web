import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '@core/http/api.service';
import type { Booking, ClassSession } from '@core/models/class.model';
import type { Invoice } from '@core/models/payment.model';
import type { PortalSummary, Progress, RoutineDay } from '@core/models/portal.model';

export type UpcomingBooking = Booking & { session: ClassSession };

/** The member portal's calls (`/v1/me/*`). No branch header: the API knows the member's branch (D-003). */
@Injectable({ providedIn: 'root' })
export class PortalService {
    private readonly _api = inject(ApiService);

    summary(): Observable<PortalSummary> {
        return this._api.get<PortalSummary>('/v1/me/summary');
    }

    bookings(): Observable<{ upcoming: UpcomingBooking[]; available: ClassSession[] }> {
        return this._api.get('/v1/me/bookings');
    }

    book(sessionOid: string): Observable<Booking> {
        return this._api.post<Booking>('/v1/me/bookings', { session_oid: sessionOid });
    }

    cancel(bookingOid: string): Observable<null> {
        return this._api.delete<null>(`/v1/me/bookings/${bookingOid}`);
    }

    routine(): Observable<RoutineDay | null> {
        return this._api.get<RoutineDay | null>('/v1/me/routine/today');
    }

    logWorkout(): Observable<unknown> {
        return this._api.post('/v1/me/workouts', {});
    }

    progress(): Observable<Progress> {
        return this._api.get<Progress>('/v1/me/progress');
    }

    payments(): Observable<Invoice[]> {
        return this._api.get<Invoice[]>('/v1/me/payments');
    }
}
