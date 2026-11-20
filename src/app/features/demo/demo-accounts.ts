import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of } from 'rxjs';

import { API } from '@core/constants/api-endpoints';
import { NOTIFY, SKIP_AUTH } from '@core/http/http-context.tokens';
import type { ApiResponse } from '@core/models/api-response.model';
import { environment } from '@env/environment';
import type { IconName } from '@shared/ui/icon/icons';

export interface DemoRole {
    /** The mock's demo account for this role. */
    username: string;
    /** The role code the API's guest list names (D-076): matches a guest account to its card. */
    key: 'OWNER' | 'HQ_ADMIN' | 'BRANCH_MANAGER' | 'FRONT_DESK' | 'TRAINER' | 'MEMBER';
    role: string;
    icon: IconName;
    /** What this role shows in the demo (phase 0.5 brief). */
    blurb: string;
    /** The blurb on the hosted demo when it differs: the real API has no later features (D-070 c). */
    guestBlurb?: string;
}

export interface DemoAccount extends DemoRole {
    /** Mock builds only. A guest account (D-076) has none: the API signs it in without one. */
    password?: string;
    name: string;
}

/**
 * The roles shown on /demo. Credentials are NOT here: in mock builds they come from the mock API
 * (`GET /v1/demo/accounts`); on the hosted demo the cards are the API's guest accounts (`GET /v1/auth/guest`, D-076),
 * which sign in without a password. Either way a production bundle never contains a demo password
 * (`npm run check:no-mock`).
 */
export const DEMO_ROLES: DemoRole[] = [
    {
        username: 'owner',
        key: 'OWNER',
        role: 'Owner (HQ)',
        icon: 'building-2',
        blurb: 'Compare branches on the HQ dashboard: revenue, dues, attendance, retention.'
    },
    {
        username: 'admin.hq',
        key: 'HQ_ADMIN',
        role: 'HQ admin',
        icon: 'clipboard-list',
        blurb: 'Run HQ for the owner: branch plans and prices, branch staff, VAT settings, every branch read-only.'
    },
    {
        username: 'manager.gulshan',
        key: 'BRANCH_MANAGER',
        role: 'Branch manager',
        icon: 'shield-check',
        blurb: 'Run Gulshan: dashboard, members, payments, and override a blocked check-in.'
    },
    {
        username: 'desk.gulshan',
        key: 'FRONT_DESK',
        role: 'Front desk',
        icon: 'scan-line',
        blurb: 'Scan member cards at check-in, sell and renew memberships, take payments.'
    },
    {
        username: 'trainer.gulshan',
        key: 'TRAINER',
        role: 'Trainer',
        icon: 'dumbbell',
        blurb: 'See my classes for the week, mark attendance, book members from the waitlist.'
    },
    {
        username: 'member.demo',
        key: 'MEMBER',
        role: 'Member',
        icon: 'user',
        blurb: 'The member app on a phone: membership card, routine, bookings, progress.',
        guestBlurb: 'The member portal on a phone: membership status, classes and PT, routine and progress, invoices and visits.'
    }
];

/** One of the API's guest accounts (D-076). */
interface GuestAccount {
    username: string;
    name: string;
    kind: 'staff' | 'member';
    role: string;
}

/** Both lists are public, and a failure only leaves the picker empty: no token, no toast. */
const publicContext = (): HttpContext => new HttpContext().set(SKIP_AUTH, true).set(NOTIFY, 'none');

/**
 * The /demo cards: the mock's demo accounts (mock builds) or the API's guest accounts (the hosted demo), joined with
 * the role descriptions. Empty when neither is on.
 */
@Injectable({ providedIn: 'root' })
export class DemoAccountsService {
    private readonly _http = inject(HttpClient);

    accounts(): Observable<DemoAccount[]> {
        if (environment.useMockApi) return this._mockAccounts();
        if (environment.guestAccess) return this._guestAccounts();
        return of([]);
    }

    private _guestAccounts(): Observable<DemoAccount[]> {
        return this._http.get<ApiResponse<GuestAccount[]>>(`${environment.apiBaseUrl}${API.AUTH.GUEST}`, { context: publicContext() }).pipe(
            map(r =>
                DEMO_ROLES.flatMap(role =>
                    r.data.filter(g => g.role === role.key).map(g => ({ ...role, blurb: role.guestBlurb ?? role.blurb, username: g.username, name: g.name }))
                )
            ),
            catchError(() => of([]))
        );
    }

    private _mockAccounts(): Observable<DemoAccount[]> {
        return this._http
            .get<ApiResponse<{ username: string; password: string; name: string }[]>>(`${environment.apiBaseUrl}${API.DEMO.ACCOUNTS}`, {
                context: publicContext()
            })
            .pipe(
                map(r => DEMO_ROLES.flatMap(role => r.data.filter(a => a.username === role.username).map(a => ({ ...role, ...a })))),
                catchError(() => of([]))
            );
    }
}
