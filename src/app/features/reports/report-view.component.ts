import { booleanAttribute, ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { ApexAxisChartSeries } from 'ng-apexcharts';

import type { ExportFormat, Report, ReportCell, ReportChart, ReportKpi, ReportTable, ReportUnit } from '@core/models/report.model';
import { ExportMenuComponent } from '@shared/components/export-menu/export-menu.component';
import { CanDirective } from '@shared/directives/can.directive';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { ChartComponent } from '@shared/ui/chart/chart.component';
import { CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';
import { IconComponent } from '@shared/ui/icon/icon.component';
import { TooltipDirective } from '@shared/ui/tooltip/tooltip.directive';

import { ReportsService } from './reports.service';

const lakh = (n: number, digits = 0): string => n.toLocaleString('en-IN', { maximumFractionDigits: digits });

/** A value as the screen shows it. Money in ৳ with lakh grouping, rates with one decimal. */
export function formatValue(v: ReportCell, unit: ReportUnit): string {
    if (v === null || v === '') return '–';
    if (typeof v === 'string') return v;
    switch (unit) {
        case 'money':
            return `৳${lakh(v)}`;
        case 'percent':
            return `${lakh(v, 1)}%`;
        case 'minutes':
            return `${lakh(v)} min`;
        default:
            return lakh(v, 1);
    }
}

/** The change from the previous period: a % for amounts and counts, points for rates and scores. */
export function change(k: ReportKpi): { text: string; up: boolean } | null {
    if (k.previous === null || k.value === null) return null;
    const diff = k.value - k.previous;
    if (k.unit === 'percent' || k.unit === 'number')
        return { text: `${diff >= 0 ? '+' : ''}${lakh(diff, 1)}${k.unit === 'percent' ? ' pts' : ''}`, up: diff >= 0 };
    if (k.previous === 0) return diff === 0 ? { text: 'no change', up: true } : null;
    const p = (100 * diff) / Math.abs(k.previous);
    return { text: `${p >= 0 ? '+' : ''}${lakh(p, 1)}%`, up: p >= 0 };
}

/**
 * One report, whatever its key: the KPI tiles (with the previous period and, at HQ, each branch), its
 * charts (ApexCharts, loaded in the browser) and its tables, each with Excel and PDF export. Every chart
 * has its numbers in a table nearby.
 */
@Component({
    selector: 'app-report-view',
    imports: [
        ExportMenuComponent,
        CanDirective,
        AppDatePipe,
        ChartComponent,
        CardComponent,
        SkeletonComponent,
        EmptyStateComponent,
        IconComponent,
        TooltipDirective
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @let r = report();
        <section
            class="grid grid-cols-2 gap-3 md:grid-cols-3"
            aria-label="Key figures"
            [class.xl:grid-cols-4]="r.kpis.length < 6"
            [class.xl:grid-cols-6]="r.kpis.length >= 6"
        >
            @for (k of r.kpis; track k.key) {
                <fm-card class="min-h-28">
                    <div class="flex items-start justify-between gap-2 text-sm text-fg-muted">
                        <span>{{ k.label }}</span>
                        @if (k.hint) {
                            <button class="cursor-help text-fg-subtle" type="button" [attr.aria-label]="k.hint" [fmTooltip]="k.hint">
                                <fm-icon name="circle-help" size="0.875rem" />
                            </button>
                        }
                    </div>
                    <p class="mt-2 text-2xl font-semibold tabular-nums">{{ format(k.value, k.unit) }}</p>
                    @if (change(k); as c) {
                        <p class="mt-1 flex items-center gap-1 text-xs text-fg-subtle">
                            <fm-icon size="0.875rem" [name]="c.up ? 'trending-up' : 'trending-down'" />
                            {{ c.text }} vs {{ format(k.previous, k.unit) }} before
                        </p>
                    }
                    @if (r.branches.length > 1) {
                        <details class="mt-2 text-xs">
                            <summary class="cursor-pointer text-fg-subtle hover:text-fg">By branch</summary>
                            <ul class="mt-1.5 flex flex-col gap-1">
                                @for (b of r.branches; track b.oid; let i = $index) {
                                    <li class="flex justify-between gap-2">
                                        <span class="flex items-center gap-1.5">
                                            <span class="size-2 rounded-full" [style.background]="'var(--fm-series-' + (i + 1) + ')'"></span>
                                            {{ b.name }}
                                        </span>
                                        <span class="tabular-nums">{{ format(k.by_branch[b.code] ?? null, k.unit) }}</span>
                                    </li>
                                }
                            </ul>
                        </details>
                    }
                </fm-card>
            }
        </section>

        @for (note of r.notes; track note) {
            <p class="mt-3 text-sm text-fg-muted">{{ note }}</p>
        }

        @if (r.charts.length) {
            <div class="mt-4 grid gap-4" [class.xl:grid-cols-2]="r.charts.length > 1">
                @for (ch of r.charts; track ch.key) {
                    <fm-card [title]="ch.title">
                        @if (empty(ch)) {
                            <p class="py-10 text-center text-sm text-fg-subtle">Nothing in this period.</p>
                        } @else {
                            @defer (on viewport) {
                                <fm-chart
                                    [categories]="ch.kind === 'heatmap' ? [] : ch.categories"
                                    [height]="ch.kind === 'heatmap' ? 300 : 280"
                                    [kind]="ch.kind"
                                    [label]="ch.title"
                                    [money]="ch.unit === 'money'"
                                    [series]="seriesOf(ch)"
                                />
                            } @placeholder {
                                <fm-skeleton height="280px" />
                            }
                        }
                    </fm-card>
                }
            </div>
        }

        @for (t of r.tables; track t.key) {
            <fm-card class="mt-4 block" flush>
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
                    <div class="min-w-0">
                        <h2 class="text-base font-semibold">{{ t.title }}</h2>
                        @if (t.note) {
                            <p class="text-xs text-fg-subtle">{{ t.note }}</p>
                        }
                    </div>
                    @if (exportable() && t.rows.length) {
                        <app-export-menu
                            *appCan="'export'; on: 'Report'"
                            size="sm"
                            [busy]="busy() === t.key"
                            [label]="'Export ' + t.title"
                            (export)="exportTable(t, $event)"
                        />
                    }
                </div>
                @if (t.rows.length) {
                    <div class="overflow-x-auto">
                        <table class="fm-table">
                            <caption class="fm-sr-only">{{ r.title }}: {{ t.title }}</caption>
                            <thead>
                                <tr>
                                    @for (c of t.columns; track c.key) {
                                        <th scope="col" [class.fm-num]="numeric(c.unit)">{{ c.label }}</th>
                                    }
                                </tr>
                            </thead>
                            <tbody>
                                @for (row of t.rows; track $index) {
                                    <tr>
                                        @for (c of t.columns; track c.key; let first = $first) {
                                            @if (first) {
                                                <th class="text-start font-medium" scope="row">{{ cell(row[c.key] ?? null, c.unit) }}</th>
                                            } @else if (c.unit === 'date') {
                                                <td>{{ row[c.key] ? (row[c.key] | appDate) : '–' }}</td>
                                            } @else {
                                                <td [class.fm-num]="numeric(c.unit)">{{ cell(row[c.key] ?? null, c.unit) }}</td>
                                            }
                                        }
                                    </tr>
                                }
                            </tbody>
                            @if (t.total; as total) {
                                <tfoot>
                                    <tr class="font-semibold">
                                        @for (c of t.columns; track c.key; let first = $first) {
                                            @if (first) {
                                                <th class="text-start" scope="row">{{ total[c.key] ?? 'Total' }}</th>
                                            } @else {
                                                <td [class.fm-num]="numeric(c.unit)">{{ cell(total[c.key] ?? null, c.unit) }}</td>
                                            }
                                        }
                                    </tr>
                                </tfoot>
                            }
                        </table>
                    </div>
                } @else {
                    <fm-empty-state description="Try a longer period." icon="inbox" title="Nothing in this period" />
                }
            </fm-card>
        }
    `
})
export class ReportViewComponent {
    private readonly _reports = inject(ReportsService);

    readonly report = input.required<Report>();
    /** Show the export menus (the trainer's own numbers do not). */
    readonly exportable = input(true, { transform: booleanAttribute });
    /** HQ: the one branch picked, for the export's audit row. */
    readonly branchOid = input<string | null>(null);

    protected readonly busy = signal<string | null>(null);
    protected readonly format = formatValue;
    protected readonly change = change;

    protected readonly palette = computed(() => this.report().branches.length);

    protected numeric(unit: ReportUnit): boolean {
        return unit !== 'text' && unit !== 'date';
    }

    protected cell(v: ReportCell, unit: ReportUnit): string {
        return formatValue(v, unit);
    }

    protected empty(ch: ReportChart): boolean {
        return ch.series.every(s => s.data.every(v => !v));
    }

    /** ApexCharts' series: a heatmap's cells carry their own x. */
    protected seriesOf(ch: ReportChart): ApexAxisChartSeries {
        if (ch.kind === 'heatmap')
            return [...ch.series].reverse().map(s => ({ name: s.name, data: s.data.map((y, i) => ({ x: ch.categories[i] ?? '', y: y ?? 0 })) }));
        return ch.series.map(s => ({ name: s.name, data: s.data }));
    }

    protected async exportTable(t: ReportTable, format: ExportFormat): Promise<void> {
        this.busy.set(t.key);
        try {
            await this._reports.exportTable(this.report(), t, format, this.branchOid());
        } finally {
            this.busy.set(null);
        }
    }
}
