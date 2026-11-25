import { afterNextRender, ChangeDetectionStrategy, Component, ElementRef, inject, input, numberAttribute, signal, viewChild } from '@angular/core';
import { rxResource, takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';

import { BranchContextService } from '@core/branch/branch-context.service';
import type { MemberListItem, MemberStatus } from '@core/models/member.model';
import type { ExportFormat } from '@core/models/report.model';
import { ReportsService } from '@features/reports/reports.service';
import { ExportMenuComponent } from '@shared/components/export-menu/export-menu.component';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { CanDirective } from '@shared/directives/can.directive';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { CellDirective, DataTableComponent } from '@shared/ui/data-table/data-table.component';
import type { TableAction, TableActionEvent, TableColumn, TableQuery } from '@shared/ui/data-table/data-table.model';
import { AvatarComponent } from '@shared/ui/display/display';
import { FieldComponent, InputDirective, PrefixDirective } from '@shared/ui/forms/field.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { ConsoleService } from '../console.service';

const CODE = /^MEM-[A-Z]{3}-\d{6}$/i;
const STATUSES: (MemberStatus | '')[] = ['', 'Active', 'Expired', 'Frozen', 'Suspended', 'Banned', 'Pending'];

/**
 * H2: members of the active branch. Server-side search (name, phone, member code), filters, paging and sort, all in
 * the URL. Scanner friendly: the search field has focus, and an exact member code opens that member.
 */
@Component({
    selector: 'app-member-list-page',
    imports: [
        ExportMenuComponent,
        FormsModule,
        RouterLink,
        PageHeaderComponent,
        CanDirective,
        ButtonComponent,
        DataTableComponent,
        CellDirective,
        AvatarComponent,
        FieldComponent,
        InputDirective,
        PrefixDirective,
        SelectComponent,
        IconComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-page-header title="Members" [subtitle]="(data.value()?.count ?? 0) + ' shown'">
            <app-export-menu *appCan="'export'; on: 'Report'" label="Export the member list" [busy]="exporting()" (export)="exportList($event)" />
            <a *appCan="'create'; on: 'Member'" fmButton routerLink="new" variant="primary">
                <fm-icon name="user-plus" />
                Add member
            </a>
        </app-page-header>

        <div class="mb-3 flex flex-wrap gap-1.5" aria-label="Status" role="radiogroup">
            @for (s of statuses; track s) {
                <button
                    fmButton
                    role="radio"
                    size="sm"
                    [attr.aria-checked]="(status() ?? '') === s"
                    [variant]="(status() ?? '') === s ? 'primary' : 'secondary'"
                    (click)="patch({ status: s || null, page: null })"
                >
                    {{ s || 'All' }}
                    @if (data.value()?.counts; as counts) {
                        <span class="tabular-nums opacity-75">{{ s ? (counts[s] ?? 0) : total(counts) }}</span>
                    }
                </button>
            }
        </div>

        <div class="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_12rem]">
            <fm-field>
                <fm-icon class="text-fg-subtle" name="search" fmPrefix />
                <input
                    #search
                    type="search"
                    aria-label="Search members"
                    autocomplete="off"
                    enterkeyhint="search"
                    fmInput
                    placeholder="Name, phone or member code (scan a card)"
                    [ngModel]="text()"
                    (keydown.enter)="onEnter()"
                    (ngModelChange)="text.set($event)"
                />
            </fm-field>
            <fm-select
                ariaLabel="Plan"
                placeholder="Any plan"
                [ngModel]="plan() ?? ''"
                [options]="planOptions"
                (ngModelChange)="patch({ plan: $event || null, page: null })"
            />
            <fm-select
                ariaLabel="Show"
                placeholder="Everyone"
                [ngModel]="flag() ?? ''"
                [options]="flagOptions"
                (ngModelChange)="patch({ flag: $event || null, page: null })"
            />
        </div>

        <fm-data-table
            caption="Members"
            clickable
            emptyIcon="users"
            emptyText="Try another search or filter."
            emptyTitle="No members match"
            [actions]="actions"
            [columns]="columns"
            [loading]="data.isLoading()"
            [pageIndex]="page() ?? 1"
            [pageSize]="size() ?? 10"
            [rows]="data.value()?.rows ?? []"
            [sort]="{ sortBy: sortBy(), sortOrder: sortOrder() }"
            [total]="data.value()?.count ?? 0"
            (action)="onAction($event)"
            (queryChange)="onQuery($event)"
            (rowClick)="open($event)"
        >
            <ng-template fmCell="name" let-row>
                <a class="flex min-w-0 items-center gap-3 text-fg no-underline hover:underline" [routerLink]="row.oid">
                    <fm-avatar size="2rem" [name]="row.name" [src]="row.photo_url" />
                    <span class="min-w-0">
                        <span class="block truncate font-medium">{{ row.name }}</span>
                        <span class="block text-xs text-fg-subtle">{{ row.code }}</span>
                    </span>
                </a>
            </ng-template>
            <ng-template fmCell="days_left" let-row>
                @if (row.days_left === null) {
                    –
                } @else if (row.days_left < 0) {
                    <span class="text-danger-fg">{{ -row.days_left }} days ago</span>
                } @else {
                    <span [class.text-warning-fg]="row.days_left <= 7">{{ row.days_left }} days</span>
                }
            </ng-template>
        </fm-data-table>
    `
})
export class MemberListPageComponent {
    private readonly _service = inject(ConsoleService);
    private readonly _router = inject(Router);
    private readonly _route = inject(ActivatedRoute);
    private readonly _search = viewChild.required<ElementRef<HTMLInputElement>>('search');

    private readonly _reports = inject(ReportsService);
    private readonly _active = inject(BranchContextService).active;
    protected readonly exporting = signal(false);

    readonly q = input<string>();
    readonly status = input<MemberStatus | ''>();
    readonly plan = input<string>();
    readonly flag = input<'expiring' | 'dues' | ''>();
    readonly page = input(undefined, { transform: (v: unknown) => (v === undefined ? undefined : numberAttribute(v, 1)) });
    readonly size = input(undefined, { transform: (v: unknown) => (v === undefined ? undefined : numberAttribute(v, 10)) });
    readonly sortBy = input<string>();
    readonly sortOrder = input<'asc' | 'desc'>();

    protected readonly statuses = STATUSES;
    protected readonly text = signal('');
    protected readonly planOptions: SelectOption<string>[] = [
        { value: '', label: 'Any plan' },
        { value: 'Single', label: 'Single' },
        { value: 'Duo', label: 'Duo' },
        { value: 'Group', label: 'Group' }
    ];
    protected readonly flagOptions: SelectOption<string>[] = [
        { value: '', label: 'Everyone' },
        { value: 'expiring', label: 'Expiring in 7 days' },
        { value: 'dues', label: 'Owes money' }
    ];
    protected readonly columns: TableColumn<MemberListItem>[] = [
        { key: 'name', header: 'Member', type: 'template', sortable: true },
        { key: 'phone', header: 'Phone', hideOnMobile: true },
        { key: 'plan_name', header: 'Plan', hideOnMobile: true },
        { key: 'valid_until', header: 'Valid until', type: 'date', sortable: true },
        { key: 'days_left', header: 'Days left', type: 'template', sortable: true },
        { key: 'dues', header: 'Dues', type: 'taka', sortable: true },
        { key: 'status', header: 'Status', type: 'status', sortable: true },
        { key: 'last_visit', header: 'Last visit', type: 'date', sortable: true, hideOnMobile: true }
    ];
    protected readonly actions: TableAction<MemberListItem>[] = [
        { name: 'open', icon: 'user', label: 'Open profile' },
        {
            name: 'renew',
            icon: 'refresh-cw',
            label: 'Renew or sell a plan',
            can: ['create', 'Subscription'],
            visible: r => r.status !== 'Suspended' && r.status !== 'Banned'
        },
        { name: 'checkin', icon: 'scan-line', label: 'Check in', can: ['create', 'Attendance'] }
    ];

    protected readonly data = rxResource({
        params: () => ({
            q: this.q() ?? '',
            status: this.status() ?? '',
            plan: this.plan() ?? '',
            flag: this.flag() ?? '',
            page: this.page() ?? 1,
            size: this.size() ?? 10,
            sort_by: this.sortBy(),
            sort_order: this.sortOrder()
        }),
        stream: ({ params }) => this._service.members(params)
    });

    constructor() {
        toObservable(this.text)
            .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
            .subscribe(t => {
                if ((this.q() ?? '') !== t.trim() && !CODE.test(t.trim())) this.patch({ q: t.trim() || null, page: null });
            });
        afterNextRender(() => {
            this.text.set(this.q() ?? '');
            this._search().nativeElement.focus();
        });
    }

    protected total(counts: Record<string, number>): number {
        return Object.values(counts).reduce((a, b) => a + b, 0);
    }

    /** Enter on an exact member code (a scanner ends with Enter) opens that member. */
    protected onEnter(): void {
        const t = this.text().trim();
        if (!CODE.test(t)) return;
        this._service.lookup(t.toUpperCase()).subscribe({
            next: m => void this._router.navigate([m.oid], { relativeTo: this._route }),
            error: () => this.patch({ q: t, page: null })
        });
    }

    protected onQuery(q: TableQuery): void {
        this.patch({
            page: q.pageIndex === 1 ? null : q.pageIndex,
            size: q.pageSize === 10 ? null : q.pageSize,
            sortBy: q.sortBy ?? null,
            sortOrder: q.sortOrder ?? null
        });
    }

    protected onAction(e: TableActionEvent<MemberListItem>): void {
        if (e.action === 'open') this.open(e.row);
        else if (e.action === 'renew') void this._router.navigate([e.row.oid, 'subscribe'], { relativeTo: this._route });
        else void this._router.navigate(['../check-in'], { relativeTo: this._route });
    }

    protected open(row: MemberListItem): void {
        void this._router.navigate([row.oid], { relativeTo: this._route });
    }

    protected patch(params: Record<string, string | number | null>): void {
        void this._router.navigate([], { relativeTo: this._route, queryParams: params, queryParamsHandling: 'merge' });
    }

    /** Every member the filters match, as Excel or PDF (the API records the export). */
    protected async exportList(format: ExportFormat): Promise<void> {
        this.exporting.set(true);
        // Only the filters in use (an empty one means "any").
        const filters = Object.fromEntries(Object.entries({ q: this.q(), status: this.status(), plan: this.plan(), flag: this.flag() }).filter(([, v]) => !!v));
        const shown = Object.values(filters).join(', ');
        try {
            await this._reports.exportList('members', { filters }, format, {
                title: 'Members',
                subtitle: `${this._active()?.name ?? ''}${shown ? ' · ' + shown : ''}`
            });
        } finally {
            this.exporting.set(false);
        }
    }
}
