import { Routes } from '@angular/router';

/** The member portal (`/me`), mobile-first (H6). Members only (`memberMatch`); no branch header. */
export const PORTAL_ROUTES: Routes = [
    { path: '', title: 'My membership', loadComponent: () => import('./portal-pages.component').then(m => m.PortalHomeComponent) },
    {
        path: 'bookings',
        title: 'Classes',
        data: { breadcrumb: 'Classes' },
        loadComponent: () => import('./portal-pages.component').then(m => m.PortalBookingsComponent)
    },
    {
        path: 'pt',
        title: 'Personal training',
        data: { breadcrumb: 'PT' },
        loadComponent: () => import('./portal-pt.component').then(m => m.PortalPtComponent)
    },
    {
        path: 'routine',
        title: 'Routine',
        data: { breadcrumb: 'Routine' },
        loadComponent: () => import('./portal-training.component').then(m => m.PortalRoutineComponent)
    },
    {
        path: 'progress',
        title: 'Progress',
        data: { breadcrumb: 'Progress' },
        loadComponent: () => import('./portal-training.component').then(m => m.PortalProgressComponent)
    },
    {
        path: 'payments',
        title: 'Payments',
        data: { breadcrumb: 'Payments' },
        loadComponent: () => import('./portal-pages.component').then(m => m.PortalPaymentsComponent)
    },
    // The bell.
    {
        path: 'messages',
        title: 'Messages',
        data: { breadcrumb: 'Messages' },
        loadComponent: () => import('./portal-messages.component').then(m => m.PortalMessagesComponent)
    },
    // Governance.
    {
        path: 'policies',
        title: 'Policies',
        data: { breadcrumb: 'Policies' },
        loadComponent: () => import('./portal-governance.component').then(m => m.PortalPoliciesComponent)
    },
    {
        path: 'record',
        title: 'My record',
        data: { breadcrumb: 'My record' },
        loadComponent: () => import('./portal-governance.component').then(m => m.PortalRecordComponent)
    },
    {
        path: 'complaints',
        title: 'Complaints',
        data: { breadcrumb: 'Complaints' },
        loadComponent: () => import('./portal-governance.component').then(m => m.PortalComplaintsComponent)
    }
];
