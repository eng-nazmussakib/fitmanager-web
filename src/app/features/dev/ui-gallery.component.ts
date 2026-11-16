import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { ButtonComponent, type ButtonVariant } from '@shared/ui/button/button.component';
import { CellDirective, DataTableComponent } from '@shared/ui/data-table/data-table.component';
import type { TableAction, TableColumn, TableQuery } from '@shared/ui/data-table/data-table.model';
import { ConfirmService } from '@shared/ui/dialog/confirm.service';
import { DialogComponent } from '@shared/ui/dialog/dialog.component';
import { DialogFooterDirective } from '@shared/ui/dialog/dialog-shell.component';
import { BarcodeComponent } from '@shared/ui/display/barcode.component';
import {
    AlertComponent,
    AvatarComponent,
    BadgeComponent,
    CardComponent,
    CardFooterDirective,
    DividerDirective,
    SkeletonComponent,
    SpinnerComponent,
    type Tone
} from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';
import { DatePickerComponent } from '@shared/ui/forms/date-picker.component';
import { CheckDirective, FieldComponent, InputDirective, PrefixDirective, SuffixDirective } from '@shared/ui/forms/field.component';
import { NumberInputComponent } from '@shared/ui/forms/number-input.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { SwitchComponent } from '@shared/ui/forms/switch.component';
import { IconComponent } from '@shared/ui/icon/icon.component';
import { FM_ICONS, type IconName } from '@shared/ui/icon/icons';
import { MenuComponent, MenuItemDirective, MenuTriggerDirective } from '@shared/ui/menu/menu';
import { BreadcrumbComponent } from '@shared/ui/navigation/breadcrumb.component';
import { PaginationComponent } from '@shared/ui/navigation/pagination.component';
import { ThemeToggleComponent } from '@shared/ui/navigation/theme-toggle.component';
import { TabDirective, TabsComponent } from '@shared/ui/tabs/tabs.component';
import { ToastService } from '@shared/ui/toast/toast.service';
import { TooltipDirective } from '@shared/ui/tooltip/tooltip.directive';

interface Row {
    oid: string;
    name: string;
    plan: string;
    valid_until: string;
    dues: number;
    status: string;
}

const ROWS: Row[] = Array.from({ length: 23 }, (_, i) => ({
    oid: `r${i + 1}`,
    name: ['Rahim Uddin', 'Nusrat Jahan', 'Karim Ahmed', 'Farhana Akter', 'Tanvir Hasan with a very long name to check wrapping'][i % 5],
    plan: ['Single · Monthly', 'Duo · 3 Months', 'Group · Annually'][i % 3],
    valid_until: `2026-${String((i % 12) + 1).padStart(2, '0')}-15`,
    dues: (i % 4) * 750,
    status: ['Active', 'Expired', 'Frozen', 'Suspended', 'Pending'][i % 5]
}));

/**
 * `/dev/ui` (development builds only): every kit component in every variant, in the current theme. The place to
 * check the quality bar (03-design-system.md §4): keyboard, labels, light and dark, long text, phone widths.
 */
@Component({
    selector: 'app-ui-gallery',
    imports: [
        FormsModule,
        PageHeaderComponent,
        ButtonComponent,
        DataTableComponent,
        CellDirective,
        BarcodeComponent,
        AlertComponent,
        AvatarComponent,
        BadgeComponent,
        CardComponent,
        CardFooterDirective,
        DividerDirective,
        SkeletonComponent,
        SpinnerComponent,
        DialogComponent,
        DialogFooterDirective,
        EmptyStateComponent,
        DatePickerComponent,
        CheckDirective,
        FieldComponent,
        InputDirective,
        PrefixDirective,
        SuffixDirective,
        NumberInputComponent,
        SelectComponent,
        SwitchComponent,
        IconComponent,
        MenuComponent,
        MenuItemDirective,
        MenuTriggerDirective,
        BreadcrumbComponent,
        PaginationComponent,
        ThemeToggleComponent,
        TabsComponent,
        TabDirective,
        TooltipDirective
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'block min-h-dvh bg-bg text-fg' },
    template: `
        <div class="mx-auto max-w-6xl px-4 py-8">
            <app-page-header
                subtitle="The fm-* kit: native elements, semantic tokens, keyboard first. Development builds only."
                title="UI kit"
                [crumbs]="false"
            >
                <fm-theme-toggle />
            </app-page-header>

            <nav class="mb-8 flex flex-wrap gap-2 text-sm" aria-label="Sections">
                @for (s of sections; track s) {
                    <a class="fm-badge no-underline hover:underline" [href]="'#' + s.toLowerCase()">{{ s }}</a>
                }
            </nav>

            <section id="buttons" class="gallery-section">
                <h2>Buttons</h2>
                <div class="flex flex-wrap items-center gap-2">
                    @for (v of variants; track v) {
                        <button fmButton [variant]="v">{{ v }}</button>
                    }
                    <button disabled fmButton variant="primary">Disabled</button>
                    <button fmButton loading variant="primary">Loading</button>
                    <button aria-label="Settings" fmButton fmTooltip="Settings" iconOnly><fm-icon name="settings" /></button>
                    <button fmButton size="sm" variant="primary">
                        <fm-icon name="plus" size="1rem" />
                        Small
                    </button>
                    <button fmButton size="lg" variant="primary">
                        <fm-icon name="log-in" />
                        Large with icon
                    </button>
                </div>
            </section>

            <section id="display" class="gallery-section">
                <h2>Display</h2>
                <div class="flex flex-wrap items-center gap-2">
                    @for (t of tones; track t) {
                        <fm-badge dot [tone]="t">{{ t }}</fm-badge>
                    }
                </div>
                <div class="mt-4 flex flex-wrap items-center gap-3">
                    <fm-avatar name="Rahim Uddin" />
                    <fm-avatar name="Nusrat Jahan" size="3rem" />
                    <fm-avatar name="Sam Cole" size="4rem" src="assets/images/landing/trainer-sam.webp" />
                    <fm-spinner />
                    <fm-skeleton height="1rem" width="10rem" />
                    <fm-barcode class="w-72" value="MEM-GUL-000001" />
                </div>
                <hr fmDivider />
                <div class="grid gap-3 md:grid-cols-2">
                    <fm-alert title="Information">The membership renews on 15 December.</fm-alert>
                    <fm-alert title="Saved" tone="success">The payment was recorded.</fm-alert>
                    <fm-alert title="Dues over the limit" tone="warning">৳2,500 owed; the limit is ৳1,000.</fm-alert>
                    <fm-alert title="Blocked" tone="danger">Subscription expired 3 days ago.</fm-alert>
                </div>
                <div class="mt-4 grid gap-3 md:grid-cols-3">
                    <fm-card subtitle="With a subtitle and actions" title="Card">
                        <button aria-label="More" fmButton fmCardActions iconOnly size="sm" variant="ghost"><fm-icon name="ellipsis" /></button>
                        Body text.
                        <footer fmCardFooter>
                            <button fmButton size="sm">Cancel</button>
                            <button fmButton size="sm" variant="primary">Save</button>
                        </footer>
                    </fm-card>
                    <fm-card><fm-empty-state description="Short description of the empty state." icon="inbox" title="Nothing here yet" /></fm-card>
                    <fm-card title="Breadcrumb"><fm-breadcrumb [items]="crumbs" /></fm-card>
                </div>
            </section>

            <section id="forms" class="gallery-section">
                <h2>Forms</h2>
                <div class="grid gap-4 md:grid-cols-3">
                    <fm-field hint="Shown below the field" label="Text" required><input fmInput placeholder="Placeholder" [(ngModel)]="text" /></fm-field>
                    <fm-field error="An explicit error message" label="Invalid"><input fmInput value="wrong" /></fm-field>
                    <fm-field label="Disabled"><input disabled fmInput value="Read only" /></fm-field>
                    <fm-field label="Prefix and suffix">
                        <fm-icon class="text-fg-subtle" name="search" fmPrefix />
                        <input fmInput placeholder="Search" [(ngModel)]="search" />
                        @if (search) {
                            <span fmSuffix>
                                <button aria-label="Clear" fmButton iconOnly size="sm" variant="ghost" (click)="search = ''">
                                    <fm-icon name="x" size="1rem" />
                                </button>
                            </span>
                        }
                    </fm-field>
                    <fm-field hint="Grouped on blur: 1,25,000" label="Amount"><fm-number-input taka [(ngModel)]="amount" /></fm-field>
                    <fm-field hint="dd/mm/yyyy, weeks start on Saturday" label="Date"><fm-date-picker [(ngModel)]="date" /></fm-field>
                    <fm-field label="Select"><fm-select placeholder="Choose a plan" [options]="options" [(ngModel)]="plan" /></fm-field>
                    <fm-field class="md:col-span-2" label="Textarea"><textarea fmInput placeholder="Notes"></textarea></fm-field>
                </div>
                <div class="mt-4 flex flex-wrap items-center gap-6">
                    <label class="fm-check-label">
                        <input type="checkbox" fmCheck [(ngModel)]="checked" />
                        Checkbox
                    </label>
                    <label class="fm-check-label">
                        <input type="checkbox" fmCheck indeterminate />
                        Indeterminate
                    </label>
                    <label class="fm-check-label">
                        <input type="radio" name="r" fmCheck value="a" [(ngModel)]="radio" />
                        Radio A
                    </label>
                    <label class="fm-check-label">
                        <input type="radio" name="r" fmCheck value="b" [(ngModel)]="radio" />
                        Radio B
                    </label>
                    <fm-switch [(ngModel)]="on">Switch {{ on ? 'on' : 'off' }}</fm-switch>
                </div>
                <p class="mt-3 text-sm text-fg-muted">Values: {{ text }} · {{ amount }} · {{ date }} · {{ plan }} · {{ checked }} · {{ radio }}</p>
            </section>

            <section id="overlays" class="gallery-section">
                <h2>Overlays</h2>
                <div class="flex flex-wrap gap-2">
                    <button fmButton (click)="dialogOpen.set(true)">Dialog</button>
                    <button fmButton (click)="drawerOpen.set(true)">Drawer</button>
                    <button fmButton (click)="confirm()">Confirm</button>
                    <button fmButton [fmMenuTrigger]="menu">
                        Menu
                        <fm-icon name="chevron-down" size="1rem" />
                    </button>
                    <fm-menu #menu label="Actions">
                        <button fmMenuItem>
                            <fm-icon name="pencil" size="1rem" />
                            Edit
                        </button>
                        <button fmMenuItem>
                            <fm-icon name="copy" size="1rem" />
                            Duplicate
                        </button>
                        <div class="fm-menu-sep" role="separator"></div>
                        <button danger fmMenuItem>
                            <fm-icon name="trash-2" size="1rem" />
                            Delete
                        </button>
                    </fm-menu>
                    <button fmButton fmTooltip="A tooltip, on hover and focus">Tooltip</button>
                    @for (t of toastTones; track t) {
                        <button fmButton variant="ghost" (click)="toast(t)">Toast {{ t }}</button>
                    }
                </div>
            </section>

            <section id="navigation" class="gallery-section">
                <h2>Navigation</h2>
                <fm-tabs [(active)]="tab">
                    <ng-template fmTab="one" label="First">First panel. Use ← and → on the tabs.</ng-template>
                    <ng-template fmTab="two" label="Second" [count]="3">Second panel.</ng-template>
                    <ng-template fmTab="three" label="A long tab label">Third panel.</ng-template>
                </fm-tabs>
                <fm-pagination class="mt-4" [total]="243" [(pageIndex)]="pageIndex" [(pageSize)]="pageSize" />
            </section>

            <section id="data" class="gallery-section">
                <h2>Data table</h2>
                <fm-data-table
                    caption="Sample members"
                    selectable
                    [actions]="actions"
                    [columns]="columns"
                    [pageIndex]="tableQuery().pageIndex"
                    [pageSize]="tableQuery().pageSize"
                    [rows]="page()"
                    [sort]="tableQuery()"
                    [total]="rows.length"
                    (queryChange)="tableQuery.set($event)"
                >
                    <ng-template fmCell="name" let-row>
                        <span class="font-medium">{{ row.name }}</span>
                    </ng-template>
                </fm-data-table>
                <fm-data-table class="mt-4" caption="Loading" loading [columns]="columns" [rows]="[]" />
            </section>

            <section id="icons" class="gallery-section">
                <h2>Icons ({{ icons.length }})</h2>
                <ul class="grid grid-cols-3 gap-2 text-xs sm:grid-cols-6 lg:grid-cols-10">
                    @for (i of icons; track i) {
                        <li class="flex flex-col items-center gap-1 rounded-lg border border-border p-2 text-fg-muted">
                            <fm-icon [name]="i" />
                            <span class="truncate">{{ i }}</span>
                        </li>
                    }
                </ul>
            </section>
        </div>

        <fm-dialog description="A native modal dialog: Esc and the backdrop close it, focus returns." title="Dialog" [(open)]="dialogOpen">
            <fm-field label="Inside the dialog"><input fmInput /></fm-field>
            <ng-container fmDialogFooter>
                <button fmButton (click)="dialogOpen.set(false)">Cancel</button>
                <button fmButton variant="primary" (click)="dialogOpen.set(false)">Save</button>
            </ng-container>
        </fm-dialog>
        <fm-dialog size="drawer" title="Drawer" [(open)]="drawerOpen"><p>A side panel on desktop, a bottom sheet on phones.</p></fm-dialog>
    `,
    styles: `
        .gallery-section {
            margin-bottom: 2.5rem;
        }
        .gallery-section > h2 {
            margin-bottom: 1rem;
            font-size: 1.125rem;
            font-weight: 600;
        }
    `
})
export class UiGalleryComponent {
    private readonly _toast = inject(ToastService);
    private readonly _confirm = inject(ConfirmService);

    protected readonly sections = ['Buttons', 'Display', 'Forms', 'Overlays', 'Navigation', 'Data', 'Icons'];
    protected readonly variants: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger', 'link'];
    protected readonly tones: Tone[] = ['neutral', 'primary', 'success', 'warning', 'danger', 'info'];
    protected readonly toastTones = ['info', 'success', 'warning', 'danger'] as const;
    protected readonly icons = Object.keys(FM_ICONS) as IconName[];
    protected readonly crumbs = [
        { label: 'Gulshan', url: '/dev/ui' },
        { label: 'Members', url: '/dev/ui' },
        { label: 'Rahim Uddin', url: '/dev/ui' }
    ];
    protected readonly options: SelectOption<string>[] = [
        { value: 'single-m', label: 'Single · Monthly', description: '৳3,000' },
        { value: 'duo-q', label: 'Duo · 3 Months', description: '৳15,500' },
        { value: 'group-a', label: 'Group · Annually', description: '৳1,00,000' },
        { value: 'closed', label: 'Closed plan', disabled: true }
    ];
    protected readonly columns: TableColumn<Row>[] = [
        { key: 'name', header: 'Member', type: 'template', sortable: true },
        { key: 'plan', header: 'Plan', hideOnMobile: true },
        { key: 'valid_until', header: 'Valid until', type: 'date', sortable: true },
        { key: 'dues', header: 'Dues', type: 'taka', sortable: true },
        { key: 'status', header: 'Status', type: 'status' }
    ];
    protected readonly actions: TableAction<Row>[] = [
        { name: 'open', icon: 'user', label: 'Open' },
        { name: 'delete', icon: 'trash-2', label: 'Delete', danger: true }
    ];
    protected readonly rows = ROWS;

    protected text = '';
    protected search = '';
    protected amount: number | null = 125000;
    protected date: string | null = null;
    protected plan: string | null = null;
    protected checked = true;
    protected radio = 'a';
    protected on = false;
    protected tab = 'one';
    protected pageIndex = 1;
    protected pageSize = 10;
    protected readonly dialogOpen = signal(false);
    protected readonly drawerOpen = signal(false);
    protected readonly tableQuery = signal<TableQuery>({ pageIndex: 1, pageSize: 10 });

    protected page(): Row[] {
        const q = this.tableQuery();
        let rows = [...ROWS];
        if (q.sortBy)
            rows.sort(
                (a, b) =>
                    String(a[q.sortBy as keyof Row]).localeCompare(String(b[q.sortBy as keyof Row]), 'en', { numeric: true }) *
                    (q.sortOrder === 'desc' ? -1 : 1)
            );
        rows = rows.slice((q.pageIndex - 1) * q.pageSize, q.pageIndex * q.pageSize);
        return rows;
    }

    protected toast(tone: 'info' | 'success' | 'warning' | 'danger'): void {
        this._toast.show(`A ${tone} message, announced to screen readers.`, { tone, title: tone[0].toUpperCase() + tone.slice(1) });
    }

    protected confirm(): void {
        this._confirm.ask('Delete Rahim Uddin? This cannot be undone.', { danger: true }).subscribe(() => this._toast.success('Deleted (not really).'));
    }
}
