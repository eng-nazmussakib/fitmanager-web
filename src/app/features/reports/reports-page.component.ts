import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { addDays, endOfMonth, format, parseISO, startOfMonth, subMonths } from 'date-fns';

import { AuthService } from '@core/auth/auth.service';
import { BranchContextService } from '@core/branch/branch-context.service';
import { type ReportKey, REPORTS } from '@core/models/report.model';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { AlertComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { DatePickerComponent, todayIso } from '@shared/ui/forms/date-picker.component';
import { FieldComponent } from '@shared/ui/forms/field.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { SwitchComponent } from '@shared/ui/forms/switch.component';

import { ReportViewComponent } from './report-view.component';
import { ReportsService } from './reports.service';

type RangeId = 'today' | '7d' | '30d' | 'month' | 'last_month' | 'custom';

const RANGES: { id: RangeId; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: '7d', label: '7 days' },
    { id: '30d', label: '30 days' },
    { id: 'month', label: 'This month' },
    { id: 'last_month', label: 'Last month' },
    { id: 'custom', label: 'Custom' }
];

const iso = (d: Date): string => format(d, 'yyyy-MM-dd');

/**
 * `/console/:branch/reports` and `/hq/reports`: the eight fixed reports, a range (quick picks
 * or a custom range of up to 366 days), "compare with the previous period", and at HQ a branch filter. Everything
 * is in the URL (`?report=&range=&from=&to=&compare=&branch=`), so a view can be shared or bookmarked.
 */
@Component({
    selector: 'app-reports-page',
    imports: [
        FormsModule,
        PageHeaderComponent,
        ButtonComponent,
        AlertComponent,
        CardComponent,
        SkeletonComponent,
        DatePickerComponent,
        FieldComponent,
        SelectComponent,
        SwitchComponent,
        ReportViewComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-page-header title="Reports" [subtitle]="subtitle()" />

        <nav class="mb-4 flex flex-wrap gap-2" aria-label="Reports">
            @for (r of reports; track r.key) {
                <button
                    fmButton
                    size="sm"
                    [attr.aria-current]="r.key === key() ? 'page' : null"
                    [attr.title]="r.description"
                    [variant]="r.key === key() ? 'primary' : 'secondary'"
                    (click)="go({ report: r.key === 'revenue' ? null : r.key })"
                >
                    {{ r.title }}
                </button>
            }
        </nav>

        <fm-card class="mb-4 block">
            <div class="flex flex-wrap items-end gap-3">
                <div class="flex flex-wrap gap-1 rounded-[var(--radius-control)] border border-border bg-surface p-1" aria-label="Date range" role="radiogroup">
                    @for (r of ranges; track r.id) {
                        <button
                            fmButton
                            role="radio"
                            size="sm"
                            [attr.aria-checked]="r.id === rangeId()"
                            [variant]="r.id === rangeId() ? 'primary' : 'ghost'"
                            (click)="go({ range: r.id === '30d' ? null : r.id, from: null, to: null })"
                        >
                            {{ r.label }}
                        </button>
                    }
                </div>
                @if (rangeId() === 'custom') {
                    <fm-field class="w-44" label="From">
                        <fm-date-picker [max]="window().to" [ngModel]="window().from" (ngModelChange)="custom($event, window().to)" />
                    </fm-field>
                    <fm-field class="w-44" label="To">
                        <fm-date-picker [max]="today" [min]="window().from" [ngModel]="window().to" (ngModelChange)="custom(window().from, $event)" />
                    </fm-field>
                }
                @if (hq) {
                    <fm-field class="w-52" label="Branch">
                        <fm-select [ngModel]="branch() ?? ''" [options]="branchOptions()" (ngModelChange)="go({ branch: $event || null })" />
                    </fm-field>
                }
                <fm-switch class="pb-2" [ngModel]="comparing()" (ngModelChange)="go({ compare: $event ? '1' : null })">
                    Compare with the previous period
                </fm-switch>
            </div>
        </fm-card>

        @if (data.error()) {
            <fm-alert title="The report could not load" tone="danger">
                {{ errorText() }}
                <button class="mt-2" fmAlertActions fmButton size="sm" (click)="data.reload()">Retry</button>
            </fm-alert>
        } @else if (data.hasValue() && !data.isLoading()) {
            <app-report-view [branchOid]="hq ? (branch() ?? null) : null" [report]="data.value()" />
        } @else {
            <section class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-busy="true" aria-label="Loading the report">
                @for (i of [1, 2, 3, 4, 5, 6]; track i) {
                    <fm-card class="min-h-28">
                        <fm-skeleton height="0.875rem" width="60%" />
                        <fm-skeleton class="mt-3" height="1.75rem" width="70%" />
                    </fm-card>
                }
            </section>
            <fm-skeleton class="mt-4 block" height="18rem" />
        }
    `
})
export class ReportsPageComponent {
    private readonly _router = inject(Router);
    private readonly _route = inject(ActivatedRoute);
    private readonly _reports = inject(ReportsService);
    private readonly _auth = inject(AuthService);
    private readonly _branch = inject(BranchContextService).active;

    protected readonly hq = this._route.snapshot.data['hq'] === true;
    protected readonly reports = REPORTS;
    protected readonly ranges = RANGES;
    protected readonly today = todayIso();

    readonly report = input<string>();
    readonly range = input<string>();
    readonly from = input<string>();
    readonly to = input<string>();
    readonly compare = input<string>();
    readonly branch = input<string>();

    protected readonly key = computed<ReportKey>(() => REPORTS.find(r => r.key === this.report())?.key ?? 'revenue');
    protected readonly rangeId = computed<RangeId>(() => RANGES.find(r => r.id === this.range())?.id ?? '30d');
    protected readonly comparing = computed(() => this.compare() === '1');
    protected readonly window = computed(() => {
        const today = parseISO(this.today);
        switch (this.rangeId()) {
            case 'today':
                return { from: this.today, to: this.today };
            case '7d':
                return { from: iso(addDays(today, -6)), to: this.today };
            case 'month':
                return { from: iso(startOfMonth(today)), to: this.today };
            case 'last_month': {
                const last = subMonths(today, 1);
                return { from: iso(startOfMonth(last)), to: iso(endOfMonth(last)) };
            }
            case 'custom':
                return { from: this.from() ?? iso(addDays(today, -29)), to: this.to() ?? this.today };
            default:
                return { from: iso(addDays(today, -29)), to: this.today };
        }
    });

    protected readonly branchOptions = computed<SelectOption<string>[]>(() => [
        { value: '', label: 'Every branch' },
        ...(this._auth.user()?.assignments ?? []).filter(a => a.branch.kind === 'BRANCH').map(a => ({ value: a.branch.oid, label: a.branch.name }))
    ]);
    protected readonly subtitle = computed(() => {
        const where = this.hq ? (this.branchOptions().find(o => o.value === (this.branch() ?? ''))?.label ?? 'Every branch') : (this._branch()?.name ?? '');
        const title = REPORTS.find(r => r.key === this.key())?.title ?? '';
        return `${title} · ${where} · ${this.window().from} to ${this.window().to}`;
    });

    protected readonly data = rxResource({
        params: () => ({ key: this.key(), ...this.window(), compare: this.comparing(), branch_oid: this.branch() ?? null }),
        stream: ({ params }) => this._reports.report(params.key, params, this.hq)
    });
    protected readonly errorText = computed(() => {
        const e = this.data.error() as { error?: { message?: string } } | undefined;
        return e?.error?.message ?? 'Check the connection and try again.';
    });

    protected go(params: Record<string, string | null>): void {
        void this._router.navigate([], { relativeTo: this._route, queryParams: params, queryParamsHandling: 'merge', replaceUrl: true });
    }

    protected custom(from: string | null, to: string | null): void {
        if (!from || !to) return;
        this.go({ range: 'custom', from, to });
    }
}
