import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '@core/http/api.service';
import type { Booking, ClassSession } from '@core/models/class.model';
import type { Invoice } from '@core/models/payment.model';
import type { PortalSummary } from '@core/models/portal.model';
import type { MemberPt, PortalBookings, PtSession, PtSlots } from '@core/models/scheduling.model';

export type UpcomingBooking = Booking & { session: ClassSession };

/** The member portal's calls (`/v1/me/*`). No branch header: the API knows the member's branch (D-003). */
@Injectable({ providedIn: 'root' })
export class PortalService {
    private readonly _api = inject(ApiService);

    summary(): Observable<PortalSummary> {
        return this._api.get<PortalSummary>('/v1/me/summary');
    }

    bookings(): Observable<PortalBookings> {
        return this._api.get<PortalBookings>('/v1/me/bookings');
    }

    pt(): Observable<MemberPt> {
        return this._api.get<MemberPt>('/v1/me/pt');
    }

    ptSlots(date: string): Observable<PtSlots> {
        return this._api.get<PtSlots>('/v1/me/pt/slots', { date });
    }

    bookPt(date: string, startTime: string): Observable<PtSession> {
        return this._api.post<PtSession>('/v1/me/pt-sessions', { date, start_time: startTime });
    }

    cancelPt(oid: string): Observable<null> {
        return this._api.post<null>(`/v1/me/pt-sessions/${oid}/cancel`, {});
    }

    book(sessionOid: string): Observable<Booking> {
        return this._api.post<Booking>('/v1/me/bookings', { session_oid: sessionOid });
    }

    cancel(bookingOid: string): Observable<null> {
        return this._api.delete<null>(`/v1/me/bookings/${bookingOid}`);
    }

    payments(): Observable<Invoice[]> {
        return this._api.get<Invoice[]>('/v1/me/payments');
    }
}
