import { Routes } from '@angular/router';

import { canMatchAbility } from '@core/auth/auth.guards';

/**
 * The branch console, under `/console/:branch` (the branch context is already set by `branchMatch`). Each route is
 * gated by the same (action, subject) pair as its menu item, so the URL and the menu agree.
 */
export const CONSOLE_ROUTES: Routes = [
    { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    {
        path: 'dashboard',
        title: 'Dashboard',
        data: { breadcrumb: 'Dashboard', scope: 'branch' },
        canMatch: [canMatchAbility('read', 'Dashboard')],
        loadComponent: () => import('@features/dashboard/dashboard-page.component').then(m => m.DashboardPageComponent)
    },
    {
        path: 'check-in',
        title: 'Check-in',
        data: { breadcrumb: 'Check-in' },
        canMatch: [canMatchAbility('create', 'Attendance')],
        loadComponent: () => import('./check-in/check-in-page.component').then(m => m.CheckInPageComponent)
    },
    {
        path: 'members',
        data: { breadcrumb: 'Members' },
        canMatch: [canMatchAbility('read', 'Member')],
        children: [
            { path: '', title: 'Members', loadComponent: () => import('./members/member-list-page.component').then(m => m.MemberListPageComponent) },
            {
                path: 'new',
                title: 'Add member',
                data: { breadcrumb: 'Add member' },
                canMatch: [canMatchAbility('create', 'Member')],
                loadComponent: () => import('./members/member-form-page.component').then(m => m.MemberFormPageComponent)
            },
            {
                path: ':id',
                data: { breadcrumb: 'Profile' },
                children: [
                    {
                        path: '',
                        title: 'Member',
                        loadComponent: () => import('./members/member-profile-page.component').then(m => m.MemberProfilePageComponent)
                    },
                    {
                        path: 'subscribe',
                        title: 'Sell a plan',
                        data: { breadcrumb: 'Sell a plan' },
                        canMatch: [canMatchAbility('create', 'Subscription')],
                        loadComponent: () => import('./members/subscribe-page.component').then(m => m.SubscribePageComponent)
                    }
                ]
            }
        ]
    },
    {
        path: 'classes',
        title: 'Classes',
        data: { breadcrumb: 'Classes' },
        canMatch: [canMatchAbility('read', 'Class')],
        loadComponent: () => import('./classes/classes-page.component').then(m => m.ClassesPageComponent)
    },
    {
        path: 'payments',
        title: 'Payments',
        data: { breadcrumb: 'Payments' },
        canMatch: [canMatchAbility('read', 'Payment')],
        loadComponent: () => import('./payments/payments-page.component').then(m => m.PaymentsPageComponent)
    },
    {
        path: 'plans',
        title: 'Plans',
        data: { breadcrumb: 'Plans' },
        canMatch: [canMatchAbility('read', 'Plan')],
        loadComponent: () => import('./plans/plans-page.component').then(m => m.BranchPlansPageComponent)
    },
    {
        path: 'pt',
        title: 'Personal training',
        data: { breadcrumb: 'PT' },
        canMatch: [canMatchAbility('read', 'PtSession')],
        loadComponent: () => import('./pt/pt-page.component').then(m => m.PtPageComponent)
    },
    {
        path: 'exercises',
        title: 'Exercise library',
        data: { breadcrumb: 'Exercises' },
        canMatch: [canMatchAbility('read', 'Exercise')],
        loadComponent: () => import('@features/training/exercises-page.component').then(m => m.ExercisesPageComponent)
    },
    {
        path: 'routines',
        title: 'Routines',
        data: { breadcrumb: 'Routines' },
        canMatch: [canMatchAbility('read', 'Routine')],
        loadComponent: () => import('@features/training/routines-page.component').then(m => m.RoutinesPageComponent)
    },
    {
        path: 'trainers',
        data: { breadcrumb: 'Trainers' },
        canMatch: [canMatchAbility('read', 'Trainer')],
        children: [
            { path: '', title: 'Trainers', loadComponent: () => import('./trainers/trainers-page.component').then(m => m.TrainersPageComponent) },
            {
                path: ':id',
                title: 'Trainer',
                data: { breadcrumb: 'Trainer' },
                loadComponent: () => import('./trainers/trainer-detail-page.component').then(m => m.TrainerDetailPageComponent)
            }
        ]
    },
    {
        path: 'facilities',
        title: 'Facilities',
        data: { breadcrumb: 'Facilities' },
        canMatch: [canMatchAbility('read', 'Locker')],
        loadComponent: () => import('./facilities/facilities-page.component').then(m => m.FacilitiesPageComponent)
    },
    {
        path: 'staff',
        title: 'Staff',
        data: { breadcrumb: 'Staff', level: 'branch' },
        canMatch: [canMatchAbility('read', 'Staff')],
        loadComponent: () => import('@features/staff/staff-page.component').then(m => m.StaffPageComponent)
    },
    {
        path: 'audit',
        title: 'Audit log',
        data: { breadcrumb: 'Audit log', level: 'branch' },
        canMatch: [canMatchAbility('read', 'AuditLog')],
        loadComponent: () => import('@features/staff/audit-page.component').then(m => m.AuditPageComponent)
    },
    {
        path: 'reports',
        title: 'Reports',
        data: { breadcrumb: 'Reports', title: 'Reports', phase: '7', icon: 'chart-column' },
        canMatch: [canMatchAbility('read', 'Report')],
        loadComponent: () => import('@features/shared/placeholder-page.component').then(m => m.PlaceholderPageComponent)
    }
];
