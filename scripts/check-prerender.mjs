// Prerender check: every public route's HTML in dist/browser has its <h1>, <title>, meta description
// canonical URL and share image (Open Graph and the Twitter card). Run after `npm run build:prod`. Exits 1 on the first missing piece.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist/browser';
const { routes } = JSON.parse(readFileSync('dist/prerendered-routes.json', 'utf8'));
const required = {
    h1: /<h1[\s>]/,
    title: /<title>[^<]{5,}<\/title>/,
    description: /<meta name="description" content="[^"]{20,}"/,
    canonical: /<link rel="canonical" href="https?:\/\/[^"]+"/,
    // The site's share image, or a page's own (a blog post's cover, D-110).
    'og:image': /<meta property="og:image" content="https?:\/\/[^"]+"/,
    // Structured data on every public page (D-110): at least the breadcrumbs or the page's own type.
    'json-ld': /<script id="seo-json-ld" type="application\/ld\+json">\{/,
    'twitter:card': /<meta name="twitter:card" content="summary_large_image"/
};
let failed = 0;
for (const route of Object.keys(routes)) {
    const file = join(dist, route === '/' ? 'index.html' : `${route.slice(1)}/index.html`);
    if (!existsSync(file)) {
        console.error(`✗ ${route}: ${file} missing`);
        failed++;
        continue;
    }
    const html = readFileSync(file, 'utf8');
    const missing = Object.entries(required).filter(([, re]) => !re.test(html)).map(([k]) => k);
    if (missing.length) {
        console.error(`✗ ${route}: missing ${missing.join(', ')}`);
        failed++;
    } else console.warn(`✓ ${route}`);
}
if (!existsSync(join(dist, 'og-image.png'))) {
    console.error('✗ og-image.png (the share image, `npm run brand-images`) missing');
    failed++;
}
if (!existsSync(join(dist, 'index.csr.html'))) {
    console.error('✗ index.csr.html (the shell for client routes) missing');
    failed++;
}
process.exit(failed ? 1 : 0);
