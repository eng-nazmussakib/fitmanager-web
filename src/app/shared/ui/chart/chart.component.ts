import 'apexcharts/line';
import 'apexcharts/area';
import 'apexcharts/bar';
import 'apexcharts/heatmap';
import 'apexcharts/features/legend';

import { booleanAttribute, ChangeDetectionStrategy, Component, computed, DOCUMENT, inject, input } from '@angular/core';
import { ApexAxisChartSeries, ApexOptions, ChartCoreComponent } from 'ng-apexcharts';

import { ThemeService } from '@core/services/theme.service';

export type ChartKind = 'line' | 'area' | 'bar' | 'heatmap';

/**
 * `<fm-chart kind="line" [series]="…" [categories]="…" />`: ApexCharts themed from the design tokens (P1 chart
 * wrapper). Browser-only: put it inside `@defer (on viewport)` so the library never loads during prerendering
 * and only reaches the pages that chart something. Only the chart types imported above are bundled.
 *
 * Data-viz rules (dataviz skill): categorical series in a fixed order (`--fm-series-1…4`, one per branch, never
 * cycled), one y-axis, 2px lines, a legend for 2+ series, recessive grid, a hover tooltip; sequential heatmaps use
 * one hue light→dark. Colours are re-read when light/dark mode changes. Always pair a chart with the same numbers
 * as text or a table nearby (contrast relief for the lighter series).
 */
@Component({
    selector: 'fm-chart',
    imports: [ChartCoreComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'block', role: 'figure', '[attr.aria-label]': 'label()' },
    template: `
        @let o = options();
        <apx-chart-core
            [chart]="o.chart!"
            [colors]="o.colors!"
            [dataLabels]="o.dataLabels!"
            [fill]="o.fill!"
            [grid]="o.grid!"
            [legend]="o.legend!"
            [markers]="o.markers!"
            [plotOptions]="o.plotOptions!"
            [series]="o.series!"
            [stroke]="o.stroke!"
            [theme]="o.theme!"
            [tooltip]="o.tooltip!"
            [xaxis]="o.xaxis!"
            [yaxis]="o.yaxis!"
        />
    `
})
export class ChartComponent {
    private readonly _theme = inject(ThemeService).theme;
    private readonly _document = inject(DOCUMENT);

    readonly kind = input<ChartKind>('line');
    readonly series = input.required<ApexAxisChartSeries>();
    /** x categories (bar, line); heatmaps take x from the series data. */
    readonly categories = input<string[]>([]);
    readonly height = input(280);
    /** Accessible description of what the chart shows. */
    readonly label = input.required<string>();
    /** ৳ values: lakh-grouped axis and tooltip. */
    readonly money = input(false, { transform: booleanAttribute });
    readonly stacked = input(false, { transform: booleanAttribute });
    /** Use one series colour for every bar (single-series bar charts). */
    readonly colorSlot = input<1 | 2 | 3 | 4 | null>(null);

    protected readonly options = computed<ApexOptions>(() => {
        const mode = this._theme();
        const css = (name: string, fallback: string): string => {
            const value = this._document.defaultView?.getComputedStyle(this._document.documentElement).getPropertyValue(name).trim();
            // An unset custom property reads as '' (not null), so `||`: an empty value means "use the fallback".
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            return value || fallback;
        };
        const series = [1, 2, 3, 4].map(i => css(`--fm-series-${i}`, '#2a78d6'));
        const muted = css('--fm-fg-subtle', '#6b6b74');
        const border = css('--fm-border', '#e4e4e7');
        const fmt = (v: number): string => (this.money() ? `৳${Math.round(v).toLocaleString('en-IN')}` : Math.round(v * 10) / 10 + '');
        const kind = this.kind();
        const slot = this.colorSlot();
        return {
            chart: {
                type: kind,
                height: this.height(),
                stacked: this.stacked(),
                toolbar: { show: false },
                zoom: { enabled: false },
                background: 'transparent',
                fontFamily: 'inherit',
                foreColor: muted,
                animations: { enabled: false }
            },
            colors: kind === 'heatmap' ? [series[0]] : slot ? [series[slot - 1]] : series,
            series: this.series(),
            dataLabels: { enabled: false },
            stroke:
                kind === 'bar' || kind === 'heatmap'
                    ? { width: kind === 'heatmap' ? 2 : 0, colors: kind === 'heatmap' ? [css('--fm-surface', '#fff')] : undefined }
                    : { width: 2, curve: 'smooth' },
            fill: kind === 'area' ? { type: 'gradient', gradient: { opacityFrom: 0.28, opacityTo: 0.02 } } : { opacity: 1 },
            markers: { size: 0, hover: { size: 5 } },
            grid: { borderColor: border, strokeDashArray: 3, xaxis: { lines: { show: false } } },
            legend: { show: this.series().length > 1 && kind !== 'heatmap', position: 'top', horizontalAlign: 'left', fontSize: '13px' },
            plotOptions: {
                bar: { borderRadius: 4, borderRadiusApplication: 'end', columnWidth: '55%' },
                heatmap: { radius: 3, enableShades: true, shadeIntensity: 0.85, colorScale: { inverse: false } }
            },
            xaxis: {
                categories: this.categories(),
                // A label every few days on long series, never squeezed or trimmed to "…".
                tickAmount: kind === 'line' || kind === 'area' ? Math.min(8, Math.max(1, this.categories().length - 1)) : undefined,
                labels: { rotate: 0, hideOverlappingLabels: true },
                axisBorder: { show: false },
                axisTicks: { show: false },
                tooltip: { enabled: false }
            },
            yaxis: kind === 'heatmap' ? { labels: { style: { colors: muted } } } : { labels: { formatter: fmt }, min: 0, forceNiceScale: true },
            theme: { mode },
            tooltip: { theme: mode, shared: kind === 'line' || kind === 'area', intersect: false, y: { formatter: fmt } }
        };
    });
}
