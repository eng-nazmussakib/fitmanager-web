import { LATER_FEATURES } from '@core/constants/later-features';
import type { MenuGroup, MenuItem } from '@core/models/menu.model';

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
            ...(LATER_FEATURES ? [{ label: 'Classes', icon: 'calendar-days', route: 'classes', can: ['read', 'Class'] } satisfies MenuItem] : [])
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
        group: 'Branch',
        items: [
            ...(LATER_FEATURES ? [{ label: 'Trainers', icon: 'dumbbell', route: 'trainers', can: ['read', 'Trainer'] } satisfies MenuItem] : []),
            { label: 'Staff', icon: 'shield-check', route: 'staff', can: ['read', 'Staff'] },
            { label: 'Reports', icon: 'chart-column', route: 'reports', can: ['read', 'Report'] },
            { label: 'Audit log', icon: 'list-checks', route: 'audit', can: ['read', 'AuditLog'] }
        ]
    }
];
