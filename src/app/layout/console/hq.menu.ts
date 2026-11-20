import type { MenuGroup } from '@core/models/menu.model';

/** HQ console menu (`/hq/…`). HQ is the `kind = 'HQ'` branch row (D-023), so the same `can` checks apply. */
export const HQ_MENU: MenuGroup[] = [
    {
        group: 'Overview',
        items: [
            { label: 'Dashboard', icon: 'layout-dashboard', route: 'dashboard', can: ['read', 'HqDashboard'] },
            { label: 'Branches', icon: 'building-2', route: 'branches', can: ['read', 'Branch'] },
            { label: 'Reports', icon: 'chart-column', route: 'reports', can: ['read', 'Report'] }
        ]
    },
    {
        group: 'Master data',
        items: [
            { label: 'Plan templates', icon: 'clipboard-list', route: 'plans', can: ['read', 'PlanTemplate'] },
            { label: 'Class types', icon: 'calendar-days', route: 'class-types', can: ['manage', 'ClassType'] },
            { label: 'Exercises', icon: 'dumbbell', route: 'exercises', can: ['manage', 'Exercise'] },
            { label: 'Routines', icon: 'list-ordered', route: 'routines', can: ['manage', 'Routine'] },
            { label: 'Staff and roles', icon: 'shield-check', route: 'staff', can: ['read', 'Staff'] },
            { label: 'Settings', icon: 'settings', route: 'settings', can: ['read', 'Settings'] },
            { label: 'Audit log', icon: 'list-checks', route: 'audit', can: ['read', 'AuditLog'] }
        ]
    }
];
