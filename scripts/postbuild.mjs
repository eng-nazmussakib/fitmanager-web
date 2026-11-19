// After `ng build`: writes dist/browser/sitemap.xml from the prerendered public routes
// and points robots.txt at it. The site's origin comes from the canonical URL in the prerendered home page
// (environment.siteUrl), so there is one source for it.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist/browser';
const routesFile = existsSync('dist/prerendered-routes.json') ? 'dist/prerendered-routes.json' : null;
if (!routesFile) {
    console.warn('postbuild: no dist/prerendered-routes.json, skipping the sitemap');
    process.exit(0);
}
const { routes } = JSON.parse(readFileSync(routesFile, 'utf8'));
// The origin is read from the first prerendered page there is (the home page, unless the brand has no landing page).
const pageFile = ['/', ...Object.keys(routes)].map(r => join(dist, r === '/' ? 'index.html' : `${r.slice(1)}/index.html`)).find(f => existsSync(f));
if (!pageFile) {
    console.warn('postbuild: no prerendered page, skipping the sitemap');
    process.exit(0);
}
const page = readFileSync(pageFile, 'utf8');
const origin = (page.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? '').replace(/\/$/, '').replace(/^(https?:\/\/[^/]+).*$/, '$1');
if (!origin.startsWith('http')) {
    console.warn('postbuild: no absolute canonical URL in index.html (environment.siteUrl), skipping the sitemap');
    process.exit(0);
}
// The home page is always public.
const paths = [...new Set(['/', ...Object.keys(routes)])].filter(p => !/^\/(me|console|hq|auth|demo|dev)(\/|$)/.test(p));
const today = new Date().toISOString().slice(0, 10);
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map(p => `  <url><loc>${origin}${p === '/' ? '/' : p}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`;
writeFileSync(join(dist, 'sitemap.xml'), xml);
const robots = join(dist, 'robots.txt');
if (existsSync(robots)) writeFileSync(robots, readFileSync(robots, 'utf8').replace(/^Sitemap: .*$/m, `Sitemap: ${origin}/sitemap.xml`));
console.warn(`postbuild: sitemap.xml with ${paths.length} URLs`);
