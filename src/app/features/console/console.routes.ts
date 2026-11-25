import { Routes } from '@angular/router';

import { canMatchAbility } from '@core/auth/auth.guards';

/**
 * The branch console, under `/console/:branch` (the branch context is already set by `branchMatch`). Each route is
 * gated by the same (action, subject) pair as its menu item, so the URL and the menu agree.
 */
export const CONSOLE_ROUTES: Routes = [
    { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    // The public site's content.
    {
        path: 'website',
        title: 'Website',
        data: { breadcrumb: 'Website' },
        canMatch: [canMatchAbility('update', 'Website')],
        loadComponent: () => import('@features/website/website-page.component').then(m => m.WebsitePageComponent)
    },
    // The bell's inbox. Everyone may open it; each message shows to whoever may act on it.
    {
        path: 'inbox',
        title: 'Inbox',
        data: { breadcrumb: 'Inbox' },
        loadComponent: () => import('@features/inbox/inbox-page.component').then(m => m.InboxPageComponent)
    },
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
    // Governance.
    {
        path: 'incidents',
        data: { breadcrumb: 'Incidents' },
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
        data: { breadcrumb: 'Complaints' },
        canMatch: [canMatchAbility('read', 'Complaint')],
        loadComponent: () => import('@features/governance/complaints-page.component').then(m => m.ComplaintsPageComponent)
    },
    // Business.
    {
        path: 'equipment',
        title: 'Equipment',
        data: { breadcrumb: 'Equipment' },
        canMatch: [canMatchAbility('read', 'Equipment')],
        loadComponent: () => import('@features/business/equipment-page.component').then(m => m.EquipmentPageComponent)
    },
    {
        path: 'stock',
        title: 'Stock',
        data: { breadcrumb: 'Stock' },
        canMatch: [canMatchAbility('read', 'Stock')],
        loadComponent: () => import('@features/business/stock-page.component').then(m => m.StockPageComponent)
    },
    {
        path: 'pos',
        title: 'Shop',
        data: { breadcrumb: 'Shop' },
        canMatch: [canMatchAbility('create', 'Sale')],
        loadComponent: () => import('@features/business/pos-page.component').then(m => m.PosPageComponent)
    },
    {
        path: 'pos-sales',
        title: 'Shop sales',
        data: { breadcrumb: 'Shop sales' },
        canMatch: [canMatchAbility('read', 'Sale')],
        loadComponent: () => import('@features/business/pos-sales-page.component').then(m => m.PosSalesPageComponent)
    },
    {
        path: 'feedback',
        title: 'Feedback',
        data: { breadcrumb: 'Feedback' },
        canMatch: [canMatchAbility('read', 'Feedback')],
        loadComponent: () => import('@features/governance/feedback-page.component').then(m => m.FeedbackPageComponent)
    },
    {
        path: 'policies',
        title: 'Policies',
        data: { breadcrumb: 'Policies' },
        canMatch: [canMatchAbility('read', 'Policy')],
        loadComponent: () => import('@features/governance/policies-page.component').then(m => m.PoliciesPageComponent)
    },
    {
        path: 'my-record',
        title: 'My record',
        data: { breadcrumb: 'My record' },
        loadComponent: () => import('@features/governance/own-record.component').then(m => m.OwnRecordComponent)
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
        data: { breadcrumb: 'Reports' },
        canMatch: [canMatchAbility('read', 'Report')],
        loadComponent: () => import('@features/reports/reports-page.component').then(m => m.ReportsPageComponent)
    }
];
