import { HttpInterceptorFn, HttpParams, HttpRequest, HttpResponse } from '@angular/common/http';
import { defer, delay, dematerialize, materialize, Observable, of, throwError } from 'rxjs';

import { PASSWORD_CHANGE_REQUIRED } from '@core/models/staff.model';
import { environment } from '@env/environment';

import { ATTENDANCE_ROUTES } from './handlers/attendance.handlers';
import { accountFromToken, AUTH_ROUTES } from './handlers/auth.handlers';
import { BUSINESS_ROUTES } from './handlers/business.handlers';
import { CLASS_ROUTES } from './handlers/classes.handlers';
import { CORE_ROUTES } from './handlers/core.handlers';
import { DASHBOARD_ROUTES } from './handlers/dashboard.handlers';
import { GOVERNANCE_ROUTES } from './handlers/governance.handlers';
import { INBOX_ROUTES } from './handlers/inbox.handlers';
import { MEMBER_ROUTES } from './handlers/members.handlers';
import { PLAN_ROUTES } from './handlers/plans.handlers';
import { PORTAL_ROUTES } from './handlers/portal.handlers';
import { REPORT_ROUTES } from './handlers/reports.handlers';
import { SALES_ROUTES } from './handlers/sales.handlers';
import { SCHEDULING_ROUTES } from './handlers/scheduling.handlers';
import { SETTINGS_ROUTES } from './handlers/settings.handlers';
import { STAFF_ROUTES } from './handlers/staff.handlers';
import { TRAINING_ROUTES } from './handlers/training.handlers';
import { WEBSITE_ROUTES } from './handlers/website.handlers';
import { abilityFor, type Ctx, httpError, MockError, type Route } from './http';
import { dhakaNow } from './seed/clock';
import { db, fastMode } from './store';

const ROUTES: Route[] = [
    ...AUTH_ROUTES,
    ...INBOX_ROUTES,
    ...WEBSITE_ROUTES,
    ...GOVERNANCE_ROUTES,
    ...BUSINESS_ROUTES,
    ...REPORT_ROUTES,
    ...SCHEDULING_ROUTES,
    ...TRAINING_ROUTES,
    ...MEMBER_ROUTES,
    ...SALES_ROUTES,
    ...PLAN_ROUTES,
    ...CORE_ROUTES,
    ...ATTENDANCE_ROUTES,
    ...CLASS_ROUTES,
    ...DASHBOARD_ROUTES,
    ...PORTAL_ROUTES,
    ...SETTINGS_ROUTES,
    ...STAFF_ROUTES
];

/**
 * The mock API: answers `${apiBaseUrl}/v1/*` in memory with the API's envelope `{ code, message, data }`. It is
 * the API contract, and it enforces what the API does:
 * - 401 without a valid token (tokens expire; the auth interceptor refreshes once and retries);
 * - branch scoping: `X-Branch-Id` must be a branch the user is assigned to (403 otherwise), and handlers only
 *   read rows of that branch (another branch's member is a 404);
 * - permissions: each route's CASL check, against the same rules the UI received (403).
 * Registered LAST, so the other interceptors see its responses as they would see a server's. Latency of
 * 250–600 ms keeps loading states visible ("fast mode" in the demo banner turns it down).
 */
export const mockApiInterceptor: HttpInterceptorFn = (req, next) => {
    if (!req.url.startsWith(environment.apiBaseUrl)) return next(req);
    const path = req.url.slice(environment.apiBaseUrl.length).split('?')[0];
    const route = ROUTES.find(r => r.method === req.method && r.path.test(path));
    if (!route) return path.startsWith('/v1/') ? throwError(() => httpError(404, `Mock: no handler for ${req.method} ${path}`)) : next(req);
    const latency = fastMode() ? 30 : 250 + Math.random() * 350;
    return defer(() => handle(req, path, route)).pipe(materialize(), delay(latency), dematerialize());
};

function handle(req: HttpRequest<unknown>, path: string, route: Route): Observable<HttpResponse<unknown>> {
    try {
        const d = db();
        const account = route.scope === 'public' ? null : accountFromToken(req.headers.get('Authorization'));
        if (route.scope !== 'public' && !account) return throwError(() => httpError(401, 'Token expired or invalid'));
        const user = account?.user ?? null;
        // A temporary password: only /auth/me, change-password and sign-out answer until it is replaced.
        if (user?.must_change_password && !/^\/v1\/auth\/(me|change-password|logout)$/.test(path))
            return throwError(() =>
                httpError(403, 'Set a new password to continue', [{ path: PASSWORD_CHANGE_REQUIRED, message: 'Set a new password to continue' }])
            );

        let branch = null;
        const header = req.headers.get('X-Branch-Id');
        if (route.scope === 'branch' || route.scope === 'hq' || route.scope === 'staff') {
            if (user?.kind !== 'staff') return throwError(() => httpError(403, 'Staff only'));
            const assignment = user.assignments.find(a => a.branch.oid === header);
            if (!header || !assignment) return throwError(() => httpError(403, 'You do not work at this branch'));
            if (route.scope === 'branch' && assignment.branch.kind !== 'BRANCH')
                return throwError(() => httpError(400, 'Choose a branch: this is a branch operation'));
            if (route.scope === 'hq' && assignment.branch.kind !== 'HQ') return throwError(() => httpError(403, 'HQ only'));
            branch = d.branches.find(b => b.oid === assignment.branch.oid) ?? null;
        }
        if (route.scope === 'member' && user?.kind !== 'member') return throwError(() => httpError(403, 'Members only'));

        const ability = abilityFor(user, branch);
        if (route.can && !ability.can(...route.can)) return throwError(() => httpError(403, 'You do not have permission to do this'));

        const ctx: Ctx = {
            req,
            params: route.path.exec(path)!.slice(1),
            query: new HttpParams({ fromString: req.urlWithParams.split('?')[1] ?? '' }),
            body: (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>,
            account,
            user,
            branch,
            ability,
            now: dhakaNow()
        };
        return of(route.handler(ctx));
    } catch (err) {
        if (err instanceof MockError) return throwError(() => httpError(err.status, err.message));
        console.error('[mock]', req.method, path, err);
        return throwError(() => httpError(500, 'Mock server error'));
    }
}
