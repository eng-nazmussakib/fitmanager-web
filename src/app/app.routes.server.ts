import { RenderMode, ServerRoute } from '@angular/ssr';

import { TENANT } from '@config/tenant';
import { PUBLIC_BRANCH_SLUGS } from '@features/public/public.routes';

import { PUBLIC_RENDER_MODE } from './public-render-mode';

/**
 * Render mode per route (fitmanager-infra/docs/02-architecture.md §4).
 * - Public gym pages are indexable: prerendered on Cloudflare, server-rendered on the VM (PUBLIC_RENDER_MODE).
 * - Info pages come from the brand config and change only with a deploy, so both targets prerender them.
 * - Everything else (auth, portal, consoles, demo) renders in the browser only and is never indexed.
 *
 * Keep PUBLIC_PATHS in step with the public tree in app.routes.ts and with `scripts/check-prerender.mjs`.
 */
export const PUBLIC_PATHS: string[] = TENANT.landing ? ['', 'plans', 'join', 'trainers', 'blog', 'gallery'] : [];
export const INFO_PATHS: string[] = TENANT.landing?.pages.map(p => p.slug) ?? [];

export const serverRoutes: ServerRoute[] = [
    ...PUBLIC_PATHS.map((path): ServerRoute =>
        PUBLIC_RENDER_MODE === RenderMode.Server ? { path, renderMode: RenderMode.Server } : { path, renderMode: RenderMode.Prerender }
    ),
    // One page per branch from the brand config (the slugs the mock and, later, the API use).
    PUBLIC_RENDER_MODE === RenderMode.Server
        ? { path: 'branches/:slug', renderMode: RenderMode.Server }
        : { path: 'branches/:slug', renderMode: RenderMode.Prerender, getPrerenderParams: () => Promise.resolve(PUBLIC_BRANCH_SLUGS.map(slug => ({ slug }))) },
    ...INFO_PATHS.map((path): ServerRoute => ({ path, renderMode: RenderMode.Prerender })),
    { path: '**', renderMode: RenderMode.Client }
];
