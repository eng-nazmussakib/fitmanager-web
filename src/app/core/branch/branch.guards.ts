import { inject } from '@angular/core';
import { CanMatchFn, Router, UrlTree } from '@angular/router';
import { map, Observable, of } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { APP } from '@core/constants/app.constants';
import type { CurrentUser } from '@core/models/user.model';

import { BranchContextService } from './branch-context.service';

/** Where a user lands after signing in: owner → HQ dashboard, staff → their first branch, member → portal. */
export function homeUrl(user: CurrentUser | null): string {
    if (!user) return APP.LOGIN_ROUTE;
    if (user.kind === 'member') return '/me';
    const branches = user.assignments.filter(a => a.branch.kind === 'BRANCH');
    if (user.assignments.some(a => a.branch.kind === 'HQ')) return '/hq/dashboard';
    const first = branches[0];
    if (!first) return '/forbidden';
    return first.role === 'FRONT_DESK'
        ? `/console/${first.branch.slug}/check-in`
        : first.role === 'TRAINER'
          ? `/console/${first.branch.slug}/classes`
          : `/console/${first.branch.slug}/dashboard`;
}

/** The current user, loading it first when only the tokens are known (after a reload). */
function user$(auth: AuthService): Observable<CurrentUser | null> {
    return auth.user() ? of(auth.user()) : auth.loadCurrentUser();
}

/**
 * `console/:branch`: the branch in the URL must be one of the user's assignments. Sets the branch context, so
 * children's `canMatchAbility` guards (which run after this parent canMatch) already see that branch's rules.
 * Runs after `authGuard` on a parent route, so the user is loaded.
 */
export const branchMatch: CanMatchFn = (_route, segments) => {
    const auth = inject(AuthService);
    const context = inject(BranchContextService);
    const router = inject(Router);
    const slug = segments[1]?.path ?? segments[0]?.path;
    return user$(auth).pipe(
        map((user): boolean | UrlTree => {
            const assignment = user?.assignments.find(a => a.branch.kind === 'BRANCH' && a.branch.slug === slug);
            if (!assignment) return router.createUrlTree(['/forbidden']);
            context.set(assignment.branch);
            return true;
        })
    );
};

/** `/console` with no branch: the user's first branch. */
export const firstBranchRedirect: CanMatchFn = () => {
    const router = inject(Router);
    return user$(inject(AuthService)).pipe(
        map(user => {
            const first = user?.assignments.find(a => a.branch.kind === 'BRANCH');
            return router.createUrlTree(first ? ['/console', first.branch.slug, 'dashboard'] : ['/forbidden']);
        })
    );
};

/** `/hq`: HQ staff only. The HQ row becomes the branch context (D-023). */
export const hqMatch: CanMatchFn = () => {
    const auth = inject(AuthService);
    const context = inject(BranchContextService);
    const router = inject(Router);
    return user$(auth).pipe(
        map(user => {
            const hq = user?.assignments.find(a => a.branch.kind === 'HQ');
            if (!hq) return router.createUrlTree(['/forbidden']);
            context.set(hq.branch);
            return true;
        })
    );
};

/** `/me`: members only. A member has no branch context: the API knows their branch from the token. */
export const memberMatch: CanMatchFn = () => {
    const auth = inject(AuthService);
    const context = inject(BranchContextService);
    const router = inject(Router);
    return user$(auth).pipe(
        map(user => {
            context.set(null);
            return user?.kind === 'member' ? true : router.createUrlTree([homeUrl(user)]);
        })
    );
};

/** `/home`: sends a signed-in user to their landing page (homeUrl). */
export const homeRedirect: CanMatchFn = () => {
    const router = inject(Router);
    return user$(inject(AuthService)).pipe(map(user => router.createUrlTree([homeUrl(user)])));
};
