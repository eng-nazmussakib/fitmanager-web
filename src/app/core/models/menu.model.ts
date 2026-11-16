import type { Action, Subject } from '@core/auth/ability';
import type { IconName } from '@shared/ui/icon/icons';

export interface MenuItem {
    label: string;
    icon: IconName;
    /** Relative to the area's base (`/console/<branch>` or `/hq`), e.g. 'members'. */
    route: string;
    /** Shown only if the user `can(action, subject)` at the active branch. Omit it for an item everyone sees. */
    can?: [Action, Subject];
    exact?: boolean;
}

export interface MenuGroup {
    group: string;
    items: MenuItem[];
}
