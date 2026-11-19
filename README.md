# fitmanager-web

The FitManager web app: the public gym pages, the branch console, the HQ console and the member portal, all in one Angular 22 app (zoneless, signals, Tailwind 4). FitManager is a hobby project, always run as a free demo (D-075): every build is static, and the app uses no outside services (no Sentry, no reCAPTCHA, no SSO). There is no UI component library: the kit in `src/app/shared/ui` is built on native `<dialog>` and the Popover API (D-007). The plan, decisions and phase checklists are in [`../fitmanager-infra/docs`](../fitmanager-infra/docs/README.md).

## Quick start

```bash
nvm use            # Node 26 (.nvmrc)
npm install        # also sets up the Husky pre-commit hook (ESLint + Prettier on staged files)
npm start          # http://localhost:4200 on the in-browser mock API: no backend needed
```

Open `/demo` to pick an account (the same list as below), or sign in at `/auth/sign-in`:

| Account             | Password      | Sees                                                              |
| ------------------- | ------------- | ----------------------------------------------------------------- |
| `owner`             | `Owner@123`   | HQ console and every branch                                       |
| `manager.gulshan`   | `Manager@123` | Gulshan branch console, with overrides and discounts above 20 %    |
| `desk.gulshan`      | `Desk@123`    | Gulshan front desk: check-in, members, selling plans              |
| `trainer.gulshan`   | `Trainer@123` | Gulshan classes and bookings                                      |
| `desk.uttara`       | `Desk@123`    | Front desk at two branches (Uttara and Dhanmondi): branch switcher |
| `member.demo`       | `Member@123`  | The member portal (`/me`)                                         |

The mock (`src/app/mock`) enforces what the API will: tokens, `X-Branch-Id` against the user's branch assignments, and the CASL rules of the role at that branch. Its data is seeded the same way on every machine for the current day. Changes (a sale, a check-in) are kept in `localStorage` and survive a reload. "Reset demo data" in the demo banner clears them. [`../fitmanager-infra/docs/demo-script.md`](../fitmanager-infra/docs/demo-script.md) is the walk-through for a showcase.

Against the real API: build its database with `npm run seed` in [`../fitmanager-infra/db`](../fitmanager-infra/db/README.md), `npm run dev` in [`../fitmanager-api`](../fitmanager-api), then `API_TARGET=http://localhost:3000 npm run start:proxy`. The API signs in the same staff accounts and returns the same `/v1/auth/me` shape (D-034); members get portal access from the desk (a temporary password, D-064).

## Scripts

| Script                                | Purpose                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `npm start` / `start:demo`            | dev server on the mock / the demo build (mock + demo banner)                                |
| `npm run start:proxy`                 | dev server against a real API through a proxy (`API_TARGET=…`)                              |
| `npm run build:prod`                  | the hosted demo's build: static output, public pages prerendered, mock left out, sitemap  |
| `npm run build:cloudflare`            | `build:prod` + both checks below; the build command Cloudflare's Git integration runs      |
| `npm run build:demo`                  | the offline showcase build: static too, mock API inside, demo banner                        |
| `npm run check:prerender`             | after `build:prod`: every public route was prerendered with its title and canonical URL    |
| `npm run check:no-mock`               | after `build:prod`: no mock code or demo passwords in the bundle                            |
| `npm test` / `test:ci`                | unit tests (Vitest), watch / one run with coverage                                          |
| `npm run e2e` / `e2e:ui`              | browser tests (Playwright, with axe accessibility scans). First: `npx playwright install chromium` |
| `npm run lint` / `format`             | ESLint (Angular, type-checked TypeScript, template a11y, banned UI libraries) / Prettier    |
| `npm run validate`                    | format check + lint + unit tests (no CI for now, D-046: run it before pushing)             |

## Where things are

```
src/app/
├── app.routes.ts            public pages, /auth, /console/:branch, /hq, /me, /demo, /dev/ui
├── app.routes.server.ts     render mode per route: public pages prerendered at build time, the rest client-rendered
├── config/                  the build-time brand config (name, colours, landing page content)
├── core/
│   ├── auth/                AuthService, branch-aware CASL ability, guards
│   ├── branch/              active branch from the URL, branch/HQ/member route matchers
│   ├── http/                ApiService, interceptors (auth, X-Branch-Id, errors → toasts)
│   ├── models/              wire types: branch, user, member, plan, subscription, payment, settings…
│   └── seo/ services/ platform/ routing/ utils/
├── layout/                  public site, console (sidebar, branch switcher), portal, auth shell, demo banner
├── shared/ui/               the in-house kit: button, forms, select, date picker, dialog, menu, tooltip, tabs,
│                            toast, data table, chart, icons, a11y helpers. Live gallery at /dev/ui
├── features/
│   ├── public/              landing, /branches/:slug, /plans, /join (SEO: titles, canonical, JSON-LD)
│   ├── console/             check-in, members, selling a plan, classes, payments, plans
│   ├── dashboard/ hq/       branch and HQ dashboards, branches, plan templates, settings (VAT, website sections)
│   ├── portal/              member home, membership, classes, progress
│   └── auth/ demo/ dev/ shared/
└── mock/                    in-browser API: route table, store, seed, pure domain rules (pricing, access) with tests
cloudflare/worker.mjs        serves index.csr.html to client routes on Cloudflare (D-036)
scripts/                     postbuild (sitemap), check-prerender, check-no-mock
e2e/                         Playwright: auth, permissions, the demo script, landing page
```

## Hosting

- **Cloudflare, the only host (D-026, D-046, D-075):** Cloudflare's Git integration runs `npm run build:cloudflare` and `npx wrangler deploy` on each push to `main`; there is no CI/CD pipeline. Public pages are static files, and client routes get `index.csr.html` through the Worker. Steps in [`../fitmanager-infra/cloudflare/web.md`](../fitmanager-infra/cloudflare/web.md) and [`demo-deploy.md`](../fitmanager-infra/cloudflare/demo-deploy.md).
- **Offline demo:** `npm run build:demo` writes static files with the mock API inside; serve `dist/browser` from any static host (client routes need a fallback to `index.csr.html`).

## Rules worth knowing

- No ng-zorro, `@angular/cdk`, `@ant-design/*` or other component libraries. Lint fails on their imports.
- Every component is OnPush, and state lives in signals. Code that runs on the server must not touch `window` or `localStorage` directly: use `StorageService`, `BreakpointService` and `afterNextRender`.
- A screen is gated by the rule for the action it performs (`canMatchAbility`, `*appCan`). The API checks the same rule, so the UI check is only a convenience.
- What the public site shows comes from the database (`GET /v1/public/site-groups`, D-040, D-041), edited at `/hq/settings`. Each group has a home page section and/or a page of its own, switched separately; a page that is off redirects to its section. Home, programs, membership and facilities are required. `landing.sections` in the brand config is only the fallback for a build without an API.
- English only (D-015). Bangladesh conventions apply to formatting only: ৳ with lakh grouping, Asia/Dhaka time, BD mobile numbers.
