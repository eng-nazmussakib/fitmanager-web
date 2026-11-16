import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { addDays, format, parseISO, startOfMonth } from 'date-fns';
import type { ApexAxisChartSeries } from 'ng-apexcharts';

import { BranchContextService } from '@core/branch/branch-context.service';
import type { AttentionItem, Kpi } from '@core/models/dashboard.model';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { TakaPipe } from '@shared/pipes/taka.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { ChartComponent } from '@shared/ui/chart/chart.component';
import { BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { AlertComponent } from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';
import { DatePickerComponent, todayIso } from '@shared/ui/forms/date-picker.component';
import { FieldComponent } from '@shared/ui/forms/field.component';
import { IconComponent } from '@shared/ui/icon/icon.component';
import type { IconName } from '@shared/ui/icon/icons';

import { DashboardService } from './dashboard.service';

type RangeId = 'today' | 'month' | '30d' | 'custom';

const RANGES: { id: RangeId; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'month', label: 'This month' },
    { id: '30d', label: 'Last 30 days' },
    { id: 'custom', label: 'Custom' }
];

const KPI_ICONS: Record<Kpi['id'], IconName> = {
    active_members: 'users',
    revenue: 'banknote',
    dues: 'hand-coins',
    check_ins_today: 'scan-line',
    new_members: 'user-plus',
    expiring_7d: 'timer'
};

const ATTENTION: Record<AttentionItem['kind'], { label: string; tone: 'danger' | 'warning' | 'info' }> = {
    suspended: { label: 'Suspended', tone: 'danger' },
    dues: { label: 'Dues over limit', tone: 'warning' },
    expiring: { label: 'Expiring soon', tone: 'info' }
};

/**
 * H1: the dashboard. `data.scope` 'hq' (`/hq/dashboard`) compares the branches; 'branch'
 * (`/console/:branch/dashboard`) shows one. The range lives in the URL (`?range=&from=&to=`), so a view can be shared.
 * Charts load in the browser (`@defer`); every chart has the same numbers as text nearby (KPI tiles, table).
 */
@Component({
    selector: 'app-dashboard-page',
    imports: [
        FormsModule,
        RouterLink,
        PageHeaderComponent,
        TakaPipe,
        ButtonComponent,
        ChartComponent,
        BadgeComponent,
        CardComponent,
        SkeletonComponent,
        EmptyStateComponent,
        DatePickerComponent,
        FieldComponent,
        IconComponent,
        AlertComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-page-header [subtitle]="subtitle()" [title]="hq ? 'HQ dashboard' : 'Dashboard'">
            <div class="flex flex-wrap gap-1 rounded-[var(--radius-control)] border border-border bg-surface p-1" aria-label="Date range" role="radiogroup">
                @for (r of ranges; track r.id) {
                    <button
                        fmButton
                        role="radio"
                        size="sm"
                        [attr.aria-checked]="r.id === rangeId()"
                        [variant]="r.id === rangeId() ? 'primary' : 'ghost'"
                        (click)="setRange(r.id)"
                    >
                        {{ r.label }}
                    </button>
                }
            </div>
        </app-page-header>

        @if (rangeId() === 'custom') {
            <div class="mb-5 flex flex-wrap items-end gap-3">
                <fm-field class="w-44" label="From">
                    <fm-date-picker [max]="window().to" [ngModel]="window().from" (ngModelChange)="setCustom($event, window().to)" />
                </fm-field>
                <fm-field class="w-44" label="To">
                    <fm-date-picker [max]="today" [min]="window().from" [ngModel]="window().to" (ngModelChange)="setCustom(window().from, $event)" />
                </fm-field>
            </div>
        }

        @if (data.error()) {
            <fm-alert title="The dashboard could not load" tone="danger">
                Check the connection and try again.
                <button class="mt-2" fmAlertActions fmButton size="sm" (click)="data.reload()">Retry</button>
            </fm-alert>
        }

        <!-- KPI tiles -->
        <section class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Key figures">
            @if (data.hasValue()) {
                @for (k of data.value().kpis; track k.id) {
                    <fm-card class="min-h-32">
                        <div class="flex items-center justify-between gap-2 text-sm text-fg-muted">
                            {{ k.label }}
                            <fm-icon class="text-fg-subtle" [name]="icons[k.id]" />
                        </div>
                        <p class="mt-2 text-2xl font-semibold tabular-nums">
                            @if (k.money) {
                                {{ k.value | taka: 0 }}
                            } @else {
                                {{ k.value.toLocaleString('en-IN') }}
                            }
                        </p>
                        @if (k.delta_pct !== null) {
                            <p class="mt-1 flex items-center gap-1 text-xs" [class.text-danger-fg]="k.delta_pct < 0" [class.text-success-fg]="k.delta_pct >= 0">
                                <fm-icon size="0.875rem" [name]="k.delta_pct >= 0 ? 'trending-up' : 'trending-down'" />
                                {{ k.delta_pct > 0 ? '+' : '' }}{{ k.delta_pct }}% vs previous period
                            </p>
                        }
                        @if (hq && k.by_branch.length > 1) {
                            <details class="mt-2 text-xs">
                                <summary class="cursor-pointer text-fg-subtle hover:text-fg">By branch</summary>
                                <ul class="mt-1.5 flex flex-col gap-1">
                                    @for (b of k.by_branch; track b.branch.oid; let i = $index) {
                                        <li class="flex justify-between gap-2">
                                            <span class="flex items-center gap-1.5">
                                                <span class="size-2 rounded-full" [style.background]="'var(--fm-series-' + (i + 1) + ')'"></span>
                                                {{ b.branch.name }}
                                            </span>
                                            <span class="tabular-nums">{{ k.money ? (b.value | taka: 0) : b.value.toLocaleString('en-IN') }}</span>
                                        </li>
                                    }
                                </ul>
                            </details>
                        }
                    </fm-card>
                }
            } @else {
                @for (i of [1, 2, 3, 4, 5, 6]; track i) {
                    <fm-card class="min-h-32">
                        <fm-skeleton height="0.875rem" width="60%" />
                        <fm-skeleton class="mt-3" height="1.75rem" width="70%" />
                    </fm-card>
                }
            }
        </section>

        <div class="mt-4 grid gap-4 xl:grid-cols-5">
            <fm-card
                class="xl:col-span-3"
                title="Revenue"
                [subtitle]="hq ? 'Payments received per ' + (longRange() ? 'month' : 'day') + ', by branch' : 'Payments received'"
            >
                @if (data.hasValue()) {
                    @defer (on viewport) {
                        <fm-chart kind="line" label="Revenue trend by branch" money [categories]="trendCategories()" [series]="trendSeries()" />
                    } @placeholder {
                        <fm-skeleton height="280px" />
                    }
                } @else {
                    <fm-skeleton height="280px" />
                }
            </fm-card>
            <fm-card class="xl:col-span-2" subtitle="Average check-ins per hour, last 8 weeks" title="Busy hours">
                @if (data.hasValue()) {
                    @defer (on viewport) {
                        <fm-chart kind="heatmap" label="Average check-ins by weekday and hour" [height]="280" [series]="heatmapSeries()" />
                    } @placeholder {
                        <fm-skeleton height="280px" />
                    }
                } @else {
                    <fm-skeleton height="280px" />
                }
            </fm-card>
        </div>

        @if (data.hasValue()) {
            <div class="mt-4 grid gap-4" [class.xl:grid-cols-5]="hq">
                @if (hq) {
                    <fm-card class="xl:col-span-3" flush title="Branch comparison">
                        <div class="overflow-x-auto">
                            <table class="fm-table">
                                <caption class="fm-sr-only">Branches compared over the selected period</caption>
                                <thead>
                                    <tr>
                                        <th scope="col">Branch</th>
                                        <th class="fm-num" scope="col">Members</th>
                                        <th class="fm-num" scope="col">Revenue</th>
                                        <th class="fm-num" scope="col">Dues</th>
                                        <th class="fm-num" scope="col">Visits / day</th>
                                        <th class="fm-num" scope="col">Retention</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    @for (c of data.value().comparison; track c.branch.oid; let i = $index) {
                                        <tr>
                                            <th class="font-medium" scope="row">
                                                <a
                                                    class="flex items-center gap-2 text-fg no-underline hover:underline"
                                                    [routerLink]="['/console', c.branch.slug, 'dashboard']"
                                                >
                                                    <span class="size-2.5 rounded-full" [style.background]="'var(--fm-series-' + (i + 1) + ')'"></span>
                                                    {{ c.branch.name }}
                                                </a>
                                            </th>
                                            <td class="fm-num">{{ c.members }}</td>
                                            <td class="fm-num">{{ c.revenue | taka: 0 }}</td>
                                            <td class="fm-num">{{ c.dues | taka: 0 }}</td>
                                            <td class="fm-num">{{ c.avg_daily_visits }}</td>
                                            <td class="fm-num">{{ c.retention_pct }}%</td>
                                        </tr>
                                    }
                                </tbody>
                            </table>
                        </div>
                    </fm-card>
                }
                <fm-card flush subtitle="Suspended, over the dues limit, or expiring within 3 days" title="Needs attention" [class.xl:col-span-2]="hq">
                    @if (data.value().attention.length) {
                        <ul class="max-h-96 divide-y divide-border overflow-y-auto">
                            @for (a of data.value().attention; track a.member_oid + a.kind) {
                                <li>
                                    <a
                                        class="flex items-center gap-3 px-5 py-3 text-fg no-underline hover:bg-surface-sunken"
                                        [routerLink]="['/console', a.branch.slug, 'members', a.member_oid]"
                                    >
                                        <span class="min-w-0 flex-1">
                                            <span class="block truncate text-sm font-medium">{{ a.member_name }}</span>
                                            <span class="block truncate text-xs text-fg-subtle">
                                                {{ a.member_code }}{{ hq ? ' · ' + a.branch.name : '' }} · {{ a.detail }}
                                            </span>
                                        </span>
                                        <fm-badge [tone]="attention[a.kind].tone">{{ attention[a.kind].label }}</fm-badge>
                                    </a>
                                </li>
                            }
                        </ul>
                    } @else {
                        <fm-empty-state
                            description="No suspended members, dues over the limit or plans about to expire."
                            icon="badge-check"
                            title="All clear"
                        />
                    }
                </fm-card>
            </div>
        }
    `
})
export class DashboardPageComponent {
    private readonly _router = inject(Router);
    private readonly _route = inject(ActivatedRoute);
    private readonly _service = inject(DashboardService);
    private readonly _branch = inject(BranchContextService).active;

    protected readonly hq = (this._route.snapshot.data['scope'] as string) === 'hq';
    protected readonly ranges = RANGES;
    protected readonly icons = KPI_ICONS;
    protected readonly attention = ATTENTION;
    protected readonly today = todayIso();

    readonly range = input<RangeId>();
    readonly from = input<string>();
    readonly to = input<string>();

    protected readonly rangeId = computed<RangeId>(() => this.range() ?? '30d');
    protected readonly window = computed(() => {
        const today = this.today;
        switch (this.rangeId()) {
            case 'today':
                return { from: today, to: today };
            case 'month':
                return { from: format(startOfMonth(parseISO(today)), 'yyyy-MM-dd'), to: today };
            case 'custom':
                return { from: this.from() ?? format(addDays(parseISO(today), -29), 'yyyy-MM-dd'), to: this.to() ?? today };
            default:
                return { from: format(addDays(parseISO(today), -29), 'yyyy-MM-dd'), to: today };
        }
    });
    protected readonly longRange = computed(() => (parseISO(this.window().to).getTime() - parseISO(this.window().from).getTime()) / 86_400_000 > 62);
    protected readonly subtitle = computed(() => (this.hq ? 'All branches' : (this._branch()?.name ?? '')) + ` · ${this.window().from} to ${this.window().to}`);

    protected readonly data = rxResource({
        params: () => this.window(),
        stream: ({ params }) => (this.hq ? this._service.hq(params.from, params.to) : this._service.branch(params.from, params.to))
    });

    protected readonly trendCategories = computed(() => {
        const first = this.data.value()?.revenue_trend[0]?.points ?? [];
        return first.map(p => (this.longRange() ? p.x : format(parseISO(p.x), 'd MMM')));
    });
    protected readonly trendSeries = computed<ApexAxisChartSeries>(() =>
        (this.data.value()?.revenue_trend ?? []).map(s => ({ name: s.label, data: s.points.map(p => p.y) }))
    );
    /** Heatmap rows: Friday at the bottom, hours 6 am to 10 pm across. */
    protected readonly heatmapSeries = computed<ApexAxisChartSeries>(() =>
        [...(this.data.value()?.attendance_heatmap ?? [])].reverse().map(row => ({
            name: row.day,
            data: row.hours.map((y, h) => ({ x: `${((h + 6 + 11) % 12) + 1}${h + 6 < 12 ? 'a' : 'p'}`, y }))
        }))
    );

    protected setRange(id: RangeId): void {
        void this._router.navigate([], {
            relativeTo: this._route,
            queryParams: { range: id === '30d' ? null : id, from: null, to: null },
            queryParamsHandling: 'merge',
            replaceUrl: true
        });
    }

    protected setCustom(from: string | null, to: string | null): void {
        if (!from || !to) return;
        void this._router.navigate([], { relativeTo: this._route, queryParams: { range: 'custom', from, to }, queryParamsHandling: 'merge', replaceUrl: true });
    }
}
