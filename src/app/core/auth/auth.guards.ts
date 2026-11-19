import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router, UrlTree } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { APP } from '@core/constants/app.constants';

import type { Action, Subject } from './ability';
import { AuthService } from './auth.service';

/**
 * Protects the authenticated shell and makes sure the current user is loaded before any child route is matched.
 *
 * Why CanMatch and not a resolver (`resolve: { userInfo }`):
 * the router runs `canMatch` while matching, parent before children, and before any `canActivate` or `resolve`.
 * Loading the user here means child `canMatchAbility` guards (also canMatch) can already read the ability.
 * With a resolver they would see `user === null`.
 */
export const authGuard: CanMatchFn = (_route, segments) => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const returnUrl = '/' + segments.map(s => s.path).join('/');
    const toLogin = router.createUrlTree([APP.LOGIN_ROUTE], { queryParams: { returnUrl } });
    // A temporary password (D-054): the password page first; the API refuses everything else until then.
    const passwordFirst = (): true | UrlTree =>
        auth.user()?.must_change_password && returnUrl !== APP.PASSWORD_ROUTE
            ? router.createUrlTree([APP.PASSWORD_ROUTE], { queryParams: { returnUrl } })
            : true;

    if (!auth.isLoggedIn()) return toLogin;
    if (auth.user()) return passwordFirst();

    return auth.loadCurrentUser().pipe(
        map(() => passwordFirst()),
        catchError(() => {
            auth.logout({ redirect: false, callServer: false });
            return of(toLogin);
        })
    );
};

/** Keeps signed-in users away from /auth pages. */
export const guestGuard: CanActivateFn = () => {
    const auth = inject(AuthService);
    return auth.isLoggedIn() ? inject(Router).createUrlTree([APP.HOME_ROUTE]) : true;
};

/**
 * Route-level ability check: `canMatch: [canMatchAbility('read', 'Item')]`.
 * A typed factory instead of a role guard reading `data: { permission: '...' }`: a typo is a compile error,
 * and as a CanMatch guard the lazy chunk is never downloaded for users without the ability.
 * Fail-closed: no rules loaded → no match → /forbidden.
 */
export function canMatchAbility(action: Action, subject: Subject): CanMatchFn {
    return () => inject(AuthService).can(action, subject) || inject(Router).createUrlTree(['/forbidden']);
}
