import { Routes } from '@angular/router';

import { TENANT } from '@config/tenant';
import { authGuard, guestGuard } from '@core/auth/auth.guards';
import { branchMatch, firstBranchRedirect, homeRedirect, hqMatch, memberMatch } from '@core/branch/branch.guards';
import { environment } from '@env/environment';

/**
 * The URL map (fitmanager-infra/docs/02-architecture.md §3). English only, plain URLs (D-015).
 * - Public gym pages sit at the top level and are prerendered (app.routes.server.ts); every other area renders
 *   in the browser only and is never indexed.
 * - Areas are lazy: a user who never opens HQ never downloads it. `canMatch` guards run parent first, so the
 *   branch context (branchMatch) is set before a child's `canMatchAbility` reads the ability.
 * - `data.breadcrumb` feeds the breadcrumb; `title` the tab title (AppTitleStrategy appends the brand).
 */
export const routes: Routes = [
    // Public gym pages, in the public layout (header, footer). Without a landing page in the brand config, `/` signs in.
    TENANT.landing
        ? {
              path: '',
              loadComponent: () => import('@layout/public-layout/public-layout.component').then(m => m.PublicLayoutComponent),
              loadChildren: () => import('@features/public/public.routes').then(m => m.PUBLIC_ROUTES)
          }
        : { path: '', pathMatch: 'full', redirectTo: 'auth' },
    {
        path: 'auth',
        canActivate: [guestGuard],
        loadChildren: () => import('@features/auth/auth.routes').then(m => m.AUTH_ROUTES)
    },
    // Showcase entry (phase 0.5): role cards that sign in as a demo user. Only in builds with the mock API.
    ...(environment.demo || environment.useMockApi
        ? [{ path: 'demo', title: 'Demo', loadComponent: () => import('@features/demo/demo-page.component').then(m => m.DemoPageComponent) }]
        : []),
    // After sign-in: owner → /hq, staff → their branch, member → /me (homeUrl).
    { path: 'home', canMatch: [authGuard, homeRedirect], children: [] },
    {
        path: 'me',
        canMatch: [authGuard, memberMatch],
        data: { breadcrumb: 'My membership' },
        loadComponent: () => import('@layout/portal/portal-layout.component').then(m => m.PortalLayoutComponent),
        loadChildren: () => import('@features/portal/portal.routes').then(m => m.PORTAL_ROUTES)
    },
    { path: 'console', pathMatch: 'full', canMatch: [authGuard, firstBranchRedirect], children: [] },
    {
        path: 'console/:branch',
        canMatch: [authGuard, branchMatch],
        data: { area: 'console', breadcrumb: (r: { paramMap: { get(k: string): string | null } }): string => titleCase(r.paramMap.get('branch') ?? '') },
        loadComponent: () => import('@layout/console/console-layout.component').then(m => m.ConsoleLayoutComponent),
        loadChildren: () => import('@features/console/console.routes').then(m => m.CONSOLE_ROUTES)
    },
    {
        path: 'hq',
        canMatch: [authGuard, hqMatch],
        data: { area: 'hq', breadcrumb: 'HQ' },
        loadComponent: () => import('@layout/console/console-layout.component').then(m => m.ConsoleLayoutComponent),
        loadChildren: () => import('@features/hq/hq.routes').then(m => m.HQ_ROUTES)
    },
    // The component gallery: every kit component and variant. Development builds only.
    ...(environment.production
        ? []
        : [{ path: 'dev/ui', title: 'UI kit', loadComponent: () => import('@features/dev/ui-gallery.component').then(m => m.UiGalleryComponent) }]),
    {
        path: 'forbidden',
        title: 'Access denied',
        loadComponent: () => import('@shared/components/result-page/result-page.component').then(m => m.ResultPageComponent)
    },
    {
        path: '**',
        title: 'Page not found',
        loadComponent: () => import('@shared/components/result-page/result-page.component').then(m => m.ResultPageComponent)
    }
];

function titleCase(slug: string): string {
    return slug.replace(/(^|-)(\w)/g, (_m, sep: string, c: string) => (sep ? ' ' : '') + c.toUpperCase());
}
