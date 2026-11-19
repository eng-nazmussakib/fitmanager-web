import { RenderMode, ServerRoute } from '@angular/ssr';

import { TENANT } from '@config/tenant';
import { PUBLIC_BRANCH_SLUGS } from '@features/public/public.routes';

/**
 * Render mode per route (fitmanager-infra/docs/02-architecture.md §4). Every build is static (D-075):
 * - the public gym pages and the info pages from the brand config are prerendered at build time, so they are
 *   indexable and cost no CPU per request on Cloudflare's Free plan (D-026);
 * - everything else (auth, portal, consoles, demo) renders in the browser only and is never indexed.
 *
 * Keep PUBLIC_PATHS in step with the public tree in app.routes.ts and with `scripts/check-prerender.mjs`.
 */
export const PUBLIC_PATHS: string[] = TENANT.landing ? ['', 'plans', 'join', 'trainers', 'blog', 'gallery'] : [];
export const INFO_PATHS: string[] = TENANT.landing?.pages.map(p => p.slug) ?? [];

export const serverRoutes: ServerRoute[] = [
    ...PUBLIC_PATHS.map((path): ServerRoute => ({ path, renderMode: RenderMode.Prerender })),
    // One page per branch from the brand config (the slugs the mock and the API use).
    { path: 'branches/:slug', renderMode: RenderMode.Prerender, getPrerenderParams: () => Promise.resolve(PUBLIC_BRANCH_SLUGS.map(slug => ({ slug }))) },
    ...INFO_PATHS.map((path): ServerRoute => ({ path, renderMode: RenderMode.Prerender })),
    { path: '**', renderMode: RenderMode.Client }
];
