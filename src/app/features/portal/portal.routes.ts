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
        path: 'routine',
        title: 'Routine',
        data: { breadcrumb: 'Routine' },
        loadComponent: () => import('./portal-pages.component').then(m => m.PortalRoutineComponent)
    },
    {
        path: 'progress',
        title: 'Progress',
        data: { breadcrumb: 'Progress' },
        loadComponent: () => import('./portal-pages.component').then(m => m.PortalProgressComponent)
    },
    {
        path: 'payments',
        title: 'Payments',
        data: { breadcrumb: 'Payments' },
        loadComponent: () => import('./portal-pages.component').then(m => m.PortalPaymentsComponent)
    }
];
