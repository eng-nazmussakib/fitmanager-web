import { NgTemplateOutlet } from '@angular/common';
import {
    booleanAttribute,
    ChangeDetectionStrategy,
    Component,
    computed,
    contentChildren,
    Directive,
    inject,
    input,
    output,
    signal,
    TemplateRef
} from '@angular/core';

import { AuthService } from '@core/auth/auth.service';
import { APP } from '@core/constants/app.constants';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { TakaPipe } from '@shared/pipes/taka.pipe';

import { ButtonComponent } from '../button/button.component';
import { BadgeComponent, SkeletonComponent, type Tone } from '../display/display';
import { EmptyStateComponent } from '../feedback/empty-state.component';
import { IconComponent } from '../icon/icon.component';
import { MenuComponent, MenuItemDirective, MenuTriggerDirective } from '../menu/menu';
import { PaginationComponent } from '../navigation/pagination.component';
import type { SortState, TableAction, TableActionEvent, TableColumn, TableQuery } from './data-table.model';

const DEFAULT_TONES: Record<string, Tone> = {
    Active: 'success',
    Paid: 'success',
    Approved: 'success',
    Expired: 'danger',
    Suspended: 'danger',
    Inactive: 'neutral',
    Frozen: 'info',
    Pending: 'warning',
    Due: 'warning',
    Partial: 'warning'
};

/** A custom cell: `<ng-template fmCell="name" let-row>…</ng-template>` for the column with that key (type 'template'). */
@Directive({ selector: 'ng-template[fmCell]' })
export class CellDirective {
    readonly template = inject<TemplateRef<{ $implicit: unknown }>>(TemplateRef);
    readonly fmCell = input.required<string>();
}

/**
 * Server-side data table: the parent fetches, the table renders and emits `queryChange` (page, size, sort).
 * Replaces the nz-table wrapper (D-007).
 *
 * - Columns are a typed array in the page; `type` formats dates (Asia/Dhaka), taka (lakh grouping) and statuses.
 * - Sortable headers are buttons with `aria-sort` on the `<th>`; row actions sit in a menu, filtered by CASL once.
 * - `selectable` adds checkboxes and emits `selectionChange` (row keys). Sticky header; on phones each row becomes a
 *   card ("label: value" lines), unless `cards` is false. Loading shows skeleton rows; empty shows an empty state.
 */
@Component({
    selector: 'fm-data-table',
    imports: [
        NgTemplateOutlet,
        AppDatePipe,
        TakaPipe,
        BadgeComponent,
        SkeletonComponent,
        EmptyStateComponent,
        IconComponent,
        ButtonComponent,
        MenuComponent,
        MenuItemDirective,
        MenuTriggerDirective,
        PaginationComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'flex flex-col gap-3' },
    template: `
        <div class="fm-table-wrap" [class.fm-table-cards]="cards()">
            <table class="fm-table" [attr.aria-busy]="loading() ? 'true' : null">
                @if (caption()) {
                    <caption class="fm-sr-only">{{ caption() }}</caption>
                }
                <thead>
                    <tr>
                        @if (selectable()) {
                            <th class="w-10" scope="col">
                                <input
                                    class="fm-check"
                                    type="checkbox"
                                    aria-label="Select all rows on this page"
                                    [checked]="allSelected()"
                                    [indeterminate]="someSelected()"
                                    (change)="toggleAll()"
                                />
                            </th>
                        }
                        @for (col of columns(); track col.key) {
                            <th scope="col" [attr.aria-sort]="ariaSort(col.key)" [class.fm-num]="isEnd(col)" [style.width]="col.width">
                                @if (col.sortable) {
                                    <button class="fm-sort-btn" type="button" (click)="sortBy(col.key)">
                                        {{ col.header }}
                                        <fm-icon size="0.875rem" [name]="sortIcon(col.key)" />
                                    </button>
                                } @else {
                                    {{ col.header }}
                                }
                            </th>
                        }
                        @if (allowedActions().length) {
                            <th class="w-14" scope="col"><span class="fm-sr-only">Actions</span></th>
                        }
                    </tr>
                </thead>
                <tbody>
                    @if (loading() && !rows().length) {
                        @for (i of skeletonRows; track i) {
                            <tr>
                                @if (selectable()) {
                                    <td data-label=""></td>
                                }
                                @for (col of columns(); track col.key) {
                                    <td [attr.data-label]="col.header"><fm-skeleton height="0.875rem" [width]="i % 2 ? '70%' : '50%'" /></td>
                                }
                                @if (allowedActions().length) {
                                    <td data-label=""></td>
                                }
                            </tr>
                        }
                    } @else {
                        @for (row of rows(); track rowKey(row)) {
                            <tr
                                [attr.aria-selected]="selectable() ? isSelected(row) : null"
                                [class.cursor-pointer]="clickable()"
                                [class.opacity-60]="loading()"
                                (click)="onRowClick($event, row)"
                            >
                                @if (selectable()) {
                                    <td data-label="">
                                        <input
                                            class="fm-check"
                                            type="checkbox"
                                            [attr.aria-label]="'Select row ' + rowKey(row)"
                                            [checked]="isSelected(row)"
                                            (change)="toggle(row)"
                                        />
                                    </td>
                                }
                                @for (col of columns(); track col.key) {
                                    <td [attr.data-label]="col.header" [class.fm-num]="isEnd(col)" [class.max-md:hidden]="col.hideOnMobile && cards()">
                                        @switch (col.type ?? 'text') {
                                            @case ('date') {
                                                {{ $any(cell(row, col.key)) | appDate }}
                                            }
                                            @case ('datetime') {
                                                {{ $any(cell(row, col.key)) | appDate: 'dd MMM yyyy, h:mm a' }}
                                            }
                                            @case ('taka') {
                                                {{ $any(cell(row, col.key)) | taka: 0 }}
                                            }
                                            @case ('number') {
                                                {{ cell(row, col.key) }}
                                            }
                                            @case ('status') {
                                                <fm-badge dot [tone]="tone(col, cell(row, col.key))">{{ cell(row, col.key) }}</fm-badge>
                                            }
                                            @case ('template') {
                                                <ng-container [ngTemplateOutlet]="cellTemplate(col.key)" [ngTemplateOutletContext]="{ $implicit: row }" />
                                            }
                                            @default {
                                                {{ cell(row, col.key) }}
                                            }
                                        }
                                    </td>
                                }
                                @if (allowedActions().length) {
                                    <td class="fm-num" data-label="">
                                        <button
                                            fmButton
                                            iconOnly
                                            size="sm"
                                            variant="ghost"
                                            [attr.aria-label]="'Actions for ' + rowKey(row)"
                                            [fmMenuTrigger]="menu"
                                        >
                                            <fm-icon name="ellipsis" />
                                        </button>
                                        <fm-menu #menu label="Row actions">
                                            @for (a of allowedActions(); track a.name) {
                                                @if (!a.visible || a.visible(row)) {
                                                    <button fmMenuItem [danger]="!!a.danger" (click)="action.emit({ action: a.name, row })">
                                                        <fm-icon size="1rem" [name]="a.icon" />
                                                        {{ a.label }}
                                                    </button>
                                                }
                                            }
                                        </fm-menu>
                                    </td>
                                }
                            </tr>
                        }
                    }
                </tbody>
            </table>
            @if (!loading() && !rows().length) {
                <fm-empty-state [description]="emptyText()" [icon]="emptyIcon()" [title]="emptyTitle()">
                    <ng-content select="[fmEmptyActions]" />
                </fm-empty-state>
            }
        </div>
        @if (paginated() && total() > 0) {
            <fm-pagination
                [pageIndex]="pageIndex()"
                [pageSize]="pageSize()"
                [total]="total()"
                (pageIndexChange)="emit({ pageIndex: $event })"
                (pageSizeChange)="emit({ pageSize: $event, pageIndex: 1 })"
            />
        }
    `
})
export class DataTableComponent<T extends object> {
    private readonly _auth = inject(AuthService);
    private readonly _selected = signal(new Set<unknown>());
    private readonly _cells = contentChildren(CellDirective);

    readonly rows = input.required<T[]>();
    readonly columns = input.required<TableColumn<T>[]>();
    readonly total = input(0);
    readonly loading = input(false, { transform: booleanAttribute });
    readonly pageIndex = input(1);
    readonly pageSize = input<number>(APP.PAGE_SIZE);
    readonly sort = input<SortState>({});
    readonly actions = input<TableAction<T>[]>([]);
    readonly trackBy = input<keyof T>('oid' as keyof T);
    readonly selectable = input(false, { transform: booleanAttribute });
    /** Rows emit `rowClick` (opening a profile). Clicks on buttons, links and checkboxes inside are ignored. */
    readonly clickable = input(false, { transform: booleanAttribute });
    readonly cards = input(true, { transform: booleanAttribute });
    readonly paginated = input(true, { transform: booleanAttribute });
    readonly caption = input<string>();
    readonly emptyTitle = input('Nothing here yet');
    readonly emptyText = input<string>();
    readonly emptyIcon = input<'inbox' | 'search' | 'users'>('inbox');

    readonly queryChange = output<TableQuery>();
    readonly action = output<TableActionEvent<T>>();
    readonly rowClick = output<T>();
    readonly selectionChange = output<unknown[]>();

    protected readonly skeletonRows = [0, 1, 2, 3, 4];
    /** Actions the current user may use. Filtered once, not per row. */
    protected readonly allowedActions = computed(() => this.actions().filter(a => !a.can || this._auth.can(...a.can)));
    protected readonly allSelected = computed(() => this.rows().length > 0 && this.rows().every(r => this._selected().has(this.rowKey(r))));
    protected readonly someSelected = computed(() => !this.allSelected() && this.rows().some(r => this._selected().has(this.rowKey(r))));

    protected cell(row: T, key: string): unknown {
        return key.split('.').reduce<unknown>((v, k) => (v as Record<string, unknown> | null | undefined)?.[k], row);
    }

    protected rowKey(row: T): unknown {
        return (row as Record<string, unknown>)[this.trackBy() as string];
    }

    protected cellTemplate(key: string): TemplateRef<{ $implicit: unknown }> | null {
        return this._cells().find(c => c.fmCell() === key)?.template ?? null;
    }

    protected isEnd(col: TableColumn<T>): boolean {
        return col.align === 'end' || col.type === 'taka' || col.type === 'number';
    }

    protected tone(col: TableColumn<T>, value: unknown): Tone {
        return (col.statusTones ?? DEFAULT_TONES)[String(value)] ?? 'neutral';
    }

    protected ariaSort(key: string): 'ascending' | 'descending' | null {
        const s = this.sort();
        return s.sortBy === key ? (s.sortOrder === 'desc' ? 'descending' : 'ascending') : null;
    }

    protected sortIcon(key: string): 'arrow-up' | 'arrow-down' | 'arrow-up-down' {
        const s = this.sort();
        return s.sortBy !== key ? 'arrow-up-down' : s.sortOrder === 'desc' ? 'arrow-down' : 'arrow-up';
    }

    /** Cycles a column: ascending → descending → unsorted. */
    protected sortBy(key: string): void {
        const s = this.sort();
        const next: SortState = s.sortBy !== key ? { sortBy: key, sortOrder: 'asc' } : s.sortOrder === 'asc' ? { sortBy: key, sortOrder: 'desc' } : {};
        this.emit({ ...next, pageIndex: 1, sortBy: next.sortBy, sortOrder: next.sortOrder });
    }

    protected emit(change: Partial<TableQuery>): void {
        this.queryChange.emit({ pageIndex: this.pageIndex(), pageSize: this.pageSize(), ...this.sort(), ...change });
    }

    protected isSelected(row: T): boolean {
        return this._selected().has(this.rowKey(row));
    }

    protected toggle(row: T): void {
        const next = new Set(this._selected());
        const key = this.rowKey(row);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        this._setSelection(next);
    }

    protected toggleAll(): void {
        const next = new Set(this._selected());
        const all = this.allSelected();
        for (const r of this.rows()) {
            if (all) next.delete(this.rowKey(r));
            else next.add(this.rowKey(r));
        }
        this._setSelection(next);
    }

    protected onRowClick(event: MouseEvent, row: T): void {
        if (!this.clickable()) return;
        if ((event.target as HTMLElement).closest('button, a, input, label, [role=menu]')) return;
        this.rowClick.emit(row);
    }

    private _setSelection(next: Set<unknown>): void {
        this._selected.set(next);
        this.selectionChange.emit([...next]);
    }
}
