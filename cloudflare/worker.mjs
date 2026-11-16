/**
 * The web Worker (target A: Cloudflare Workers, Free plan, D-024/D-026).
 *
 * Workers Static Assets answer every file and prerendered page first (wrangler.jsonc, `html_handling:
 * drop-trailing-slash`, so /plans serves plans/index.html). This script only runs when no asset matches:
 * - `/api/*` goes to the API Worker through a service binding (phase 1; until then a 503);
 * - every other path is a client-rendered route (portal, consoles, auth, demo): it gets the empty app shell
 *   `index.csr.html` (not `index.html`, which is the prerendered landing page) with `noindex`.
 * Almost no CPU per request, well inside the Free plan's 10 ms.
 */
export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
            if (env.API) return env.API.fetch(request);
            return Response.json({ code: 503, message: 'The API is not deployed yet' }, { status: 503 });
        }
        const shell = await env.ASSETS.fetch(new URL('/index.csr.html', url));
        const headers = new Headers(shell.headers);
        headers.set('X-Robots-Tag', 'noindex, nofollow');
        headers.set('Cache-Control', 'no-store');
        return new Response(shell.body, { status: 200, headers });
    }
};
