import { HttpInterceptorFn } from '@angular/common/http';
import { inject, InjectionToken } from '@angular/core';

import { environment } from '@env/environment';

/**
 * The API's address as the SSR server reaches it (VM target, D-027): `API_INTERNAL_URL`, e.g.
 * `http://api:3000/api` inside the Docker network. Provided only by app.config.server.ts, so it is null in the
 * browser and during prerendering without the variable.
 */
export const API_INTERNAL_URL = new InjectionToken<string | null>('API_INTERNAL_URL', { factory: () => null });

/** On the server only: rewrites relative `/api/...` calls to the internal API address. The browser keeps `/api`. */
export const serverApiInterceptor: HttpInterceptorFn = (req, next) => {
    const internal = inject(API_INTERNAL_URL);
    if (!internal || !req.url.startsWith(environment.apiBaseUrl)) return next(req);
    return next(req.clone({ url: internal.replace(/\/$/, '') + req.url.slice(environment.apiBaseUrl.length) }));
};
