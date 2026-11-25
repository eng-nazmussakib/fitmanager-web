import { HttpClient, HttpContext } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { finalize, map, Observable, shareReplay, switchMap, tap } from 'rxjs';

import { BranchContextService } from '@core/branch/branch-context.service';
import { API } from '@core/constants/api-endpoints';
import { APP, STORAGE_KEYS } from '@core/constants/app.constants';
import { NOTIFY, SKIP_AUTH } from '@core/http/http-context.tokens';
import { ApiResponse } from '@core/models/api-response.model';
import { AuthTokens, CurrentUser, StaffAssignment } from '@core/models/user.model';
import { StorageService } from '@core/services/storage.service';
import { environment } from '@env/environment';

import { type Action, createAppAbility, type Subject } from './ability';

export interface LoginPayload {
    username: string;
    password: string;
}

/**
 * Session state as signals.
 * Private writable signals, public read-only views: components read the state and only this service changes it.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
    private readonly _http = inject(HttpClient);
    private readonly _router = inject(Router);
    private readonly _storage = inject(StorageService);
    private readonly _branch = inject(BranchContextService);

    private readonly _tokens = signal<AuthTokens | null>(this._storage.get<AuthTokens>(STORAGE_KEYS.AUTH_TOKENS));
    private readonly _user = signal<CurrentUser | null>(null);
    private _refreshInFlight$: Observable<AuthTokens> | null = null;

    readonly user = this._user.asReadonly();
    readonly isLoggedIn = computed(() => !!this._tokens());
    readonly accessToken = computed(() => this._tokens()?.access_token ?? null);
    /** The user's role at the active branch (console) or at HQ (`/hq`); null in the portal and on public pages. */
    readonly activeAssignment = computed<StaffAssignment | null>(() => {
        const branch = this._branch.active();
        return (branch && this._user()?.assignments.find(a => a.branch.oid === branch.oid)) ?? null;
    });
    /**
     * Global rules plus the active branch's rules. Rebuilt when the user or the branch changes, so every `can()`
     * caller (directive effects, computed menus, route guards) follows a branch switch.
     */
    readonly ability = computed(() => createAppAbility([...(this._user()?.rules ?? []), ...(this.activeAssignment()?.rules ?? [])]));

    login(payload: LoginPayload): Observable<CurrentUser> {
        return this._http.post<ApiResponse<AuthTokens>>(`${environment.apiBaseUrl}${API.AUTH.LOGIN}`, payload, { context: publicContext('errors') }).pipe(
            map(res => res.data),
            tap(tokens => this._setTokens(tokens)),
            switchMap(() => this.loadCurrentUser())
        );
    }

    /** Signs in as one of the hosted demo's shared guest accounts, without a password. */
    loginAsGuest(username: string): Observable<CurrentUser> {
        return this._http.post<ApiResponse<AuthTokens>>(`${environment.apiBaseUrl}${API.AUTH.GUEST}`, { username }, { context: publicContext('errors') }).pipe(
            map(res => res.data),
            tap(tokens => this._setTokens(tokens)),
            switchMap(() => this.loadCurrentUser())
        );
    }

    loadCurrentUser(): Observable<CurrentUser> {
        return this._http.get<ApiResponse<CurrentUser>>(`${environment.apiBaseUrl}${API.AUTH.ME}`).pipe(
            map(res => res.data),
            tap(user => this._user.set(user))
        );
    }

    /**
     * Single-flight refresh: when five requests get a 401 at the same moment, they all share ONE refresh call.
     * `shareReplay(1)` multicasts it, and `finalize` clears it so the next expiry starts a new one.
     */
    refreshTokens(): Observable<AuthTokens> {
        const refreshToken = this._tokens()?.refresh_token ?? '';
        const request$ = this._http
            .post<ApiResponse<AuthTokens>>(`${environment.apiBaseUrl}${API.AUTH.REFRESH}`, { refresh_token: refreshToken }, { context: publicContext('none') })
            .pipe(map(res => res.data));
        // Refresh tokens are usually rotated on use: two parallel refreshes would invalidate each other and log the user out.
        this._refreshInFlight$ ??= request$.pipe(
            tap(tokens => this._setTokens(tokens)),
            finalize(() => (this._refreshInFlight$ = null)),
            shareReplay({ bufferSize: 1, refCount: false })
        );
        return this._refreshInFlight$;
    }

    /**
     * Sets the user's own password (replaces a temporary one). The API ends every session and answers with
     * the tokens of a new one, so the user stays signed in here and is signed out everywhere else.
     */
    changePassword(currentPassword: string, newPassword: string): Observable<CurrentUser> {
        return this._http
            .post<ApiResponse<AuthTokens>>(`${environment.apiBaseUrl}${API.AUTH.CHANGE_PASSWORD}`, {
                current_password: currentPassword,
                new_password: newPassword
            })
            .pipe(
                map(res => res.data),
                tap(tokens => this._setTokens(tokens)),
                switchMap(() => this.loadCurrentUser())
            );
    }

    can(action: Action, subject: Subject): boolean {
        return this.ability().can(action, subject);
    }

    logout(opts: { redirect?: boolean; callServer?: boolean } = {}): void {
        const { redirect = true, callServer = true } = opts;
        const tokens = this._tokens();
        if (callServer && tokens) {
            // With its refresh token the server ends THIS session only, not the user's other devices.
            this._http
                .post(
                    `${environment.apiBaseUrl}${API.AUTH.LOGOUT}`,
                    { refresh_token: tokens.refresh_token },
                    { context: new HttpContext().set(NOTIFY, 'none') }
                )
                .subscribe({ error: () => undefined });
        }
        this._tokens.set(null);
        this._user.set(null);
        this._branch.set(null);
        this._storage.remove(STORAGE_KEYS.AUTH_TOKENS);
        if (redirect) void this._router.navigateByUrl(APP.LOGIN_ROUTE);
    }

    private _setTokens(tokens: AuthTokens): void {
        this._tokens.set(tokens);
        this._storage.set(STORAGE_KEYS.AUTH_TOKENS, tokens);
    }
}

function publicContext(notify: 'errors' | 'none'): HttpContext {
    return new HttpContext().set(SKIP_AUTH, true).set(NOTIFY, notify);
}
