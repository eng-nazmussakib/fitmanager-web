---
name: fitmanager-web
description: Conventions and workflow for the FitManager web app (Angular 22, zoneless/signals, Tailwind 4, in-house UI kit, SSR for public pages, CASL). Use for any work in fitmanager-web — pages, components, the design system, public SEO pages, member portal, branch/HQ consoles, demo mode and mocks, routing, tests, or the web SSR setup on Cloudflare Workers.
---

# FitManager Web

Angular app for **FitManager**, a gym management system for a multi-branch gym in Bangladesh. **It is a hobby project, always run as a free demo (D-075).** Each **branch is a tenant**. One app holds every area:

| Area | Path | Rendering |
|---|---|---|
| Public gym pages (SEO) | `/`, `/branches/:slug`, `/plans`, `/join`, … | **Prerendered** at build time (D-026, D-075) |
| Auth | `/auth/…` | Browser only |
| Member portal (PWA) | `/me/…` | Browser only |
| Branch console | `/console/:branch/…` | Browser only |
| HQ console | `/hq/…` | Browser only |
| Demo entry | `/demo` | Browser only (mock builds only) |
| UI kit gallery | `/dev/ui` | Browser only (development builds only) |

Read the relevant docs in `../fitmanager-infra/docs/` first: `02-architecture.md` (§3 URL map, §4 rendering, §7 web), `03-design-system.md`, `04-decisions.md`, and the current phase doc in `../fitmanager-infra/docs/phases/`.

## Hard rules

1. **No UI component libraries and no `@angular/cdk`** (D-007). They are uninstalled and `no-restricted-imports` fails the lint. Build or extend components in `src/app/shared/ui/` (selector prefix `fm`, styles in `src/styles/ui.css` on the semantic tokens) following `../fitmanager-infra/docs/03-design-system.md`, and add every new component or variant to the gallery (`features/dev/ui-gallery.component.ts`).
2. **Code must be safe to render on the server.** Don't touch `window`, `document`, `localStorage`, `matchMedia` or `navigator` directly. Use `DOCUMENT`, platform-guarded services, `afterNextRender`, or `isPlatformBrowser`. Browser-only libraries (apexcharts, ngx-editor, ngx-image-cropper) load only inside `@defer` blocks that run in the browser.
3. **Light and dark mode, mobile and desktop.** Use semantic tokens, not raw palette colours (see the design system doc).
4. **Permissions:** gate routes with `canMatchAbility(action, subject)` and elements with `*appCan`. The CASL `Subject` type in `core/auth/ability.ts` must match the API's.
5. **Private areas are never indexed.** Only the public gym routes (`/`, `/branches`, `/plans`, …) are server-rendered and listed in the sitemap.

## Commands

```bash
nvm use && npm install
npm start               # http://localhost:4200 with the in-memory mock API (no backend); /demo picks a role
npm run start:proxy     # against a real API: API_TARGET=http://localhost:3000
npm test                # Vitest; npm run test:ci for one run with coverage
npm run e2e             # Playwright (starts its own dev server on :4300); first: npx playwright install chromium
npm run lint && npm run format:check
npm run validate        # format + lint + unit tests. No CI for now (D-046): run it before saying work is done.
npm run build:prod && npm run check:prerender && npm run check:no-mock   # Cloudflare build checks
npm run build:demo      # the offline showcase build (static, mock inside)
```

Check UI work visually. Run the dev server, then take screenshots with Playwright (`chromium.launch()` from `playwright-core` in `node_modules`) at desktop (1440×900) and mobile (390×844) sizes. Look at the result before reporting.

## Structure

```
src/app/
  config/        THE brand config, tenant.ts: brand, colour themes, and all landing-page content/images/sections (shape: tenant.model.ts)
  core/          auth (CASL, guards), http (ApiService, interceptors), routing (AppTitleStrategy),
                 seo (SeoService), tenant (branding), models, utils, constants
  core/branch/   BranchContextService (active branch from the URL), branchMatch/hqMatch/memberMatch guards, homeUrl()
  core/models/   THE wire contract (member, plan, subscription, payment, attendance, class, dashboard, portal…)
  shared/ui/     the design system (fm-*), shared pipes (taka, appDate, errorMessage), directives, validators
  layout/        public-layout, auth-shell, console/ (ConsoleLayout for /console and /hq, menus, branch switcher), portal/, demo-banner/
  features/
    public/      prerendered gym pages; landing/ is the reference public page; public-content.service falls back to the config
    console/<module>/  dashboard/ (HQ + branch)  hq/  portal/  demo/  dev/ (UI gallery)  shared/ (invoice view, placeholder)
  mock/          mock API for mock builds: store.ts (seed + change log), seed/, handlers/, domain/ (pure: access rules, pricing)
```

Inside a feature: `pages/` are routed **smart** components (they hold state and call services), `components/` are **presentational** (inputs in, outputs out), and `<feature>.service.ts` owns all HTTP calls. Use the path aliases `@core/*`, `@shared/*`, `@layout/*`, `@features/*`, `@config/*`, `@env/*`.

## Angular conventions

- Standalone components, **zoneless**, `ChangeDetectionStrategy.OnPush` everywhere, state in **signals**. Use `input()`, `output()`, `model()` and `inject()`, and the built-in control flow (`@if`, `@for`, `@defer`).
- Reads go through `rxResource` / `httpResource` (check `hasValue()` before `value()`). Writes use a per-page `saving` signal.
- Typed reactive forms (`NonNullableFormBuilder`). Error text comes from the `errorMessage` pipe. Use `AppValidators` for shared rules.
- List state lives in URL query params. Edit mode is `view/:oid?mode=edit` with component input binding.
- Register icons per component: `viewProviders: [provideIcons({ lucideX })]`. Lucide has no brand icons, so use inline SVG paths for those.
- Naming: `kebab-case.<type>.ts`, private members start with `_`, observables end with `$`, every function declares its return type, template-only members are `protected`, no `public` keyword. API fields stay `snake_case` (they are the wire contract, with `oid` IDs).
- Import order: packages, then `@aliases`, then relative (`npm run lint:fix` sorts them). Prettier uses 4 spaces and width 160, and sorts Tailwind classes. Tailwind v4 prefers canonical classes (`max-h-215`, not `max-h-[860px]`).
- Accessibility: icon-only buttons have an `aria-label`, interactive elements can be focused, landmarks are labelled. Lint enforces the angular-eslint template a11y rules.

## Public (SEO) pages

Follow `features/public/landing/` as the pattern:
- Public pages sit inside `layout/public-layout` (header, footer, theme switcher) and read the config through `PublicSiteService` (`features/public/public-site.service.ts`: brand-filled content, menus, link targets, search). Shared page styles live in `src/styles/public-site.css`, scoped under `.site`. Page = `app-page-intro` + content; list pages filter with `app-category-filter` (`?category=` bound as an input).
- Content comes from the brand config (`@config/tenant`, `TENANT.landing`), never hard-coded in the component. `{brand}` in config text is the brand name. What shows comes from the database (`site_group`, D-040, D-041): each group has a home page section and/or its own page, switched separately (`PublicSiteService.sections()`, `pageEnabled()`, `shows()`/`target()`; loaded once from `GET /v1/public/site-groups` by the public layout and `sitePageGuard`; edited at `/hq/settings`). `landing.sections` is only the fallback for a build without an API. Home, programs, membership and facilities are required. Link to a group's page through `site.target(link)` / `site.shows(link)` so a page that is off is handled. A new group needs a `SECTION_IDS` entry (if it has a section), a template case, `sitePageGuard` on its page route, a migration in `fitmanager-infra/db/migrations` and a mock row (`seedSiteGroups`). A link to a hidden section is dropped from menus.
- Colours come only from theme tokens (`primary-*`, `secondary-*`, `ink-*`); never fixed hex values. Component styles are plain CSS on the tokens, not `@apply` (it blows the component style budget).
- Public routes sit at the top level (`''`, `branches`, `plans`, …) with `title: '<page title>'` (AppTitleStrategy appends the brand). Don't reuse `auth`, `me`, `console`, `hq` or `demo` as public paths.
- In the component, call `SeoService.update({ path, title, description, jsonLd })`. It sets the description, canonical URL, Open Graph (with the share image `public/og-image.png`, 1200×630, and `og:site_name`), the `summary_large_image` Twitter card and JSON-LD (`ExerciseGym`, `Offer`, `Event`, `Person`). The share image and the PNG install icons (`public/icons/`) are drawn by `npm run brand-images`: for now the share image's text is the product's (FitManager, the `SHARE` constant in the script, matched by the alt text in `SeoService`), while its colours, photo and the icons come from the brand config. Run it after changing either, and commit the PNGs.
- Server rendering (`@angular/ssr`, render modes in `app.routes.server.ts`) is added in phase 0 step 3. Until then, write public pages as if it already exists.

## Domain rules the UI must respect

- The active branch comes from the `/console/:branch` URL (`BranchContextService`, set by `branchMatch`; `/hq` sets the HQ row). The API receives it as `X-Branch-Id`. Never keep the active branch in hidden state. The ability = global rules + the active branch's assignment rules (D-034), so gate by `can()` and never by role names.
- Never do float maths on money in the UI: totals come from the API.
- Attendance is **manual**. A USB barcode scanner acts as a keyboard, so the check-in field keeps focus, and an exact member-code match opens the member. There is no QR check-in. RFID comes later.
- Payments are recorded manually (cash, card POS, bank, bKash or Nagad with a reference). There is no online gateway yet.

## Mock API and demo mode

- `environment.useMockApi` turns on the mock interceptor (`mock/mock.providers.ts`; production builds swap in the empty `mock.providers.prod.ts`, checked by `npm run check:no-mock`). Never import from `@mock/*` in app code except the providers file: use an endpoint (e.g. `/v1/demo/*`) instead.
- Handlers are a route table (`mock/handlers/*.ts`) with a `scope` ('public', 'user', 'branch', 'hq', 'member') and a CASL `can` per route; the interceptor enforces them like the API will. A change to data is a `Mutation` committed through `store.ts` (replayed from localStorage on reload).
- Models live in `core/models` or `features/*/models`, **never** in the mock. Report every model or subject change: fitmanager-api must match (D-034).
- Seed data is deterministic and relative to the seed day; scripted Gulshan members `MEM-GUL-000001…7` cover every check-in outcome (docs/demo-script.md).
- Pure domain logic (for example the access rules and pricing) goes in framework-free files with table-driven specs, because it will be ported to the API.

## Hosting: Cloudflare Workers, Free plan, static only (D-024, D-026, D-075)

The web app deploys to Cloudflare as static files (Workers Static Assets); there is no other host and no SSR server. The Free plan allows only 10 ms CPU per request, so the **public pages are prerendered at build time** (`RenderMode.Prerender`) and every other route is client-rendered (`cloudflare/worker.mjs` serves `index.csr.html`, D-036). Content changes need a rebuild and deploy; in the browser the public pages also read live data from the API. Server-side code (it runs only while prerendering) must not use Node-only APIs (`fs`, Node `http`). App code (`src/app/`) never touches Cloudflare APIs. Never rely on a paid Cloudflare product.

**No outside services (D-075):** no Sentry, analytics, reCAPTCHA, SSO or third-party scripts. A feature that would need one gets a free manual stand-in, for example the member profile's "SMS / Email / Copy" buttons on each in-app message (an `sms:` or `mailto:` link that opens the staff member's own app).

## Before finishing a task

1. `npm run validate` passes. Run `npx playwright test --project=default` when routing, auth or layout changed.
2. Screenshots checked at desktop and mobile sizes, in light and dark mode if relevant.
3. Any change to the wire contract or the CASL subjects is reported to the user (fitmanager-api must match).
4. Tick finished items in the phase doc under `../fitmanager-infra/docs/phases/`. Propose decision-log entries for changed decisions.

## After every finished task (D-016)

Log the task in `../fitmanager-infra/docs/CHANGELOG.md` before reporting it as done:
1. Add a new entry at the **top**: the next version number (`0.MINOR.PATCH`: bump MINOR for a feature or structural change, PATCH for a fix or docs-only change), today's date, a one-line title, and the repos touched.
2. Sections: **Summary** (2–4 sentences), **Changes** (bullets grouped by repo, with file paths), **Verification** (commands run and their result; say plainly what was not run).
3. **External resources:** list every resource taken from an external website for this task (fonts, images, icons, code snippets, articles or docs consulted, search result pages used), each with its URL and licence where known. Write "None" when nothing external was used. npm packages installed through `package.json` are not listed here.

## Known quirks

- `package.json` pins `overrides.vite.rolldown = 1.2.16`, because newer rolldown crashes on CPUs without AVX2. Keep it.
- ng-icons looks icons up by camelCase name: the kit registers `fmChevronDown` for `<fm-icon name="chevron-down">` (`registryName()` in `icons.ts`).
