import { RenderMode, ServerRoute } from '@angular/ssr';

import { TENANT } from '@config/tenant';
import { environment } from '@env/environment';
import { PUBLIC_BRANCH_SLUGS } from '@features/public/public.routes';
import { slug } from '@features/public/public-site.service';

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

/**
 * Where the build reads the website's content (D-109, item 22 b): the live API, unless `SITE_API_ORIGIN=` (empty)
 * builds from the brand config alone (offline). The mock builds answer from the mock.
 */
export function prerenderApiOrigin(): string {
    if (environment.useMockApi) return '';
    const set = typeof process === 'undefined' ? undefined : process.env['SITE_API_ORIGIN'];
    return set ?? environment.siteUrl;
}

/** The posts to prerender: the API's published ones; the brand config's (the seed's slugs) when it cannot be reached. */
async function postSlugs(): Promise<{ slug: string }[]> {
    const fallback = (TENANT.landing?.blog.items ?? []).map(p => ({ slug: slug(p.title) }));
    const origin = prerenderApiOrigin();
    if (!origin) return fallback;
    try {
        const res = await fetch(`${origin}${environment.apiBaseUrl}/v1/public/posts`, { signal: AbortSignal.timeout(10_000) });
        const body = (await res.json()) as { data?: { slug: string }[] };
        return res.ok && body.data ? body.data.map(p => ({ slug: p.slug })) : fallback;
    } catch {
        return fallback;
    }
}

export const serverRoutes: ServerRoute[] = [
    // One page per published post (D-109).
    { path: 'blog/:slug', renderMode: RenderMode.Prerender, getPrerenderParams: postSlugs },
    ...PUBLIC_PATHS.map((path): ServerRoute => ({ path, renderMode: RenderMode.Prerender })),
    // One page per branch from the brand config (the slugs the mock and the API use).
    { path: 'branches/:slug', renderMode: RenderMode.Prerender, getPrerenderParams: () => Promise.resolve(PUBLIC_BRANCH_SLUGS.map(slug => ({ slug }))) },
    ...INFO_PATHS.map((path): ServerRoute => ({ path, renderMode: RenderMode.Prerender })),
    { path: '**', renderMode: RenderMode.Client }
];
