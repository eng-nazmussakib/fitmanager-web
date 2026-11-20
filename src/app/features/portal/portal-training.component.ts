import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { format, parseISO } from 'date-fns';
import { filter, switchMap } from 'rxjs';

import { type Measurement, type MeasurementList, type Routine, targetText, type Workout } from '@core/models/training.model';
import { MeasurementDialogComponent, type MeasurementDialogData } from '@features/training/measurement-dialog.component';
import { ProgressPanelComponent } from '@features/training/progress-panel.component';
import { RoutineViewComponent } from '@features/training/routine-view.component';
import { type TemplatePickerData, TemplatePickerDialogComponent } from '@features/training/template-picker-dialog.component';
import { ME, TrainingService } from '@features/training/training.service';
import { WorkoutDialogComponent, type WorkoutDialogData } from '@features/training/workout-dialog.component';
import { WorkoutListComponent } from '@features/training/workout-list.component';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { ConfirmService } from '@shared/ui/dialog/confirm.service';
import { DialogService } from '@shared/ui/dialog/dialog.service';
import { CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

const day = (iso: string | null): string => (iso ? format(parseISO(iso), 'EEE d MMM') : '');

/**
 * `/me/routine` (D-087, D-088): the member's running routine with the day to do next, "Log this workout" (the day's
 * targets filled in), their recent workouts (changes open for 7 days) and, with no routine, an HQ template to start.
 */
@Component({
    selector: 'app-portal-routine',
    imports: [ButtonComponent, CardComponent, SkeletonComponent, EmptyStateComponent, IconComponent, RoutineViewComponent, WorkoutListComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <h1 class="mb-4 text-xl font-semibold">Routine</h1>
        @if (routine.value(); as r) {
            @if (r.current; as c) {
                @let next = c.days[c.next_day ?? 0];
                <fm-card [subtitle]="note(c)" [title]="'Next: ' + next.name">
                    <ol class="flex flex-col divide-y divide-border">
                        @for (x of next.exercises; track $index; let i = $index) {
                            <li class="flex gap-3 py-3">
                                <span class="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
                                    {{ i + 1 }}
                                </span>
                                <span class="min-w-0 flex-1">
                                    <span class="block font-medium">{{ x.name }}</span>
                                    <span class="block text-sm text-fg-muted">{{ target(x) }} · rest {{ x.rest_seconds }} s</span>
                                    @if (x.notes) {
                                        <span class="block text-xs text-fg-subtle">{{ x.notes }}</span>
                                    }
                                </span>
                            </li>
                        }
                    </ol>
                    <footer class="mt-4">
                        <button block fmButton size="lg" variant="primary" (click)="log(c, null)">
                            <fm-icon name="dumbbell" />
                            Log this workout
                        </button>
                    </footer>
                </fm-card>
                <fm-card class="mt-4 block" [title]="c.name">
                    <app-routine-view [routine]="c" />
                    <div class="mt-3 flex flex-wrap gap-2">
                        <button fmButton size="sm" variant="secondary" (click)="log(c, null, true)">
                            <fm-icon name="plus" size="1rem" />
                            Log another day or a free session
                        </button>
                        @if (c.assigned_by === 'member') {
                            <button fmButton size="sm" variant="ghost" (click)="end()">End this routine</button>
                        }
                    </div>
                </fm-card>
            } @else {
                <fm-card>
                    <fm-empty-state description="Ask your trainer for a routine, or start one of ours yourself." icon="dumbbell" title="No routine yet" />
                    <button class="mt-2" block fmButton variant="primary" (click)="start()">
                        <fm-icon name="list-ordered" />
                        Choose a routine
                    </button>
                </fm-card>
            }
            <fm-card class="mt-4 block" subtitle="You can change a workout for 7 days" title="Your workouts">
                @if (!r.current) {
                    <button class="mb-2" fmButton size="sm" variant="secondary" (click)="log(null, null)">
                        <fm-icon name="plus" size="1rem" />
                        Log a free session
                    </button>
                }
                @if (workouts.value(); as list) {
                    <app-workout-list [canEdit]="true" [workouts]="list" (edit)="log(r.current, $event)" (remove)="remove($event)" />
                } @else {
                    <fm-skeleton height="6rem" />
                }
            </fm-card>
            @if (r.history.length) {
                <p class="mt-4 text-sm text-fg-muted">
                    Earlier:
                    @for (h of r.history; track h.oid; let last = $last) {
                        {{ h.name }} ({{ date(h.started_on) }} to {{ date(h.ended_on) }}){{ last ? '' : ', ' }}
                    }
                </p>
            }
        } @else {
            <fm-skeleton height="20rem" />
        }
    `
})
export class PortalRoutineComponent {
    private readonly _service = inject(TrainingService);
    private readonly _dialog = inject(DialogService);
    private readonly _confirm = inject(ConfirmService);
    protected readonly routine = rxResource({ stream: () => this._service.routine(ME) });
    protected readonly workouts = rxResource({ stream: () => this._service.workouts(ME, 10) });
    private readonly _exercises = rxResource({ stream: () => this._service.exercises({ portal: true }) });

    protected readonly target = targetText;

    protected note(c: Routine): string {
        const who = c.assigned_by === 'member' ? 'Started by you' : c.trainer_name ? `From ${c.trainer_name}` : 'From the gym';
        return `${who} · ${c.name}${c.last_workout_on ? ` · last workout ${day(c.last_workout_on)}` : ''}`;
    }

    protected date(iso: string | null): string {
        return iso ? format(parseISO(iso), 'd MMM') : '';
    }

    /** `pickDay`: open on a free session instead of the next day. */
    protected log(routine: Routine | null, workout: Workout | null, pickDay = false): void {
        const data: WorkoutDialogData = {
            who: ME,
            routine: routine && pickDay ? { ...routine, next_day: null } : routine,
            exercises: this._exercises.value() ?? [],
            ...(workout ? { workout } : {})
        };
        this._dialog.open<WorkoutDialogComponent, WorkoutDialogData, Workout>(WorkoutDialogComponent, { data, size: 'lg' }).afterClosed.subscribe(saved => {
            if (saved) {
                this.routine.reload();
                this.workouts.reload();
            }
        });
    }

    protected remove(w: Workout): void {
        this._confirm
            .ask(`Delete your workout of ${day(w.performed_on)}?`, { danger: true })
            .pipe(switchMap(() => this._service.deleteWorkout(ME, w.oid)))
            .subscribe(() => {
                this.routine.reload();
                this.workouts.reload();
            });
    }

    protected start(): void {
        this._service
            .portalTemplates()
            .pipe(
                switchMap(
                    templates =>
                        this._dialog.open<TemplatePickerDialogComponent, TemplatePickerData, string>(TemplatePickerDialogComponent, {
                            data: {
                                title: 'Choose a routine',
                                description: 'Our coaches built these. Your trainer can change it for you later.',
                                templates,
                                action: 'Start'
                            },
                            size: 'lg'
                        }).afterClosed
                ),
                filter((oid): oid is string => !!oid),
                switchMap(oid => this._service.start(oid))
            )
            .subscribe(r => this.routine.set(r));
    }

    protected end(): void {
        this._confirm
            .ask('End this routine? Your workouts and records stay.')
            .pipe(switchMap(() => this._service.endRoutine(ME)))
            .subscribe(r => this.routine.set(r));
    }
}

/** `/me/progress` (D-088, D-089): records, charts, and body measurements with the member's own progress photos. */
@Component({
    selector: 'app-portal-progress',
    imports: [ProgressPanelComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <h1 class="mb-4 text-xl font-semibold">Progress</h1>
        <app-progress-panel
            [canDelete]="true"
            [canRecord]="true"
            [measurements]="measurements.value()"
            [progress]="progress.value()"
            (record)="measure()"
            (remove)="remove($event)"
        />
    `
})
export class PortalProgressComponent {
    private readonly _service = inject(TrainingService);
    private readonly _dialog = inject(DialogService);
    private readonly _confirm = inject(ConfirmService);
    protected readonly progress = rxResource({ stream: () => this._service.progress(ME) });
    protected readonly measurements = rxResource({ stream: () => this._service.measurements(ME) });
    protected readonly height = computed(() => this.measurements.value()?.height_cm ?? null);

    protected measure(): void {
        this._dialog
            .open<MeasurementDialogComponent, MeasurementDialogData, MeasurementList>(MeasurementDialogComponent, {
                data: { who: ME, memberOid: null, height_cm: this.height() }
            })
            .afterClosed.subscribe(list => {
                if (list) this.measurements.set(list);
            });
    }

    protected remove(m: Measurement): void {
        this._confirm
            .ask(`Delete your measurement of ${day(m.measured_on)}${m.photo_count ? ' and its photos' : ''}?`, { danger: true })
            .pipe(switchMap(() => this._service.deleteMeasurement(ME, m.oid)))
            .subscribe(() => this.measurements.reload());
    }
}
