import type { MenuGroup } from '@core/models/menu.model';

/**
 * Branch console menu (`/console/:branch/…`). A typed `can` per item: the item shows only when the user's role at
 * the ACTIVE branch allows it, and the route uses the same pair in `canMatchAbility`, so menu and URL agree.
 */
export const CONSOLE_MENU: MenuGroup[] = [
    {
        group: 'Today',
        items: [
            { label: 'Dashboard', icon: 'layout-dashboard', route: 'dashboard', can: ['read', 'Dashboard'] },
            { label: 'Check-in', icon: 'scan-line', route: 'check-in', can: ['create', 'Attendance'] },
            { label: 'Classes', icon: 'calendar-days', route: 'classes', can: ['read', 'Class'] },
            { label: 'PT', icon: 'dumbbell', route: 'pt', can: ['read', 'PtSession'] }
        ]
    },
    {
        group: 'Members',
        items: [
            { label: 'Members', icon: 'users', route: 'members', can: ['read', 'Member'] },
            { label: 'Payments', icon: 'wallet', route: 'payments', can: ['read', 'Payment'] },
            { label: 'Plans', icon: 'clipboard-list', route: 'plans', can: ['read', 'Plan'] }
        ]
    },
    {
        group: 'Business',
        items: [
            { label: 'Shop', icon: 'store', route: 'pos', can: ['create', 'Sale'] },
            { label: 'Shop sales', icon: 'receipt', route: 'pos-sales', can: ['read', 'Sale'] },
            { label: 'Stock', icon: 'package', route: 'stock', can: ['read', 'Stock'] },
            { label: 'Equipment', icon: 'wrench', route: 'equipment', can: ['read', 'Equipment'] }
        ]
    },
    {
        group: 'Training',
        items: [
            { label: 'Exercises', icon: 'dumbbell', route: 'exercises', can: ['read', 'Exercise'] },
            { label: 'Routines', icon: 'list-ordered', route: 'routines', can: ['read', 'Routine'] }
        ]
    },
    {
        group: 'Governance',
        items: [
            { label: 'Incidents', icon: 'shield-alert', route: 'incidents', can: ['read', 'Incident'] },
            { label: 'Complaints', icon: 'message-square', route: 'complaints', can: ['read', 'Complaint'] },
            { label: 'Feedback', icon: 'star', route: 'feedback', can: ['read', 'Feedback'] },
            { label: 'Policies', icon: 'book-open', route: 'policies', can: ['read', 'Policy'] },
            // Every staff role reads the policies: the same gate shows each person their own record (D-094).
            { label: 'My record', icon: 'badge-check', route: 'my-record', can: ['read', 'Policy'] }
        ]
    },
    {
        group: 'Branch',
        items: [
            { label: 'Trainers', icon: 'users-round', route: 'trainers', can: ['read', 'Trainer'] },
            { label: 'Facilities', icon: 'key-round', route: 'facilities', can: ['read', 'Locker'] },
            { label: 'Staff', icon: 'shield-check', route: 'staff', can: ['read', 'Staff'] },
            { label: 'Reports', icon: 'chart-column', route: 'reports', can: ['read', 'Report'] },
            { label: 'Audit log', icon: 'list-checks', route: 'audit', can: ['read', 'AuditLog'] }
        ]
    }
];
