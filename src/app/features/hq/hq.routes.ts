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
        title: 'Plans and prices',
        data: { breadcrumb: 'Plans' },
        canMatch: [canMatchAbility('read', 'PlanTemplate')],
        loadComponent: () => import('./hq-plans-page.component').then(m => m.HqPlansPageComponent)
    },
    {
        path: 'class-types',
        title: 'Class types',
        data: { breadcrumb: 'Class types' },
        canMatch: [canMatchAbility('manage', 'ClassType')],
        loadComponent: () => import('./hq-class-types-page.component').then(m => m.HqClassTypesPageComponent)
    },
    {
        path: 'exercises',
        title: 'Exercise library',
        data: { breadcrumb: 'Exercises', hq: true },
        canMatch: [canMatchAbility('read', 'Exercise')],
        loadComponent: () => import('@features/training/exercises-page.component').then(m => m.ExercisesPageComponent)
    },
    {
        path: 'routines',
        title: 'Routines',
        data: { breadcrumb: 'Routines', hq: true },
        canMatch: [canMatchAbility('read', 'Routine')],
        loadComponent: () => import('@features/training/routines-page.component').then(m => m.RoutinesPageComponent)
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
        data: { breadcrumb: 'Staff', level: 'hq' },
        canMatch: [canMatchAbility('read', 'Staff')],
        loadComponent: () => import('@features/staff/staff-page.component').then(m => m.StaffPageComponent)
    },
    {
        path: 'audit',
        title: 'Audit log',
        data: { breadcrumb: 'Audit log', level: 'hq' },
        canMatch: [canMatchAbility('read', 'AuditLog')],
        loadComponent: () => import('@features/staff/audit-page.component').then(m => m.AuditPageComponent)
    },
    {
        path: 'settings',
        title: 'Settings',
        data: { breadcrumb: 'Settings' },
        canMatch: [canMatchAbility('read', 'Settings')],
        loadComponent: () => import('./hq-settings-page.component').then(m => m.HqSettingsPageComponent)
    }
];
