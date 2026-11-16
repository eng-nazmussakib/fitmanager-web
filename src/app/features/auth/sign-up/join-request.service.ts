import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { API } from '@core/constants/api-endpoints';
import { NOTIFY, SKIP_AUTH } from '@core/http/http-context.tokens';
import { ApiResponse } from '@core/models/api-response.model';
import { environment } from '@env/environment';

export interface JoinRequestPayload {
    fullName: string;
    phone: string;
    email?: string;
    branch: string;
    plan: string;
    period: string;
    password: string;
}

export interface JoinRequest {
    id: string;
    status: 'pending';
}

/**
 * Sign-up sends a join request. Payments are taken at the front desk (D-009), so the account becomes an active
 * membership only when the branch takes the first payment.
 */
@Injectable({ providedIn: 'root' })
export class JoinRequestService {
    private readonly _http = inject(HttpClient);

    send(payload: JoinRequestPayload): Observable<JoinRequest> {
        const context = new HttpContext().set(SKIP_AUTH, true).set(NOTIFY, 'errors');
        return this._http.post<ApiResponse<JoinRequest>>(`${environment.apiBaseUrl}${API.JOIN_REQUESTS}`, payload, { context }).pipe(map(res => res.data));
    }
}
