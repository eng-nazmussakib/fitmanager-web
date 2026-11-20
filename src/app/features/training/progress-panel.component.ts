import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { format, parseISO } from 'date-fns';
import type { ApexAxisChartSeries } from 'ng-apexcharts';

import {
    type Measurement,
    MEASUREMENT_FIELDS,
    type MeasurementField,
    type MeasurementList,
    recordText,
    SERIES_UNIT,
    type TrainingProgress
} from '@core/models/training.model';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { ChartComponent } from '@shared/ui/chart/chart.component';
import { BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

const SOURCE: Record<Measurement['source'], string> = { member: 'Member', trainer: 'Trainer', desk: 'Desk' };
const day = (iso: string): string => format(parseISO(iso), 'd MMM');

/**
 * A member's progress (D-088, D-089), in the console and the portal: totals, workouts a week, personal records, a
 * chart per exercise, and the body measurements with their chart and photos. Everything comes computed from the API.
 */
@Component({
    selector: 'app-progress-panel',
    imports: [
        FormsModule,
        ButtonComponent,
        ChartComponent,
        BadgeComponent,
        CardComponent,
        SkeletonComponent,
        EmptyStateComponent,
        SelectComponent,
        IconComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="grid gap-4">
            @if (progress(); as p) {
                <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    @for (t of tiles(); track t.label) {
                        <div class="rounded-lg border border-border bg-surface p-3">
                            <p class="text-xs text-fg-muted">{{ t.label }}</p>
                            <p class="mt-1 text-xl font-semibold tabular-nums">{{ t.value }}</p>
                        </div>
                    }
                </div>
                <div class="grid gap-4 lg:grid-cols-2">
                    <fm-card subtitle="The last 12 weeks, Saturday to Friday" title="Workouts a week">
                        @defer (on viewport) {
                            <fm-chart kind="bar" label="Workouts a week" [categories]="weekLabels()" [height]="220" [series]="weekSeries()" />
                        } @placeholder {
                            <fm-skeleton height="220px" />
                        }
                    </fm-card>
                    <fm-card subtitle="The best set on each day" title="Exercise progress">
                        @if (p.series.length) {
                            <fm-select
                                class="mb-2 block"
                                ariaLabel="Exercise"
                                [ngModel]="series()?.exercise_oid ?? null"
                                [options]="seriesOptions()"
                                (ngModelChange)="seriesPick.set($event)"
                            />
                            @if (series(); as s) {
                                @defer (on viewport) {
                                    <fm-chart kind="line" [categories]="seriesDates()" [height]="200" [label]="s.name + ' progress'" [series]="seriesData()" />
                                } @placeholder {
                                    <fm-skeleton height="200px" />
                                }
                                <p class="text-xs text-fg-subtle">{{ unit(s.measure) }}</p>
                            }
                        } @else {
                            <fm-empty-state
                                description="A chart appears once an exercise is logged on two days."
                                icon="chart-line"
                                title="Not enough workouts yet"
                            />
                        }
                    </fm-card>
                </div>
                <fm-card flush subtitle="The best set of each exercise, from every workout logged" title="Personal records">
                    @if (p.records.length) {
                        <div class="overflow-x-auto">
                            <table class="fm-table">
                                <caption class="fm-sr-only">Personal records</caption>
                                <thead>
                                    <tr>
                                        <th scope="col">Exercise</th>
                                        <th scope="col">Best</th>
                                        <th class="text-right" scope="col">Est. 1-rep max</th>
                                        <th class="hidden sm:table-cell" scope="col">On</th>
                                        <th class="hidden text-right sm:table-cell" scope="col">Days done</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    @for (r of p.records; track r.exercise_oid) {
                                        <tr>
                                            <td class="font-medium">
                                                <span class="flex items-center gap-1.5">
                                                    <fm-icon class="text-amber-500" name="trophy" size="0.9rem" />
                                                    {{ r.name }}
                                                </span>
                                            </td>
                                            <td class="tabular-nums">{{ best(r) }}</td>
                                            <td class="text-right tabular-nums">{{ r.best_e1rm_kg !== null ? r.best_e1rm_kg + ' kg' : '' }}</td>
                                            <td class="hidden sm:table-cell">{{ short(r.best_on) }}</td>
                                            <td class="hidden text-right tabular-nums sm:table-cell">{{ r.days }}</td>
                                        </tr>
                                    }
                                </tbody>
                            </table>
                        </div>
                    } @else {
                        <fm-empty-state description="Records appear with the first logged workout." icon="trophy" title="No records yet" />
                    }
                </fm-card>
            } @else {
                <fm-skeleton height="12rem" />
            }

            <fm-card title="Body measurements" [subtitle]="heightNote()">
                @if (canRecord()) {
                    <button class="mb-3" fmButton size="sm" variant="secondary" (click)="record.emit()">
                        <fm-icon name="ruler" size="1rem" />
                        Record a measurement
                    </button>
                }
                @if (measurements(); as list) {
                    @if (list.rows.length) {
                        @if (list.rows.length > 1) {
                            <fm-select class="mb-2 block max-w-56" ariaLabel="Measurement" [options]="fieldOptions" [(ngModel)]="fieldPick" />
                            @defer (on viewport) {
                                <fm-chart
                                    kind="line"
                                    [categories]="fieldDates()"
                                    [height]="200"
                                    [label]="fieldLabel() + ' over time'"
                                    [series]="fieldSeries()"
                                />
                            } @placeholder {
                                <fm-skeleton height="200px" />
                            }
                        }
                        <ul class="mt-3 divide-y divide-border">
                            @for (m of list.rows; track m.oid) {
                                <li class="flex flex-wrap items-start gap-3 py-3">
                                    <div class="min-w-28">
                                        <p class="font-medium">{{ long(m.measured_on) }}</p>
                                        <p class="text-xs text-fg-subtle">
                                            {{ sourceLabel[m.source] }}{{ m.recorded_by_name ? ' · ' + m.recorded_by_name : '' }}
                                        </p>
                                    </div>
                                    <dl class="flex flex-1 flex-wrap gap-x-4 gap-y-1 text-sm">
                                        @for (f of fields; track f.key) {
                                            @if (m[f.key] !== null) {
                                                <div>
                                                    <dt class="inline text-fg-muted">{{ f.label }}</dt>
                                                    <dd class="ml-1 inline tabular-nums">{{ m[f.key] }} {{ f.unit }}</dd>
                                                </div>
                                            }
                                        }
                                        @if (m.bmi !== null) {
                                            <div>
                                                <dt class="inline text-fg-muted">BMI</dt>
                                                <dd class="ml-1 inline tabular-nums">{{ m.bmi }}</dd>
                                            </div>
                                        }
                                    </dl>
                                    @if (m.photo_count) {
                                        <div class="flex gap-1.5">
                                            @if (m.photos_hidden) {
                                                <fm-badge>{{ m.photo_count }} photo{{ m.photo_count > 1 ? 's' : '' }}, for their own trainer</fm-badge>
                                            } @else {
                                                @for (v of views; track v) {
                                                    @if (m.photos[v]; as src) {
                                                        <a
                                                            class="block overflow-hidden rounded-md border border-border"
                                                            rel="noopener"
                                                            target="_blank"
                                                            [href]="src"
                                                        >
                                                            <img
                                                                class="h-16 w-12 object-cover"
                                                                height="64"
                                                                loading="lazy"
                                                                width="48"
                                                                [alt]="v + ' photo, ' + long(m.measured_on)"
                                                                [src]="src"
                                                            />
                                                        </a>
                                                    }
                                                }
                                            }
                                        </div>
                                    }
                                    @if (m.deletable && canDelete()) {
                                        <button aria-label="Delete measurement" fmButton size="sm" variant="ghost" (click)="remove.emit(m)">
                                            <fm-icon name="trash-2" size="1rem" />
                                        </button>
                                    }
                                    @if (m.notes) {
                                        <p class="basis-full text-sm text-fg-muted">{{ m.notes }}</p>
                                    }
                                </li>
                            }
                        </ul>
                    } @else {
                        <fm-empty-state description="Weight, body fat and tape measurements, with progress photos." icon="ruler" title="No measurements yet" />
                    }
                } @else {
                    <fm-skeleton height="8rem" />
                }
            </fm-card>
        </div>
    `
})
export class ProgressPanelComponent {
    readonly progress = input<TrainingProgress | undefined>();
    readonly measurements = input<MeasurementList | undefined>();
    readonly canRecord = input(false);
    readonly canDelete = input(false);
    readonly record = output();
    readonly remove = output<Measurement>();

    protected readonly fields = MEASUREMENT_FIELDS;
    protected readonly views = ['front', 'side', 'back'] as const;
    protected readonly sourceLabel = SOURCE;
    protected readonly fieldOptions: SelectOption<MeasurementField>[] = MEASUREMENT_FIELDS.map(f => ({ value: f.key, label: `${f.label} (${f.unit})` }));
    protected readonly fieldPick = signal<MeasurementField>('weight_kg');
    protected readonly seriesPick = signal<string | null>(null);

    protected readonly tiles = computed(() => {
        const p = this.progress();
        if (!p) return [];
        return [
            { label: 'Workouts', value: String(p.totals.workouts) },
            { label: 'This month', value: String(p.totals.this_month) },
            { label: 'Records', value: String(p.records.length) },
            { label: 'Lifted in total', value: `${Math.round(p.totals.volume_kg / 100) / 10} t` }
        ];
    });
    protected readonly weekLabels = computed(() => (this.progress()?.weekly ?? []).map(w => day(w.week)));
    protected readonly weekSeries = computed<ApexAxisChartSeries>(() => [{ name: 'Workouts', data: (this.progress()?.weekly ?? []).map(w => w.workouts) }]);
    protected readonly seriesOptions = computed<SelectOption<string>[]>(() =>
        (this.progress()?.series ?? []).map(s => ({ value: s.exercise_oid, label: s.name }))
    );
    protected readonly series = computed(() => {
        const list = this.progress()?.series ?? [];
        return list.find(s => s.exercise_oid === this.seriesPick()) ?? list[0];
    });
    protected readonly seriesDates = computed(() => (this.series()?.points ?? []).map(p => day(p.date)));
    protected readonly seriesData = computed<ApexAxisChartSeries>(() => [
        { name: this.series()?.name ?? '', data: (this.series()?.points ?? []).map(p => p.value) }
    ]);

    private readonly _withField = computed(() => [...(this.measurements()?.rows ?? [])].reverse().filter(m => m[this.fieldPick()] !== null));
    protected readonly fieldLabel = computed(() => MEASUREMENT_FIELDS.find(f => f.key === this.fieldPick())?.label ?? '');
    protected readonly fieldDates = computed(() => this._withField().map(m => day(m.measured_on)));
    protected readonly fieldSeries = computed<ApexAxisChartSeries>(() => [
        { name: this.fieldLabel(), data: this._withField().map(m => m[this.fieldPick()] ?? 0) }
    ]);
    protected readonly heightNote = computed(() => {
        const h = this.measurements()?.height_cm;
        return h ? `Height ${h} cm, for the BMI` : 'Add the height once for the BMI';
    });

    protected best = recordText;

    protected unit(measure: keyof typeof SERIES_UNIT): string {
        return SERIES_UNIT[measure];
    }

    protected short(iso: string): string {
        return day(iso);
    }

    protected long(iso: string): string {
        return format(parseISO(iso), 'd MMM yyyy');
    }
}
