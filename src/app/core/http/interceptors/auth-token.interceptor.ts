import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, map, of, switchMap, throwError } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { APP } from '@core/constants/app.constants';
import { PASSWORD_CHANGE_REQUIRED } from '@core/models/staff.model';

import { SKIP_AUTH } from '../http-context.tokens';

/**
 * 1. Adds `Authorization: Bearer <token>`.
 * 2. On 401, refreshes the token once and retries the request.
 *    Requests that fail while a refresh is running wait for that same refresh
 *    (AuthService.refreshTokens() is single-flight), with no hand-rolled `_isRefreshing` flag or BehaviorSubject.
 * 3. If the refresh fails, the user is logged out.
 * 4. On the API's 403 `PASSWORD_CHANGE_REQUIRED` (an admin reset the password while the user was signed in, D-054),
 *    opens the password page.
 */
export const authTokenInterceptor: HttpInterceptorFn = (req, next) => {
    if (req.context.get(SKIP_AUTH)) return next(req);

    const auth = inject(AuthService);
    const router = inject(Router);
    const token = auth.accessToken();

    return next(token ? withToken(req, token) : req).pipe(
        catchError((err: unknown) => {
            if (isPasswordChangeRequired(err)) {
                void router.navigate([APP.PASSWORD_ROUTE], { queryParams: { returnUrl: router.url } });
                return throwError(() => err);
            }
            if (!(err instanceof HttpErrorResponse) || err.status !== 401 || !token) return throwError(() => err);

            // Another request's refresh may have finished while this one was in flight with the old token:
            // retry with the current token. Refreshing again would spend the rotated refresh token twice
            // (the second refresh fails and logs the user out). Only a 401 on the CURRENT token refreshes.
            const current = auth.accessToken();
            const fresh$ = current && current !== token ? of(current) : auth.refreshTokens().pipe(map(tokens => tokens.access_token));
            return fresh$.pipe(
                switchMap(fresh => next(withToken(req, fresh))),
                catchError((refreshErr: unknown) => {
                    auth.logout({ redirect: true, callServer: false });
                    return throwError(() => refreshErr);
                })
            );
        })
    );
};

function isPasswordChangeRequired(err: unknown): boolean {
    if (!(err instanceof HttpErrorResponse) || err.status !== 403) return false;
    const errors = (err.error as { errors?: { path?: string }[] } | null)?.errors;
    return errors?.[0]?.path === PASSWORD_CHANGE_REQUIRED;
}

function withToken<T>(req: HttpRequest<T>, token: string): HttpRequest<T> {
    return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}
