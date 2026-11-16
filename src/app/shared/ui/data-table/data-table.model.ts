import type { Action, Subject } from '@core/auth/ability';

import type { Tone } from '../display/display';
import type { IconName } from '../icon/icons';

/** How a cell renders. `template` uses the page's `<ng-template fmCell="key">`. */
export type ColumnType = 'text' | 'date' | 'datetime' | 'taka' | 'number' | 'status' | 'template';

export interface TableColumn<T> {
    /** Property on the row (also the sort key sent to the API). */
    key: Extract<keyof T, string> | string;
    header: string;
    type?: ColumnType;
    /** CSS width, e.g. '8rem'. */
    width?: string;
    align?: 'start' | 'end';
    sortable?: boolean;
    /** status → badge tone. Default: Active/Paid success, Expired/Suspended danger, Frozen/Pending/Due warning. */
    statusTones?: Record<string, Tone>;
    /** Hidden on phones in card mode (secondary details). */
    hideOnMobile?: boolean;
}

export interface TableAction<T> {
    name: string;
    icon: IconName;
    label: string;
    /** Shown only if the user `can(action, subject)`. */
    can?: [Action, Subject];
    danger?: boolean;
    /** Hide the action for some rows, e.g. "Approve" only while status === 'Pending'. */
    visible?: (row: T) => boolean;
}

export interface SortState {
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

export interface TableQuery extends SortState {
    pageIndex: number;
    pageSize: number;
}

export interface TableActionEvent<T> {
    action: string;
    row: T;
}
