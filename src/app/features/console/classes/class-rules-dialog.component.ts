import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';

import type { ClassType, Trainer } from '@core/models/class.model';
import type { ClassRule, Room } from '@core/models/scheduling.model';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DIALOG_DATA, DialogRef } from '@shared/ui/dialog/dialog-ref';
import { DialogFooterDirective, DialogShellComponent } from '@shared/ui/dialog/dialog-shell.component';
import { BadgeComponent, SkeletonComponent } from '@shared/ui/display/display';
import { DatePickerComponent, todayIso } from '@shared/ui/forms/date-picker.component';
import { CheckDirective, FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { NumberInputComponent } from '@shared/ui/forms/number-input.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { SwitchComponent } from '@shared/ui/forms/switch.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { SchedulingService } from '../scheduling.service';

export interface ClassRulesData {
    types: ClassType[];
    trainers: Trainer[];
    rooms: Room[];
    /** Open on the one-off form. */
    oneOff?: boolean;
}

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];

interface Draft {
    oid: string | null;
    class_type_oid: string;
    trainer_oid: string;
    room_oid: string;
    weekdays: number[];
    start_time: string;
    capacity: number;
    ladies_only: boolean;
    valid_to: string;
    date: string;
}

/**
 * The branch's weekly classes: each rule makes one class on each of its days, filled in four weeks ahead.
 * Add, change or end a rule (booked classes it no longer runs are cancelled with a message); or add one class on
 * one day. The API checks the trainer, the room, the hours and clashes; its message shows as a toast.
 */
@Component({
    selector: 'app-class-rules-dialog',
    imports: [
        FormsModule,
        ButtonComponent,
        DialogShellComponent,
        DialogFooterDirective,
        BadgeComponent,
        SkeletonComponent,
        DatePickerComponent,
        CheckDirective,
        FieldComponent,
        InputDirective,
        NumberInputComponent,
        SelectComponent,
        SwitchComponent,
        IconComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <fm-dialog-shell
            description="Each weekly class is filled in four weeks ahead; edits reach the classes not changed on their own."
            title="Weekly classes"
        >
            @if (draft(); as d) {
                <div class="grid gap-3">
                    <h3 class="font-semibold">{{ d.oid ? 'Change a weekly class' : oneOff() ? 'Add one class' : 'Add a weekly class' }}</h3>
                    <div class="grid gap-3 sm:grid-cols-3">
                        <fm-field label="Class" required>
                            <fm-select
                                ariaLabel="Class"
                                placeholder="Choose"
                                [disabled]="!!d.oid"
                                [ngModel]="d.class_type_oid"
                                [options]="typeOptions"
                                (ngModelChange)="set({ class_type_oid: $event })"
                            />
                        </fm-field>
                        <fm-field label="Trainer" required>
                            <fm-select
                                ariaLabel="Trainer"
                                placeholder="Choose"
                                [ngModel]="d.trainer_oid"
                                [options]="trainerOptions"
                                (ngModelChange)="set({ trainer_oid: $event })"
                            />
                        </fm-field>
                        <fm-field label="Room" required>
                            <fm-select
                                ariaLabel="Room"
                                placeholder="Choose"
                                [ngModel]="d.room_oid"
                                [options]="roomOptions"
                                (ngModelChange)="set({ room_oid: $event })"
                            />
                        </fm-field>
                        <fm-field hint="HH:mm" label="Starts at" required>
                            <input fmInput inputmode="numeric" maxlength="5" [ngModel]="d.start_time" (ngModelChange)="set({ start_time: $event })" />
                        </fm-field>
                        <fm-field label="Places" required>
                            <fm-number-input [ngModel]="d.capacity" (ngModelChange)="set({ capacity: $event ?? 1 })" />
                        </fm-field>
                        @if (oneOff()) {
                            <fm-field label="Day" required>
                                <fm-date-picker [min]="today" [ngModel]="d.date" (ngModelChange)="set({ date: $event })" />
                            </fm-field>
                        } @else {
                            <fm-field hint="Leave empty to run on." label="Last day">
                                <fm-date-picker [min]="today" [ngModel]="d.valid_to" (ngModelChange)="set({ valid_to: $event ?? '' })" />
                            </fm-field>
                        }
                    </div>
                    @if (!oneOff()) {
                        <fieldset class="flex flex-wrap gap-3">
                            <legend class="mb-1 text-sm font-medium">Days</legend>
                            @for (wd of weekOrder; track wd) {
                                <label class="fm-check-label text-sm">
                                    <input type="checkbox" fmCheck [checked]="d.weekdays.includes(wd)" (change)="toggleDay(wd)" />
                                    {{ dayShort[wd] }}
                                </label>
                            }
                        </fieldset>
                    }
                    <fm-switch [ngModel]="d.ladies_only" (ngModelChange)="set({ ladies_only: $event })">Ladies only (a female trainer)</fm-switch>
                    <div class="flex justify-end gap-2">
                        <button fmButton (click)="draft.set(null)">Back</button>
                        <button fmButton variant="primary" [disabled]="!ready()" [loading]="saving()" (click)="save()">Save</button>
                    </div>
                </div>
            } @else {
                <div class="mb-3 flex flex-wrap gap-2">
                    <button fmButton size="sm" variant="primary" (click)="start(null, false)">
                        <fm-icon name="repeat" size="1rem" />
                        Add a weekly class
                    </button>
                    <button fmButton size="sm" (click)="start(null, true)">
                        <fm-icon name="calendar-plus" size="1rem" />
                        Add one class
                    </button>
                </div>
                @if (rules.value(); as list) {
                    <ul class="divide-y divide-border rounded-lg border border-border">
                        @for (r of list; track r.oid) {
                            <li class="flex flex-wrap items-center gap-3 px-3 py-2 text-sm" [class.opacity-60]="!r.active">
                                <span class="min-w-0 flex-1">
                                    <span class="block font-medium">{{ r.type_name }} · {{ r.start_time }}–{{ r.end_time }}</span>
                                    <span class="block text-xs text-fg-subtle">
                                        {{ daysLabel(r.weekdays) }} · {{ r.trainer_name }} · {{ r.room_name }} · {{ r.capacity }} places
                                    </span>
                                </span>
                                @if (r.ladies_only) {
                                    <fm-badge tone="primary">Ladies</fm-badge>
                                }
                                @if (!r.active) {
                                    <fm-badge>Ended</fm-badge>
                                } @else {
                                    <button fmButton size="sm" variant="ghost" (click)="start(r, false)">Change</button>
                                    <button fmButton size="sm" variant="ghost" [loading]="saving()" (click)="end(r)">End</button>
                                }
                            </li>
                        }
                    </ul>
                } @else {
                    <fm-skeleton height="12rem" />
                }
            }
            <ng-container fmDialogFooter>
                <button fmButton (click)="ref.close(changed())">Done</button>
            </ng-container>
        </fm-dialog-shell>
    `
})
export class ClassRulesDialogComponent {
    protected readonly data = inject<ClassRulesData>(DIALOG_DATA);
    protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
    private readonly _service = inject(SchedulingService);
    protected readonly today = todayIso();
    protected readonly dayShort = DAY_SHORT;
    protected readonly weekOrder = WEEK_ORDER;
    protected readonly rules = rxResource({ stream: () => this._service.rules() });
    protected readonly draft = signal<Draft | null>(null);
    protected readonly oneOff = signal(false);
    protected readonly saving = signal(false);
    protected readonly changed = signal(false);
    protected readonly typeOptions: SelectOption<string>[] = this.data.types
        .filter(t => t.active !== false)
        .map(t => ({ value: t.oid, label: `${t.name} (${t.minutes} min)` }));
    protected readonly trainerOptions: SelectOption<string>[] = this.data.trainers.map(t => ({ value: t.oid, label: t.name, description: t.gender }));
    protected readonly roomOptions: SelectOption<string>[] = this.data.rooms
        .filter(r => r.active)
        .map(r => ({ value: r.oid, label: r.name, description: `Holds ${r.capacity}` }));
    protected readonly ready = computed(() => {
        const d = this.draft();
        if (!d) return false;
        const base = !!d.class_type_oid && !!d.trainer_oid && !!d.room_oid && /^\d\d:\d\d$/.test(d.start_time) && d.capacity > 0;
        return base && (this.oneOff() ? !!d.date : d.weekdays.length > 0);
    });

    constructor() {
        if (this.data.oneOff) this.start(null, true);
    }

    protected daysLabel(days: number[]): string {
        return WEEK_ORDER.filter(d => days.includes(d))
            .map(d => DAY_SHORT[d])
            .join(', ');
    }

    protected start(r: ClassRule | null, oneOff: boolean): void {
        this.oneOff.set(oneOff);
        this.draft.set({
            oid: r?.oid ?? null,
            class_type_oid: r?.class_type_oid ?? '',
            trainer_oid: r?.trainer_oid ?? '',
            room_oid: r?.room_oid ?? '',
            weekdays: r?.weekdays ?? [],
            start_time: r?.start_time ?? '18:00',
            capacity: r?.capacity ?? 16,
            ladies_only: r?.ladies_only ?? false,
            valid_to: r?.valid_to ?? '',
            date: this.today
        });
    }

    protected set(patch: Partial<Draft>): void {
        this.draft.update(d => (d ? { ...d, ...patch } : d));
    }

    protected toggleDay(wd: number): void {
        this.draft.update(d => (d ? { ...d, weekdays: d.weekdays.includes(wd) ? d.weekdays.filter(x => x !== wd) : [...d.weekdays, wd] } : d));
    }

    protected save(): void {
        const d = this.draft();
        if (!d) return;
        this.saving.set(true);
        const done = {
            next: () => {
                this.saving.set(false);
                this.changed.set(true);
                this.draft.set(null);
                this.rules.reload();
            },
            error: () => this.saving.set(false)
        };
        if (this.oneOff())
            this._service
                .addClass({
                    class_type_oid: d.class_type_oid,
                    trainer_oid: d.trainer_oid,
                    room_oid: d.room_oid,
                    date: d.date,
                    start_time: d.start_time,
                    capacity: d.capacity,
                    ladies_only: d.ladies_only
                })
                .subscribe(done);
        else if (d.oid)
            this._service
                .updateRule(d.oid, {
                    trainer_oid: d.trainer_oid,
                    room_oid: d.room_oid,
                    weekdays: d.weekdays,
                    start_time: d.start_time,
                    capacity: d.capacity,
                    ladies_only: d.ladies_only,
                    valid_to: d.valid_to || null
                })
                .subscribe(done);
        else
            this._service
                .createRule({
                    class_type_oid: d.class_type_oid,
                    trainer_oid: d.trainer_oid,
                    room_oid: d.room_oid,
                    weekdays: d.weekdays,
                    start_time: d.start_time,
                    capacity: d.capacity,
                    ladies_only: d.ladies_only,
                    valid_to: d.valid_to || null
                })
                .subscribe(done);
    }

    protected end(r: ClassRule): void {
        this.saving.set(true);
        this._service.updateRule(r.oid, { active: false }).subscribe({
            next: () => {
                this.saving.set(false);
                this.changed.set(true);
                this.rules.reload();
            },
            error: () => this.saving.set(false)
        });
    }
}
