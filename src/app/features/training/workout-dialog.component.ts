import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { addDays, format, parseISO } from 'date-fns';

import { EQUIPMENT_LABEL, type Exercise, type Measure, type Routine, type Workout, type WorkoutInput, type WorkoutSet } from '@core/models/training.model';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DIALOG_DATA, DialogRef } from '@shared/ui/dialog/dialog-ref';
import { DialogFooterDirective, DialogShellComponent } from '@shared/ui/dialog/dialog-shell.component';
import { AlertComponent } from '@shared/ui/display/display';
import { DatePickerComponent, todayIso } from '@shared/ui/forms/date-picker.component';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { NumberInputComponent } from '@shared/ui/forms/number-input.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { TrainingService, type Who } from './training.service';

export interface WorkoutDialogData {
    who: Who;
    /** The member's running routine, if any: its days can be picked, and the next one is suggested. */
    routine: Routine | null;
    /** Editing a workout (within its 7 days). */
    workout?: Workout;
    exercises: Exercise[];
}

interface Row {
    exercise_oid: string;
    name: string;
    measure: Measure;
    sets: WorkoutSet[];
}

const EDIT_DAYS = 7;
const NO_DAY = -1;

/**
 * Logs a workout or edits one (D-088): the day of the running routine (its exercises and targets filled in, to change
 * to what was done) or a free session, the sets as the measure takes them, the date (up to 7 days back), length and notes.
 */
@Component({
    selector: 'app-workout-dialog',
    imports: [
        FormsModule,
        ButtonComponent,
        DialogShellComponent,
        DialogFooterDirective,
        AlertComponent,
        DatePickerComponent,
        FieldComponent,
        InputDirective,
        NumberInputComponent,
        SelectComponent,
        IconComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <fm-dialog-shell
            [description]="data.routine ? 'The targets are filled in: change them to what was done.' : 'Add the exercises and sets that were done.'"
            [title]="data.workout ? 'Edit the workout' : 'Log a workout'"
        >
            <div class="grid gap-4">
                <div class="grid gap-3 sm:grid-cols-3">
                    @if (dayOptions().length > 1) {
                        <fm-field label="Routine day">
                            <fm-select ariaLabel="Routine day" [ngModel]="day()" [options]="dayOptions()" (ngModelChange)="chooseDay($event)" />
                        </fm-field>
                    }
                    <fm-field label="Date" required>
                        <fm-date-picker [max]="today" [min]="earliest" [(ngModel)]="performedOn" />
                    </fm-field>
                    <fm-field label="Minutes"><fm-number-input [max]="600" [min]="1" [(ngModel)]="minutes" /></fm-field>
                </div>

                @for (row of rows(); track $index; let r = $index) {
                    <section class="rounded-lg border border-border p-3">
                        <div class="mb-2 flex items-center gap-2">
                            <span class="min-w-0 flex-1 truncate font-medium">{{ row.name }}</span>
                            <button aria-label="Remove exercise" fmButton size="sm" variant="ghost" (click)="removeRow(r)">
                                <fm-icon name="x" size="1rem" />
                            </button>
                        </div>
                        <ol class="grid gap-1.5">
                            @for (s of row.sets; track $index; let i = $index) {
                                <li class="grid grid-cols-[2rem_1fr_1fr_auto] items-center gap-2">
                                    <span class="text-sm text-fg-subtle tabular-nums">{{ i + 1 }}</span>
                                    @switch (row.measure) {
                                        @case ('weight_reps') {
                                            <fm-number-input placeholder="kg" [max]="1000" [min]="0" [(ngModel)]="s.weight_kg" />
                                            <fm-number-input placeholder="reps" [max]="500" [min]="1" [(ngModel)]="s.reps" />
                                        }
                                        @case ('reps') {
                                            <fm-number-input placeholder="reps" [max]="500" [min]="1" [(ngModel)]="s.reps" />
                                            <span></span>
                                        }
                                        @case ('time') {
                                            <fm-number-input placeholder="seconds" [max]="36000" [min]="1" [(ngModel)]="s.seconds" />
                                            <span></span>
                                        }
                                        @default {
                                            <fm-number-input placeholder="metres" [max]="200000" [min]="1" [(ngModel)]="s.distance_m" />
                                            <fm-number-input placeholder="seconds" [max]="36000" [min]="1" [(ngModel)]="s.seconds" />
                                        }
                                    }
                                    <button
                                        aria-label="Remove set"
                                        fmButton
                                        size="sm"
                                        variant="ghost"
                                        [disabled]="row.sets.length === 1"
                                        (click)="row.sets.splice(i, 1)"
                                    >
                                        <fm-icon name="minus" size="1rem" />
                                    </button>
                                </li>
                            }
                        </ol>
                        <button class="mt-2" fmButton size="sm" variant="ghost" [disabled]="row.sets.length >= 20" (click)="addSet(row)">
                            <fm-icon name="plus" size="1rem" />
                            Add a set
                        </button>
                    </section>
                }
                <div class="flex items-end gap-2">
                    <fm-field class="flex-1" label="Add an exercise">
                        <fm-select
                            ariaLabel="Add an exercise"
                            placeholder="Choose from the library"
                            [ngModel]="null"
                            [options]="exerciseOptions"
                            (ngModelChange)="addRow($event)"
                        />
                    </fm-field>
                </div>
                <fm-field label="Notes"><textarea fmInput maxlength="1000" rows="2" [(ngModel)]="notes"></textarea></fm-field>
                @if (problem()) {
                    <fm-alert tone="danger">{{ problem() }}</fm-alert>
                }
            </div>
            <ng-container fmDialogFooter>
                <button fmButton (click)="ref.close()">Cancel</button>
                <button fmButton variant="primary" [loading]="saving()" (click)="save()">{{ data.workout ? 'Save' : 'Log workout' }}</button>
            </ng-container>
        </fm-dialog-shell>
    `
})
export class WorkoutDialogComponent {
    protected readonly data = inject<WorkoutDialogData>(DIALOG_DATA);
    protected readonly ref = inject<DialogRef<Workout>>(DialogRef);
    private readonly _service = inject(TrainingService);
    protected readonly today = todayIso();
    protected readonly earliest = format(addDays(parseISO(this.today), -EDIT_DAYS), 'yyyy-MM-dd');
    private readonly _w = this.data.workout;
    protected performedOn: string | null = this._w?.performed_on ?? this.today;
    protected minutes: number | null = this._w?.minutes ?? null;
    protected notes = this._w?.notes ?? '';
    protected readonly saving = signal(false);
    protected readonly problem = signal<string | null>(null);
    private readonly _byOid = new Map(this.data.exercises.map(e => [e.oid, e]));
    protected readonly exerciseOptions: SelectOption<string>[] = this.data.exercises
        .filter(e => e.active)
        .map(e => ({ value: e.oid, label: e.name, description: EQUIPMENT_LABEL[e.equipment] }));
    protected readonly day = signal<number>(this._w ? (this._w.day_index ?? NO_DAY) : (this.data.routine?.next_day ?? NO_DAY));
    protected readonly dayOptions = computed<SelectOption<number>[]>(() => [
        { value: NO_DAY, label: 'A free session' },
        ...(this.data.routine?.days.map((d, i) => ({
            value: i,
            label: d.name,
            description: i === this.data.routine?.next_day ? 'Next in the routine' : undefined
        })) ?? [])
    ]);
    protected readonly rows = signal<Row[]>(this._w ? this._w.exercises.map(x => ({ ...x, sets: x.sets.map(s => ({ ...s })) })) : this._fromDay(this.day()));

    protected chooseDay(index: number): void {
        this.day.set(index);
        this.rows.set(this._fromDay(index));
    }

    protected addRow(oid: string | null): void {
        const e = oid ? this._byOid.get(oid) : undefined;
        if (!e) return;
        this.rows.update(r => [...r, { exercise_oid: e.oid, name: e.name, measure: e.measure, sets: [blankSet()] }]);
    }

    protected removeRow(i: number): void {
        this.rows.update(r => r.filter((_, j) => j !== i));
    }

    protected addSet(row: Row): void {
        const last = row.sets.at(-1);
        row.sets.push(last ? { ...last } : blankSet());
    }

    protected save(): void {
        this.problem.set(null);
        const rows = this.rows();
        if (!this.performedOn) return this.problem.set('Choose the date.');
        if (!rows.length) return this.problem.set('Add at least one exercise.');
        const body: WorkoutInput = {
            performed_on: this.performedOn,
            minutes: this.minutes,
            notes: this.notes.trim() || null,
            day_index: this.day() === NO_DAY ? null : this.day(),
            exercises: rows.map(r => ({ exercise_oid: r.exercise_oid, sets: r.sets.map(s => clean(r.measure, s)) }))
        };
        this.saving.set(true);
        (this._w ? this._service.updateWorkout(this.data.who, this._w.oid, body) : this._service.logWorkout(this.data.who, body)).subscribe({
            next: w => this.ref.close(w),
            // The API's message is shown as a toast already.
            error: () => this.saving.set(false)
        });
    }

    /** The day's exercises with their targets as the sets, to change to what was done. */
    private _fromDay(index: number): Row[] {
        const day = index === NO_DAY ? undefined : this.data.routine?.days[index];
        return (day?.exercises ?? []).map(x => ({
            exercise_oid: x.exercise_oid,
            name: x.name,
            measure: x.measure,
            sets: Array.from({ length: x.sets }, () => ({ weight_kg: x.weight_kg, reps: x.reps, seconds: x.seconds, distance_m: x.distance_m }))
        }));
    }
}

function blankSet(): WorkoutSet {
    return { weight_kg: null, reps: null, seconds: null, distance_m: null };
}

/** Only the fields the measure takes. */
function clean(measure: Measure, s: WorkoutSet): WorkoutSet {
    return {
        weight_kg: measure === 'weight_reps' ? s.weight_kg : null,
        reps: measure === 'weight_reps' || measure === 'reps' ? s.reps : null,
        seconds: measure === 'time' || measure === 'distance_time' ? s.seconds : null,
        distance_m: measure === 'distance_time' ? s.distance_m : null
    };
}
