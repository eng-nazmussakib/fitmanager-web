import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { format, parseISO } from 'date-fns';
import { filter, type Observable, switchMap } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import type { Measurement, MeasurementList, Routine, RoutineInput, Workout } from '@core/models/training.model';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { ConfirmService } from '@shared/ui/dialog/confirm.service';
import { DialogService } from '@shared/ui/dialog/dialog.service';
import { BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { MeasurementDialogComponent, type MeasurementDialogData } from './measurement-dialog.component';
import { ProgressPanelComponent } from './progress-panel.component';
import { type RoutineBuilderData, RoutineBuilderDialogComponent } from './routine-builder-dialog.component';
import { RoutineViewComponent } from './routine-view.component';
import { type TemplatePickerData, TemplatePickerDialogComponent } from './template-picker-dialog.component';
import { TrainingService } from './training.service';
import { WorkoutDialogComponent, type WorkoutDialogData } from './workout-dialog.component';
import { WorkoutListComponent } from './workout-list.component';

const ASSIGNED: Record<NonNullable<Routine['assigned_by']>, string> = {
    trainer: 'set by the trainer',
    staff: 'set by the branch',
    member: 'started by the member'
};

/**
 * The member profile's Training tab (phase 4): the running routine with the day to do next, earlier routines,
 * the workout log, personal records and charts, and body measurements. A trainer changes only their own clients'
 * (the API answers 403 otherwise, D-086).
 */
@Component({
    selector: 'app-member-training',
    imports: [
        ButtonComponent,
        BadgeComponent,
        CardComponent,
        SkeletonComponent,
        EmptyStateComponent,
        IconComponent,
        ProgressPanelComponent,
        RoutineViewComponent,
        WorkoutListComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="grid gap-4">
            <fm-card title="Routine" [subtitle]="routineNote()">
                @if (routine.value(); as r) {
                    @if (r.current; as c) {
                        <div class="mb-3 flex flex-wrap items-center gap-2">
                            <span class="text-lg font-semibold">{{ c.name }}</span>
                            @if (c.source_name) {
                                <fm-badge>from {{ c.source_name }}</fm-badge>
                            } @else {
                                <fm-badge tone="info">built for them</fm-badge>
                            }
                            <span class="flex-1"></span>
                            @if (can('create', 'Workout')) {
                                <button fmButton size="sm" variant="primary" (click)="log(c, null)">
                                    <fm-icon name="dumbbell" size="1rem" />
                                    Log {{ c.days[c.next_day ?? 0]?.name }}
                                </button>
                            }
                            @if (can('update', 'Routine')) {
                                <button fmButton size="sm" variant="secondary" (click)="editRoutine(c)">
                                    <fm-icon name="pencil" size="1rem" />
                                    Edit
                                </button>
                                <button fmButton size="sm" variant="ghost" (click)="end()">End</button>
                            }
                        </div>
                        <app-routine-view [routine]="c" />
                    } @else {
                        <fm-empty-state description="Assign a template, or build a routine for this member." icon="list-checks" title="No routine running" />
                    }
                    @if (can('create', 'Routine')) {
                        <div class="mt-3 flex flex-wrap gap-2">
                            <button fmButton size="sm" variant="secondary" (click)="assignTemplate()">
                                <fm-icon name="list-ordered" size="1rem" />
                                {{ r.current ? 'Replace with a template' : 'Assign a template' }}
                            </button>
                            <button fmButton size="sm" variant="ghost" (click)="build()">
                                <fm-icon name="plus" size="1rem" />
                                Build one for them
                            </button>
                        </div>
                    }
                    @if (r.history.length) {
                        <details class="mt-4 text-sm">
                            <summary class="cursor-pointer text-fg-muted">Earlier routines ({{ r.history.length }})</summary>
                            <ul class="mt-2 grid gap-1">
                                @for (h of r.history; track h.oid) {
                                    <li>
                                        <span class="font-medium">{{ h.name }}</span>
                                        <span class="text-fg-muted">
                                            : {{ date(h.started_on) }} to {{ date(h.ended_on) }}{{ h.trainer_name ? ', ' + h.trainer_name : '' }}
                                        </span>
                                    </li>
                                }
                            </ul>
                        </details>
                    }
                } @else {
                    <fm-skeleton height="8rem" />
                }
            </fm-card>

            <fm-card subtitle="Changes are open for 7 days after a workout's date" title="Workouts">
                @if (can('create', 'Workout')) {
                    <button class="mb-2" fmButton size="sm" variant="secondary" (click)="log(routine.value()?.current ?? null, null)">
                        <fm-icon name="plus" size="1rem" />
                        Log a workout
                    </button>
                }
                @if (workouts.value(); as list) {
                    <app-workout-list
                        [canEdit]="can('update', 'Workout')"
                        [workouts]="allWorkouts() ? list : list.slice(0, 10)"
                        (edit)="log(routine.value()?.current ?? null, $event)"
                        (remove)="removeWorkout($event)"
                    />
                    @if (list.length > 10 && !allWorkouts()) {
                        <button class="mt-2" fmButton size="sm" variant="ghost" (click)="allWorkouts.set(true)">Show all {{ list.length }}</button>
                    }
                } @else {
                    <fm-skeleton height="8rem" />
                }
            </fm-card>

            <app-progress-panel
                [canDelete]="can('update', 'Measurement')"
                [canRecord]="can('create', 'Measurement')"
                [measurements]="measurements.value()"
                [progress]="progress.value()"
                (record)="measure()"
                (remove)="removeMeasurement($event)"
            />
        </div>
    `
})
export class MemberTrainingComponent {
    readonly memberOid = input.required<string>();
    private readonly _service = inject(TrainingService);
    private readonly _dialog = inject(DialogService);
    private readonly _confirm = inject(ConfirmService);
    private readonly _auth = inject(AuthService);

    protected readonly routine = rxResource({ params: () => this.memberOid(), stream: ({ params }) => this._service.routine(params) });
    protected readonly workouts = rxResource({ params: () => this.memberOid(), stream: ({ params }) => this._service.workouts(params) });
    protected readonly progress = rxResource({ params: () => this.memberOid(), stream: ({ params }) => this._service.progress(params) });
    protected readonly measurements = rxResource({ params: () => this.memberOid(), stream: ({ params }) => this._service.measurements(params) });
    protected readonly allWorkouts = signal(false);
    private readonly _exercises = rxResource({ stream: () => this._service.exercises() });
    protected readonly routineNote = computed(() => {
        const c = this.routine.value()?.current;
        if (!c) return 'Days run in turn: the next one is the day after the last one logged';
        return `Since ${this.date(c.started_on)}, ${c.assigned_by ? ASSIGNED[c.assigned_by] : ''}${c.trainer_name ? ` · trainer ${c.trainer_name}` : ''}${c.last_workout_on ? ` · last workout ${this.date(c.last_workout_on)}` : ''}`;
    });

    protected can(action: 'create' | 'update', subject: 'Routine' | 'Workout' | 'Measurement'): boolean {
        return this._auth.can(action, subject);
    }

    protected date(iso: string | null): string {
        return iso ? format(parseISO(iso), 'd MMM yyyy') : '';
    }

    protected log(routine: Routine | null, workout: Workout | null): void {
        this._dialog
            .open<WorkoutDialogComponent, WorkoutDialogData, Workout>(WorkoutDialogComponent, {
                data: { who: this.memberOid(), routine, exercises: this._exercises.value() ?? [], ...(workout ? { workout } : {}) },
                size: 'lg'
            })
            .afterClosed.subscribe(saved => {
                if (saved) this._reloadTraining();
            });
    }

    protected removeWorkout(w: Workout): void {
        this._confirm
            .ask(`Delete the workout of ${this.date(w.performed_on)}? Its sets leave the records too.`, { danger: true })
            .pipe(switchMap(() => this._service.deleteWorkout(this.memberOid(), w.oid)))
            .subscribe(() => this._reloadTraining());
    }

    protected assignTemplate(): void {
        this._service
            .templates()
            .pipe(
                switchMap(
                    templates =>
                        this._dialog.open<TemplatePickerDialogComponent, TemplatePickerData, string>(TemplatePickerDialogComponent, {
                            data: {
                                title: 'Assign a template',
                                description: 'The member gets their own copy: later changes to the template do not change it.',
                                templates,
                                action: 'Assign'
                            },
                            size: 'lg'
                        }).afterClosed
                ),
                filter((oid): oid is string => !!oid),
                switchMap(oid => this._service.assign(this.memberOid(), { template_oid: oid }))
            )
            .subscribe(() => this.routine.reload());
    }

    protected build(): void {
        this._builder({ title: 'Build a routine for this member', exercises: this._exercises.value() ?? [] })
            .pipe(switchMap(input => this._service.assign(this.memberOid(), { routine: input })))
            .subscribe(() => this.routine.reload());
    }

    protected editRoutine(r: Routine): void {
        this._builder({ title: `Edit ${r.name}`, routine: r, exercises: this._exercises.value() ?? [] })
            .pipe(switchMap(input => this._service.updateRoutine(r.oid, input)))
            .subscribe(() => this.routine.reload());
    }

    protected end(): void {
        this._confirm
            .ask('End the running routine? It moves to the earlier routines.')
            .pipe(switchMap(() => this._service.endRoutine(this.memberOid())))
            .subscribe(() => this.routine.reload());
    }

    protected measure(): void {
        this._dialog
            .open<MeasurementDialogComponent, MeasurementDialogData, MeasurementList>(MeasurementDialogComponent, {
                data: { who: this.memberOid(), memberOid: this.memberOid(), height_cm: this.measurements.value()?.height_cm ?? null }
            })
            .afterClosed.subscribe(list => {
                if (list) this.measurements.set(list);
            });
    }

    protected removeMeasurement(m: Measurement): void {
        this._confirm
            .ask(`Delete the measurement of ${this.date(m.measured_on)}${m.photo_count ? ' and its photos' : ''}?`, { danger: true })
            .pipe(switchMap(() => this._service.deleteMeasurement(this.memberOid(), m.oid)))
            .subscribe(() => this.measurements.reload());
    }

    private _builder(data: RoutineBuilderData): Observable<RoutineInput> {
        return this._dialog
            .open<RoutineBuilderDialogComponent, RoutineBuilderData, RoutineInput>(RoutineBuilderDialogComponent, { data, size: 'lg' })
            .afterClosed.pipe(filter((v): v is RoutineInput => !!v));
    }

    private _reloadTraining(): void {
        this.routine.reload();
        this.workouts.reload();
        this.progress.reload();
    }
}
