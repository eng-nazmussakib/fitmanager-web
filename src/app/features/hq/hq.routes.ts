import { Routes } from '@angular/router';

import { canMatchAbility } from '@core/auth/auth.guards';

/** The HQ console, under `/hq` (branch context = the HQ row, set by `hqMatch`). */
export const HQ_ROUTES: Routes = [
    { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    // The public site's content.
    {
        path: 'website',
        title: 'Website',
        data: { breadcrumb: 'Website', hq: true },
        canMatch: [canMatchAbility('read', 'Website')],
        loadComponent: () => import('@features/website/website-page.component').then(m => m.WebsitePageComponent)
    },
    // The bell's inbox. Everyone may open it; each message shows to whoever may act on it.
    {
        path: 'inbox',
        title: 'Inbox',
        data: { breadcrumb: 'Inbox', hq: true },
        loadComponent: () => import('@features/inbox/inbox-page.component').then(m => m.InboxPageComponent)
    },
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
    // Governance.
    {
        path: 'incidents',
        data: { breadcrumb: 'Incidents', hq: true },
        canMatch: [canMatchAbility('read', 'Incident')],
        children: [
            { path: '', title: 'Incidents', loadComponent: () => import('@features/governance/incidents-page.component').then(m => m.IncidentsPageComponent) },
            {
                path: ':id',
                title: 'Case',
                data: { breadcrumb: 'Case' },
                loadComponent: () => import('@features/governance/incident-page.component').then(m => m.IncidentPageComponent)
            }
        ]
    },
    {
        path: 'complaints',
        title: 'Complaints',
        data: { breadcrumb: 'Complaints', hq: true },
        canMatch: [canMatchAbility('read', 'Complaint')],
        loadComponent: () => import('@features/governance/complaints-page.component').then(m => m.ComplaintsPageComponent)
    },
    // The catalogue, every branch's purchase orders and stock.
    {
        path: 'catalogue',
        title: 'Catalogue',
        data: { breadcrumb: 'Catalogue' },
        canMatch: [canMatchAbility('read', 'Product')],
        loadComponent: () => import('@features/business/catalogue-page.component').then(m => m.CataloguePageComponent)
    },
    {
        path: 'purchase-orders',
        title: 'Purchase orders',
        data: { breadcrumb: 'Purchase orders', hq: true },
        canMatch: [canMatchAbility('read', 'PurchaseOrder')],
        loadComponent: () => import('@features/business/stock-page.component').then(m => m.StockPageComponent)
    },
    {
        path: 'stock',
        title: 'Stock',
        data: { breadcrumb: 'Stock' },
        canMatch: [canMatchAbility('read', 'Stock')],
        loadComponent: () => import('@features/business/hq-stock-page.component').then(m => m.HqStockPageComponent)
    },
    {
        path: 'feedback',
        title: 'Feedback',
        data: { breadcrumb: 'Feedback', hq: true },
        canMatch: [canMatchAbility('read', 'Feedback')],
        loadComponent: () => import('@features/governance/feedback-page.component').then(m => m.FeedbackPageComponent)
    },
    {
        path: 'policies',
        title: 'Policies',
        data: { breadcrumb: 'Policies', hq: true },
        canMatch: [canMatchAbility('read', 'Policy')],
        loadComponent: () => import('@features/governance/policies-page.component').then(m => m.PoliciesPageComponent)
    },
    {
        path: 'reports',
        title: 'Reports',
        data: { breadcrumb: 'Reports', hq: true },
        canMatch: [canMatchAbility('read', 'Report')],
        loadComponent: () => import('@features/reports/reports-page.component').then(m => m.ReportsPageComponent)
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
