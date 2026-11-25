import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
    type DayExerciseInput,
    EQUIPMENT_LABEL,
    type Exercise,
    type Goal,
    GOAL_LABEL,
    type Level,
    LEVEL_LABEL,
    type Measure,
    type Routine,
    type RoutineInput
} from '@core/models/training.model';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DIALOG_DATA, DialogRef } from '@shared/ui/dialog/dialog-ref';
import { DialogFooterDirective, DialogShellComponent } from '@shared/ui/dialog/dialog-shell.component';
import { AlertComponent } from '@shared/ui/display/display';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { NumberInputComponent } from '@shared/ui/forms/number-input.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { SwitchComponent } from '@shared/ui/forms/switch.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

export interface RoutineBuilderData {
    title: string;
    /** Prefill (editing a template or a member's routine). */
    routine?: Routine;
    /** The library the caller may use (active ones are offered; ones already in the routine stay). */
    exercises: Exercise[];
    /** A template: show the "offered" switch. */
    template?: boolean;
}

interface DraftDay {
    name: string;
    exercises: DayExerciseInput[];
}

const DAY_NAMES = ['Day A', 'Day B', 'Day C', 'Day D', 'Day E', 'Day F', 'Day G'];

/**
 * Builds a routine: name, goal, level and up to 7 days of up to 12 exercises, each with its sets and the
 * targets its measure takes. Closes with the input; the caller saves it (a template, a member's copy, a new routine
 * for one member).
 */
@Component({
    selector: 'app-routine-builder-dialog',
    imports: [
        FormsModule,
        ButtonComponent,
        DialogShellComponent,
        DialogFooterDirective,
        AlertComponent,
        FieldComponent,
        InputDirective,
        NumberInputComponent,
        SelectComponent,
        SwitchComponent,
        IconComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <fm-dialog-shell description="Days run in turn: the member does the next one each time they train." [title]="data.title">
            <div class="grid gap-4">
                <div class="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
                    <fm-field label="Name" required><input fmInput maxlength="80" [(ngModel)]="name" /></fm-field>
                    <fm-field label="Goal"><fm-select ariaLabel="Goal" [options]="goals" [(ngModel)]="goal" /></fm-field>
                    <fm-field label="Level"><fm-select ariaLabel="Level" [options]="levels" [(ngModel)]="level" /></fm-field>
                </div>
                <fm-field label="About"><textarea fmInput maxlength="1000" rows="2" [(ngModel)]="description"></textarea></fm-field>
                @if (data.template && data.routine) {
                    <fm-switch [(ngModel)]="active">Offered (shown when assigning)</fm-switch>
                }

                @for (day of days(); track $index; let d = $index) {
                    <section class="rounded-lg border border-border p-3">
                        <div class="mb-3 flex items-center gap-2">
                            <input class="fm-input max-w-48 font-medium" aria-label="Day name" maxlength="30" [(ngModel)]="day.name" />
                            <span class="flex-1"></span>
                            <button fmButton size="sm" variant="ghost" [disabled]="days().length === 1" (click)="removeDay(d)">
                                <fm-icon name="trash-2" size="1rem" />
                                Remove day
                            </button>
                        </div>
                        <ul class="grid gap-2">
                            @for (x of day.exercises; track $index; let i = $index) {
                                <li
                                    class="grid grid-cols-2 items-end gap-2 rounded-md bg-surface-sunken p-2 sm:grid-cols-[minmax(12rem,2fr)_repeat(4,minmax(4.5rem,1fr))_auto]"
                                >
                                    <fm-field class="col-span-2 sm:col-span-1" label="Exercise">
                                        <fm-select ariaLabel="Exercise" [ngModel]="x.exercise_oid" [options]="options()" (ngModelChange)="pick(x, $event)" />
                                    </fm-field>
                                    <fm-field label="Sets"><fm-number-input [max]="10" [min]="1" [(ngModel)]="x.sets" /></fm-field>
                                    @switch (measure(x)) {
                                        @case ('weight_reps') {
                                            <fm-field label="Reps"><fm-number-input [max]="100" [min]="1" [(ngModel)]="x.reps" /></fm-field>
                                            <fm-field label="kg"><fm-number-input [max]="500" [min]="0" [(ngModel)]="x.weight_kg" /></fm-field>
                                        }
                                        @case ('reps') {
                                            <fm-field label="Reps"><fm-number-input [max]="100" [min]="1" [(ngModel)]="x.reps" /></fm-field>
                                            <span></span>
                                        }
                                        @case ('time') {
                                            <fm-field label="Seconds"><fm-number-input [max]="7200" [min]="1" [(ngModel)]="x.seconds" /></fm-field>
                                            <span></span>
                                        }
                                        @default {
                                            <fm-field label="Metres"><fm-number-input [max]="50000" [min]="1" [(ngModel)]="x.distance_m" /></fm-field>
                                            <fm-field label="Seconds"><fm-number-input [max]="7200" [min]="1" [(ngModel)]="x.seconds" /></fm-field>
                                        }
                                    }
                                    <fm-field label="Rest (s)"><fm-number-input [max]="600" [min]="0" [(ngModel)]="x.rest_seconds" /></fm-field>
                                    <button
                                        class="justify-self-end"
                                        aria-label="Remove exercise"
                                        fmButton
                                        size="sm"
                                        variant="ghost"
                                        (click)="day.exercises.splice(i, 1)"
                                    >
                                        <fm-icon name="x" size="1rem" />
                                    </button>
                                </li>
                            }
                        </ul>
                        <button class="mt-2" fmButton size="sm" variant="secondary" [disabled]="day.exercises.length >= 12" (click)="addExercise(day)">
                            <fm-icon name="plus" size="1rem" />
                            Add an exercise
                        </button>
                    </section>
                }
                <button class="justify-self-start" fmButton size="sm" variant="secondary" [disabled]="days().length >= 7" (click)="addDay()">
                    <fm-icon name="plus" size="1rem" />
                    Add a day
                </button>
                @if (problem()) {
                    <fm-alert tone="danger">{{ problem() }}</fm-alert>
                }
            </div>
            <ng-container fmDialogFooter>
                <button fmButton (click)="ref.close()">Cancel</button>
                <button fmButton variant="primary" (click)="save()">Save</button>
            </ng-container>
        </fm-dialog-shell>
    `
})
export class RoutineBuilderDialogComponent {
    protected readonly data = inject<RoutineBuilderData>(DIALOG_DATA);
    protected readonly ref = inject<DialogRef<RoutineInput>>(DialogRef);
    private readonly _r = this.data.routine;
    protected name = this._r?.name ?? '';
    protected goal: Goal = this._r?.goal ?? 'general';
    protected level: Level = this._r?.level ?? 'beginner';
    protected description = this._r?.description ?? '';
    protected active = this._r?.active ?? true;
    protected readonly days = signal<DraftDay[]>(
        this._r?.days.map(d => ({
            name: d.name,
            exercises: d.exercises.map(x => ({
                exercise_oid: x.exercise_oid,
                sets: x.sets,
                reps: x.reps,
                weight_kg: x.weight_kg,
                seconds: x.seconds,
                distance_m: x.distance_m,
                rest_seconds: x.rest_seconds,
                notes: x.notes
            }))
        })) ?? [{ name: 'Day A', exercises: [] }]
    );
    protected readonly problem = signal<string | null>(null);
    protected readonly goals: SelectOption<Goal>[] = Object.entries(GOAL_LABEL).map(([value, label]) => ({ value: value as Goal, label }));
    protected readonly levels: SelectOption<Level>[] = Object.entries(LEVEL_LABEL).map(([value, label]) => ({ value: value as Level, label }));
    private readonly _inRoutine = new Set(this._r?.days.flatMap(d => d.exercises.map(x => x.exercise_oid)) ?? []);
    private readonly _byOid = new Map(this.data.exercises.map(e => [e.oid, e]));
    protected readonly options = computed<SelectOption<string>[]>(() =>
        this.data.exercises
            .filter(e => e.active || this._inRoutine.has(e.oid))
            .map(e => ({ value: e.oid, label: e.name, description: `${EQUIPMENT_LABEL[e.equipment]}${e.scope === 'branch' ? ' · this branch' : ''}` }))
    );

    protected measure(x: DayExerciseInput): Measure {
        return this._byOid.get(x.exercise_oid)?.measure ?? 'weight_reps';
    }

    protected pick(x: DayExerciseInput, oid: string): void {
        x.exercise_oid = oid;
        const m = this.measure(x);
        if (m === 'weight_reps' || m === 'reps') x.reps ??= 10;
        if (m === 'time') x.seconds ??= 30;
        if (m === 'distance_time') x.distance_m ??= 1000;
    }

    protected addExercise(day: DraftDay): void {
        day.exercises.push({ exercise_oid: '', sets: 3, reps: 10, weight_kg: null, seconds: null, distance_m: null, rest_seconds: 90, notes: null });
    }

    protected addDay(): void {
        this.days.update(d => [...d, { name: DAY_NAMES[d.length] ?? `Day ${d.length + 1}`, exercises: [] }]);
    }

    protected removeDay(i: number): void {
        this.days.update(d => d.filter((_, j) => j !== i));
    }

    protected save(): void {
        const days = this.days();
        if (this.name.trim().length < 2) return this.problem.set('Name the routine (at least 2 characters).');
        if (days.some(d => !d.name.trim())) return this.problem.set('Name every day.');
        if (days.some(d => !d.exercises.length)) return this.problem.set('Every day needs at least one exercise.');
        if (days.some(d => d.exercises.some(x => !x.exercise_oid))) return this.problem.set('Choose an exercise on every row, or remove the row.');
        this.ref.close({
            name: this.name.trim(),
            goal: this.goal,
            level: this.level,
            description: this.description.trim() || null,
            days: days.map(d => ({
                name: d.name.trim(),
                exercises: d.exercises.map(x => {
                    const m = this.measure(x);
                    return {
                        ...x,
                        sets: x.sets || 1,
                        reps: m === 'weight_reps' || m === 'reps' ? x.reps : null,
                        weight_kg: m === 'weight_reps' ? x.weight_kg : null,
                        seconds: m === 'time' || m === 'distance_time' ? x.seconds : null,
                        distance_m: m === 'distance_time' ? x.distance_m : null
                    };
                })
            })),
            ...(this.data.template && this.data.routine ? { active: this.active } : {})
        });
    }
}
