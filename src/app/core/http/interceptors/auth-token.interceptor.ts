import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, map, of, switchMap, throwError } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';

import { SKIP_AUTH } from '../http-context.tokens';

/**
 * 1. Adds `Authorization: Bearer <token>`.
 * 2. On 401, refreshes the token once and retries the request.
 *    Requests that fail while a refresh is running wait for that same refresh
 *    (AuthService.refreshTokens() is single-flight). This is the OMS TokenInterceptor
 *    without the hand-rolled `_isRefreshing` flag and BehaviorSubject.
 * 3. If the refresh fails, the user is logged out.
 */
export const authTokenInterceptor: HttpInterceptorFn = (req, next) => {
    if (req.context.get(SKIP_AUTH)) return next(req);

    const auth = inject(AuthService);
    const token = auth.accessToken();

    return next(token ? withToken(req, token) : req).pipe(
        catchError((err: unknown) => {
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

function withToken<T>(req: HttpRequest<T>, token: string): HttpRequest<T> {
    return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}
