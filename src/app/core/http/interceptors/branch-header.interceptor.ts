import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { BranchContextService } from '@core/branch/branch-context.service';
import { environment } from '@env/environment';

/** Paths that are not scoped to a branch (sign-in, the public site). */
const UNSCOPED = ['/v1/auth/', '/v1/public/'];

/**
 * Sends the console's active branch as `X-Branch-Id` (D-014). The API checks it against the user's assignments on
 * every request and scopes the query to it (app-layer filter + RLS, D-004). No header in the portal: the API
 * takes a member's branch from their account.
 */
export const branchHeaderInterceptor: HttpInterceptorFn = (req, next) => {
    const branch = inject(BranchContextService).active();
    if (!branch || !req.url.startsWith(environment.apiBaseUrl)) return next(req);
    const path = req.url.slice(environment.apiBaseUrl.length);
    if (UNSCOPED.some(p => path.startsWith(p))) return next(req);
    return next(req.clone({ setHeaders: { 'X-Branch-Id': branch.oid } }));
};
