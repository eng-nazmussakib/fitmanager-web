import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of } from 'rxjs';

import { API } from '@core/constants/api-endpoints';
import { NOTIFY, SKIP_AUTH } from '@core/http/http-context.tokens';
import type { ApiResponse } from '@core/models/api-response.model';
import { environment } from '@env/environment';
import type { IconName } from '@shared/ui/icon/icons';

export interface DemoRole {
    username: string;
    role: string;
    icon: IconName;
    /** What this role shows in the demo (phase 0.5 brief). */
    blurb: string;
}

export interface DemoAccount extends DemoRole {
    password: string;
    name: string;
}

/**
 * The roles shown on /demo. Credentials are NOT here: they come from the mock API (`GET /v1/demo/accounts`), which
 * exists only in mock builds, so a production bundle never contains a demo password (`npm run check:no-mock`).
 */
export const DEMO_ROLES: DemoRole[] = [
    { username: 'owner', role: 'Owner (HQ)', icon: 'building-2', blurb: 'Compare branches on the HQ dashboard: revenue, dues, attendance, retention.' },
    {
        username: 'manager.gulshan',
        role: 'Branch manager',
        icon: 'shield-check',
        blurb: 'Run Gulshan: dashboard, members, payments, and override a blocked check-in.'
    },
    { username: 'desk.gulshan', role: 'Front desk', icon: 'scan-line', blurb: 'Scan member cards at check-in, sell and renew memberships, take payments.' },
    { username: 'trainer.gulshan', role: 'Trainer', icon: 'dumbbell', blurb: 'See my classes for the week, mark attendance, book members from the waitlist.' },
    { username: 'member.demo', role: 'Member', icon: 'user', blurb: 'The member app on a phone: membership card, routine, bookings, progress.' }
];

/** Demo accounts from the mock, joined with the role descriptions. Empty outside mock builds. */
@Injectable({ providedIn: 'root' })
export class DemoAccountsService {
    private readonly _http = inject(HttpClient);

    accounts(): Observable<DemoAccount[]> {
        if (!environment.useMockApi) return of([]);
        return this._http
            .get<ApiResponse<{ username: string; password: string; name: string }[]>>(`${environment.apiBaseUrl}${API.DEMO.ACCOUNTS}`, {
                context: new HttpContext().set(SKIP_AUTH, true).set(NOTIFY, 'none')
            })
            .pipe(
                map(r => DEMO_ROLES.flatMap(role => r.data.filter(a => a.username === role.username).map(a => ({ ...role, ...a })))),
                catchError(() => of([]))
            );
    }
}
