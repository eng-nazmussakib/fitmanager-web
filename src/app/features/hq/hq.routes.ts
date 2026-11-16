import type { Type } from '@angular/core';
import { Routes } from '@angular/router';

import { canMatchAbility } from '@core/auth/auth.guards';

const placeholder = (): Promise<Type<unknown>> => import('@features/shared/placeholder-page.component').then(m => m.PlaceholderPageComponent);

/** The HQ console, under `/hq` (branch context = the HQ row, set by `hqMatch`). */
export const HQ_ROUTES: Routes = [
    { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    {
        path: 'dashboard',
        title: 'HQ dashboard',
        data: { breadcrumb: 'Dashboard', scope: 'hq' },
        canMatch: [canMatchAbility('read', 'HqDashboard')],
        loadComponent: () => import('@features/dashboard/dashboard-page.component').then(m => m.DashboardPageComponent)
    },
    {
        path: 'branches',
        title: 'Branches',
        data: { breadcrumb: 'Branches' },
        canMatch: [canMatchAbility('read', 'Branch')],
        loadComponent: () => import('./hq-pages.component').then(m => m.HqBranchesPageComponent)
    },
    {
        path: 'plans',
        title: 'Plan templates',
        data: { breadcrumb: 'Plan templates' },
        canMatch: [canMatchAbility('read', 'PlanTemplate')],
        loadComponent: () => import('./hq-pages.component').then(m => m.HqTemplatesPageComponent)
    },
    {
        path: 'reports',
        title: 'Reports',
        data: { breadcrumb: 'Reports', title: 'Reports', phase: '7', icon: 'chart-column' },
        canMatch: [canMatchAbility('read', 'Report')],
        loadComponent: placeholder
    },
    {
        path: 'staff',
        title: 'Staff and roles',
        data: { breadcrumb: 'Staff', title: 'Staff and roles', phase: '1', icon: 'shield-check' },
        canMatch: [canMatchAbility('read', 'Staff')],
        loadComponent: placeholder
    },
    {
        path: 'settings',
        title: 'Settings',
        data: { breadcrumb: 'Settings' },
        canMatch: [canMatchAbility('read', 'Settings')],
        loadComponent: () => import('./hq-settings-page.component').then(m => m.HqSettingsPageComponent)
    }
];
