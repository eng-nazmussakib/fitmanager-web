import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '@core/auth/auth.service';
import type { Trainer } from '@core/models/class.model';
import type { AvailabilitySlot, TrainerDetail } from '@core/models/scheduling.model';
import { TrainerNumbersComponent } from '@features/reports/trainer-numbers.component';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogService } from '@shared/ui/dialog/dialog.service';
import { AvatarComponent, BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { DatePickerComponent, todayIso } from '@shared/ui/forms/date-picker.component';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { SchedulingService } from '../scheduling.service';
import { type TrainerEditorData, TrainerEditorDialogComponent } from './trainer-editor-dialog.component';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** The gym's week starts on Saturday. */
const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];
const TIMES: SelectOption<string>[] = Array.from({ length: 37 }, (_, i) => {
    const m = 6 * 60 + i * 30;
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    const h = Math.floor(m / 60);
    return { value: `${hh}:${mm}`, label: `${((h + 11) % 12) + 1}:${mm} ${h < 12 ? 'am' : 'pm'}` };
});

/**
 * `/console/:branch/trainers/:id` (D-078): the profile, the weekly availability at this branch (the free PT slots
 * come from it), days off, clients and the next two weeks. A trainer edits their own; a manager edits any.
 */
@Component({
    selector: 'app-trainer-detail-page',
    imports: [
        FormsModule,
        RouterLink,
        PageHeaderComponent,
        AppDatePipe,
        ButtonComponent,
        AvatarComponent,
        BadgeComponent,
        CardComponent,
        SkeletonComponent,
        DatePickerComponent,
        FieldComponent,
        InputDirective,
        SelectComponent,
        IconComponent,
        TrainerNumbersComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (data.value(); as t) {
            <app-page-header [subtitle]="t.headline ?? t.specialties.join(', ')" [title]="t.name">
                @if (canEdit()) {
                    <button fmButton (click)="edit(t)">
                        <fm-icon name="pencil" />
                        Edit profile
                    </button>
                }
            </app-page-header>
            <div class="grid gap-4 lg:grid-cols-3">
                <fm-card class="lg:col-span-1" title="Profile">
                    <div class="flex items-center gap-3">
                        <fm-avatar size="4rem" [name]="t.name" [src]="t.photo_url" />
                        <div class="min-w-0 text-sm">
                            <p class="font-medium">{{ t.branch_name }}</p>
                            <p class="text-fg-muted">{{ t.phone || 'No phone' }}</p>
                            @if (t.slug && t.public !== false) {
                                <a class="text-accent" target="_blank" [href]="'/trainers/' + t.slug">Public page</a>
                            }
                        </div>
                    </div>
                    @if (t.bio) {
                        <p class="mt-3 text-sm whitespace-pre-line">{{ t.bio }}</p>
                    }
                    <div class="mt-3 flex flex-wrap gap-1.5">
                        @for (s of t.specialties; track s) {
                            <fm-badge>{{ s }}</fm-badge>
                        }
                    </div>
                    @if (t.certifications?.length) {
                        <h3 class="mt-4 mb-1 text-sm font-semibold">Certificates</h3>
                        <ul class="text-sm text-fg-muted">
                            @for (c of t.certifications; track c.name) {
                                <li>{{ c.name }}{{ c.issuer ? ' · ' + c.issuer : '' }}{{ c.year ? ' · ' + c.year : '' }}</li>
                            }
                        </ul>
                    }
                </fm-card>

                <fm-card class="lg:col-span-2" subtitle="When they take PT at this branch; free times leave out their classes" title="Weekly availability">
                    <div class="flex flex-col divide-y divide-border">
                        @for (d of weekOrder; track d) {
                            <div class="flex flex-wrap items-center gap-2 py-2">
                                <span class="w-24 shrink-0 text-sm font-medium">{{ days[d] }}</span>
                                @for (s of slotsOf(d); track $index) {
                                    @if (canEdit()) {
                                        <span class="flex items-center gap-1">
                                            <fm-select
                                                class="w-28"
                                                ariaLabel="From"
                                                [ngModel]="s.start_time"
                                                [options]="times"
                                                (ngModelChange)="setSlot(s, { start_time: $event })"
                                            />
                                            <span class="text-fg-subtle">–</span>
                                            <fm-select
                                                class="w-28"
                                                ariaLabel="Until"
                                                [ngModel]="s.end_time"
                                                [options]="times"
                                                (ngModelChange)="setSlot(s, { end_time: $event })"
                                            />
                                            <button aria-label="Remove" fmButton iconOnly size="sm" variant="ghost" (click)="removeSlot(s)">
                                                <fm-icon name="x" size="1rem" />
                                            </button>
                                        </span>
                                    } @else {
                                        <fm-badge>{{ s.start_time }}–{{ s.end_time }}</fm-badge>
                                    }
                                } @empty {
                                    <span class="text-sm text-fg-subtle">Off</span>
                                }
                                @if (canEdit()) {
                                    <button fmButton size="sm" variant="ghost" (click)="addSlot(d)">
                                        <fm-icon name="plus" size="1rem" />
                                        Add
                                    </button>
                                }
                            </div>
                        }
                    </div>
                    @if (canEdit()) {
                        <div class="mt-3 flex justify-end gap-2">
                            <button fmButton [disabled]="!dirty()" (click)="resetSlots()">Undo</button>
                            <button fmButton variant="primary" [disabled]="!dirty()" [loading]="saving()" (click)="saveSlots()">Save availability</button>
                        </div>
                    }
                </fm-card>

                <fm-card title="Days off">
                    <ul class="flex flex-col gap-2 text-sm">
                        @for (l of t.leave; track l.oid) {
                            <li class="flex items-center gap-2">
                                <fm-icon class="text-fg-subtle" name="calendar-off" size="1rem" />
                                <span class="flex-1">
                                    {{ l.from_date | appDate }}{{ l.to_date !== l.from_date ? ' – ' + (l.to_date | appDate) : ''
                                    }}{{ l.reason ? ' · ' + l.reason : '' }}
                                </span>
                                @if (canEdit()) {
                                    <button aria-label="Remove day off" fmButton iconOnly size="sm" variant="ghost" (click)="removeLeave(l.oid)">
                                        <fm-icon name="trash-2" size="1rem" />
                                    </button>
                                }
                            </li>
                        } @empty {
                            <li class="text-fg-subtle">None ahead.</li>
                        }
                    </ul>
                    @if (canEdit()) {
                        <div class="mt-3 grid gap-2">
                            <div class="grid grid-cols-2 gap-2">
                                <fm-field label="From"><fm-date-picker [min]="today" [(ngModel)]="leaveFrom" /></fm-field>
                                <fm-field label="Until"><fm-date-picker [min]="leaveFrom() || today" [(ngModel)]="leaveTo" /></fm-field>
                            </div>
                            <fm-field label="Reason"><input fmInput maxlength="300" [(ngModel)]="leaveReason" /></fm-field>
                            <button class="justify-self-end" fmButton size="sm" [disabled]="!leaveFrom()" (click)="addLeave()">Add day off</button>
                        </div>
                    }
                </fm-card>

                <fm-card title="Clients" [subtitle]="(t.client_list?.length ?? 0) + ' at this branch'">
                    <ul class="flex flex-col gap-2">
                        @for (c of t.client_list; track c.oid) {
                            <li>
                                <a class="flex items-center gap-2 text-sm no-underline" [routerLink]="['../../members', c.oid]">
                                    <fm-avatar size="2rem" [name]="c.name" [src]="c.photo_url" />
                                    <span class="min-w-0 flex-1 truncate text-fg">{{ c.name }}</span>
                                    <span class="text-xs text-fg-subtle">{{ c.code }}</span>
                                </a>
                            </li>
                        } @empty {
                            <li class="text-sm text-fg-subtle">No clients yet. Assign a trainer on the member's profile.</li>
                        }
                    </ul>
                </fm-card>

                <fm-card subtitle="Classes and PT, next 14 days" title="Coming up">
                    <ul class="flex flex-col gap-2 text-sm">
                        @for (u of t.upcoming; track u.oid) {
                            <li class="flex items-center gap-2">
                                <fm-badge [tone]="u.kind === 'pt' ? 'primary' : 'neutral'">{{ u.kind === 'pt' ? 'PT' : 'Class' }}</fm-badge>
                                <span class="min-w-0 flex-1 truncate">{{ u.title }}</span>
                                <span class="text-xs text-fg-subtle tabular-nums">{{ u.starts_at | appDate: 'EEE d MMM, h:mm a' }}</span>
                            </li>
                        } @empty {
                            <li class="text-fg-subtle">Nothing booked.</li>
                        }
                    </ul>
                </fm-card>

                @if (seesNumbers()) {
                    <app-trainer-numbers class="lg:col-span-3" [trainerOid]="t.oid" />
                }
            </div>
        } @else {
            <fm-skeleton height="24rem" />
        }
    `
})
export class TrainerDetailPageComponent {
    private readonly _service = inject(SchedulingService);
    private readonly _dialog = inject(DialogService);
    private readonly _auth = inject(AuthService);
    readonly id = input.required<string>();
    protected readonly data = rxResource({ params: () => this.id(), stream: ({ params }) => this._service.trainer(params) });
    protected readonly days = DAYS;
    protected readonly weekOrder = WEEK_ORDER;
    protected readonly times = TIMES;
    protected readonly today = todayIso();
    protected readonly saving = signal(false);
    protected readonly slots = signal<AvailabilitySlot[]>([]);
    protected readonly leaveFrom = signal('');
    protected readonly leaveTo = signal('');
    protected readonly leaveReason = signal('');
    /** A manager edits any profile; a trainer only their own (D-083). */
    protected readonly self = computed(() => !this._auth.can('manage', 'Trainer'));
    protected readonly canEdit = computed(() => {
        const t = this.data.value();
        if (!t || !this._auth.can('update', 'Trainer')) return false;
        return !this.self() || t.user_oid === this._auth.user()?.user_id;
    });
    /** Their numbers (D-106): a trainer on their own profile; managers and HQ on any. */
    protected readonly seesNumbers = computed(() => {
        const t = this.data.value();
        return !!t && (this._auth.can('read', 'Report') || t.user_oid === this._auth.user()?.user_id);
    });
    protected readonly dirty = computed(() => JSON.stringify(this.slots()) !== JSON.stringify(this.data.value()?.availability ?? []));

    constructor() {
        effect(() => {
            const t = this.data.value();
            if (t) this.slots.set(t.availability.map(s => ({ ...s })));
        });
    }

    protected slotsOf(weekday: number): AvailabilitySlot[] {
        return this.slots().filter(s => s.weekday === weekday);
    }

    protected addSlot(weekday: number): void {
        const last = this.slotsOf(weekday).at(-1);
        const start = last ? last.end_time : '16:00';
        const end = TIMES.find(t => t.value > start && t.value >= start)?.value ?? '21:00';
        this.slots.update(list => [...list, { weekday, start_time: start, end_time: end === start ? '21:00' : end }]);
    }

    protected setSlot(slot: AvailabilitySlot, patch: Partial<AvailabilitySlot>): void {
        this.slots.update(list => list.map(s => (s === slot ? { ...s, ...patch } : s)));
    }

    protected removeSlot(slot: AvailabilitySlot): void {
        this.slots.update(list => list.filter(s => s !== slot));
    }

    protected resetSlots(): void {
        this.slots.set((this.data.value()?.availability ?? []).map(s => ({ ...s })));
    }

    protected saveSlots(): void {
        this.saving.set(true);
        this._service.setAvailability(this.id(), this.slots()).subscribe({
            next: () => {
                this.saving.set(false);
                this.data.reload();
            },
            error: () => this.saving.set(false)
        });
    }

    protected addLeave(): void {
        const from = this.leaveFrom();
        this._service.addLeave(this.id(), { from_date: from, to_date: this.leaveTo() || from, reason: this.leaveReason().trim() || null }).subscribe(() => {
            this.leaveFrom.set('');
            this.leaveTo.set('');
            this.leaveReason.set('');
            this.data.reload();
        });
    }

    protected removeLeave(oid: string): void {
        this._service.removeLeave(this.id(), oid).subscribe(() => this.data.reload());
    }

    protected edit(t: TrainerDetail): void {
        this._dialog
            .open<TrainerEditorDialogComponent, TrainerEditorData, Trainer>(TrainerEditorDialogComponent, {
                data: { trainer: t, self: this.self() },
                size: 'lg'
            })
            .afterClosed.subscribe(saved => {
                if (saved) this.data.reload();
            });
    }
}
