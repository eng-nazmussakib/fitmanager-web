// Draws the brand's PNG images, then commit them; run it again after changing the brand (Q-006): `npm run brand-images`.
// - public/og-image.png (1200×630): the share image every public page sends as og:image and the Twitter card, built
//   from the SHARE text below and the brand config (first theme, hero photo);
// - public/icons/icon-192.png, icon-512.png (the manifest's install icons) and apple-touch-icon.png (180, iOS home
//   screen), from public/favicon.svg: browsers that install a web app need PNGs, not only the SVG. Needs Playwright's Chromium
// (`npx playwright install chromium`) and the network, for the Google Fonts the site uses.
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { chromium } from '@playwright/test';

import { TENANT } from '../src/app/config/tenant.ts';

const OUT = 'public/og-image.png';
const { themes, landing } = TENANT;
const theme = themes[0];
const [bg, , card] = theme.surfaces ?? ['#181818', '#1b1b1b', '#232323'];
const hero = landing?.hero.image.src;
const photo = hero ? `data:image/webp;base64,${readFileSync(join('public', hero)).toString('base64')}` : '';
// The public host, from the production build's siteUrl (the file has value imports, so it is read, not imported).
const host = readFileSync('src/environments/environment.prod.ts', 'utf8').match(/siteUrl: '(?:https?:\/\/)?([^'/]*)/)?.[1] ?? '';
// For now the share image names the product, not the demo gym's brand (switch back to brand.* once Q-006 is settled).
const SHARE = {
    kicker: 'Gym management · live demo',
    name: ['Fit', 'Manager'],
    lead: 'Members, plans, payments and check-ins for every branch of your gym.'
};
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Rubik+Dirt&family=Vazirmatn:wght@400;600;800&display=block" rel="stylesheet">
<style>
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; overflow: hidden; background: ${bg}; color: #fff; font-family: 'Vazirmatn', sans-serif; }
  .photo { position: absolute; right: 30px; bottom: 0; height: 600px;
          mask-image: radial-gradient(ellipse 60% 58% at 50% 50%, #000 75%, transparent 100%); }
  .bar { position: absolute; left: 0; top: 0; bottom: 0; width: 14px; background: ${theme.primary}; }
  .text { position: absolute; left: 84px; top: 0; bottom: 0; width: 600px; display: flex; flex-direction: column; justify-content: center; gap: 22px; }
  .kicker { font-size: 26px; font-weight: 600; letter-spacing: .18em; text-transform: uppercase; color: ${theme.secondary}; }
  .name { font-family: 'Rubik Dirt', sans-serif; font-size: 84px; line-height: .98; }
  .name em { font-style: normal; color: ${theme.primary}; }
  .lead { font-size: 30px; line-height: 1.35; color: #d4d4d4; max-width: 560px; }
  .url { margin-top: 18px; align-self: flex-start; padding: 10px 22px; border-radius: 999px; background: ${card};
         font-size: 24px; font-weight: 600; color: #e5e5e5; border: 2px solid ${theme.primary}; }
</style></head><body>
  ${photo ? `<img class="photo" src="${photo}" alt="">` : ''}
  <div class="bar"></div>
  <div class="text">
    <div class="kicker">${esc(SHARE.kicker)}</div>
    <div class="name">${esc(SHARE.name[0])}<em>${esc(SHARE.name[1])}</em></div>
    <div class="lead">${esc(SHARE.lead)}</div>
    ${host ? `<div class="url">${esc(host)}</div>` : ''}
  </div>
</body></html>`;

const browser = await chromium.launch();
try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: OUT, type: 'png' });
    console.warn(`brand-images: wrote ${OUT}`);

    // The icons: the favicon on a full square (no transparent corners, which iOS fills with black), at each size.
    mkdirSync('public/icons', { recursive: true });
    const svg = `data:image/svg+xml;base64,${readFileSync('public/favicon.svg').toString('base64')}`;
    for (const [file, size] of [['public/icons/icon-192.png', 192], ['public/icons/icon-512.png', 512], ['public/icons/apple-touch-icon.png', 180]]) {
        await page.setViewportSize({ width: size, height: size });
        await page.setContent(`<body style="margin:0;background:${theme.primary}"><img src="${svg}" width="${size}" height="${size}" style="display:block"></body>`);
        await page.screenshot({ path: file, type: 'png' });
        console.warn(`brand-images: wrote ${file}`);
    }
} finally {
    await browser.close();
}
