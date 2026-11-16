import { AngularNodeAppEngine, createNodeRequestHandler, isMainModule, writeResponseToNodeResponse } from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';

/**
 * The Node SSR server of the VM target (D-027): Docker image `prod` stage, behind nginx. Cloudflare (the primary
 * target) does not use it: there the public pages are prerendered and served as static files.
 *
 * - `/healthz` for the container health check.
 * - Hashed bundles: cached for a year (immutable); other files revalidate.
 * - Public pages (rendered here per request): `Cache-Control: public, max-age=300, stale-while-revalidate=600`.
 * - Everything client-rendered (auth, portal, consoles, demo): `X-Robots-Tag: noindex` and no caching.
 * - The API is reached at API_INTERNAL_URL (see server-api.interceptor.ts); nginx proxies the browser's `/api`.
 */
const browserDistFolder = join(import.meta.dirname, '../browser');
const PRIVATE = /^\/(auth|me|console|hq|demo|dev|forbidden)(\/|$)/;
const HASHED = /-[A-Za-z0-9_-]{8}\.(js|css|mjs)$/;

const app = express();
// SSRF protection: only these Host headers are rendered. Set NG_ALLOWED_HOSTS (comma-separated) in the container,
// e.g. `www.example.com,localhost`; without it, only localhost (health checks, local runs).
const angularApp = new AngularNodeAppEngine(process.env['NG_ALLOWED_HOSTS'] ? {} : { allowedHosts: ['localhost', '127.0.0.1'] });

app.disable('x-powered-by');

app.get('/healthz', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ status: 'ok' });
});

app.use(
    express.static(browserDistFolder, {
        index: false,
        redirect: false,
        setHeaders: (res, path) => {
            res.setHeader('Cache-Control', HASHED.test(path) ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate');
        }
    })
);

app.use((req, res, next) => {
    angularApp
        .handle(req)
        .then(response => {
            if (!response) return next();
            if (PRIVATE.test(req.path)) {
                response.headers.set('X-Robots-Tag', 'noindex, nofollow');
                response.headers.set('Cache-Control', 'no-store');
            } else if (!response.headers.has('Cache-Control')) {
                response.headers.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
            }
            return writeResponseToNodeResponse(response, res);
        })
        .catch(next);
});

if (isMainModule(import.meta.url) || process.env['pm_id']) {
    const port = Number(process.env['PORT'] ?? 4000);
    app.listen(port, error => {
        if (error) throw error;
        console.warn(`SSR server listening on http://localhost:${port}`);
    });
}

/** Request handler used by the Angular CLI (dev server and build). */
export const reqHandler = createNodeRequestHandler(app);
