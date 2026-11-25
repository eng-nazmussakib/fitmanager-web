import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { addDays, format, parseISO } from 'date-fns';
import { of } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import type { MemberListItem } from '@core/models/member.model';
import type { PtSession } from '@core/models/scheduling.model';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { CanDirective } from '@shared/directives/can.directive';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogComponent } from '@shared/ui/dialog/dialog.component';
import { BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';
import { DatePickerComponent, todayIso } from '@shared/ui/forms/date-picker.component';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { MemberPickerComponent } from '../member-picker.component';
import { SchedulingService } from '../scheduling.service';

const STATUS_TONE: Record<PtSession['status'], 'primary' | 'success' | 'warning' | 'neutral'> = {
    Booked: 'primary',
    Completed: 'success',
    NoShow: 'warning',
    Cancelled: 'neutral'
};

/**
 * `/console/:branch/pt`: the week's PT sessions. Book one from a trainer's free times (availability less
 * their classes, sessions and days off) for a member with sessions left on a PT package; mark it done or a no-show
 * once it has started, or cancel it (the member's late cancel uses the session). Trainers see their own first.
 */
@Component({
    selector: 'app-pt-page',
    imports: [
        FormsModule,
        PageHeaderComponent,
        CanDirective,
        AppDatePipe,
        ButtonComponent,
        DialogComponent,
        BadgeComponent,
        CardComponent,
        SkeletonComponent,
        EmptyStateComponent,
        DatePickerComponent,
        FieldComponent,
        InputDirective,
        SelectComponent,
        IconComponent,
        MemberPickerComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-page-header title="Personal training" [subtitle]="rangeLabel()">
            <div class="flex items-center gap-1">
                <button aria-label="Previous week" fmButton iconOnly (click)="go(-7)"><fm-icon name="chevron-left" /></button>
                <button fmButton (click)="setWeek(null)">This week</button>
                <button aria-label="Next week" fmButton iconOnly (click)="go(7)"><fm-icon name="chevron-right" /></button>
            </div>
            <button *appCan="'create'; on: 'PtSession'" fmButton variant="primary" (click)="openBook()">
                <fm-icon name="plus" />
                Book PT
            </button>
        </app-page-header>
        <div class="mb-4 max-w-xs">
            <fm-select ariaLabel="Trainer" [ngModel]="trainer()" [options]="trainerOptions()" (ngModelChange)="trainerPick.set($event)" />
        </div>
        @if (data.isLoading() && !data.value()) {
            <fm-skeleton height="20rem" />
        } @else if (!sessions().length) {
            <fm-card><fm-empty-state icon="dumbbell" title="No PT sessions this week" /></fm-card>
        } @else {
            <div class="flex flex-col gap-4">
                @for (d of days(); track d.date) {
                    @if (d.sessions.length) {
                        <section [attr.aria-label]="d.label">
                            <h2 class="mb-2 text-sm font-semibold" [class.text-accent]="d.date === today">{{ d.label }}</h2>
                            <ul class="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
                                @for (p of d.sessions; track p.oid) {
                                    <li>
                                        <button class="fm-focusable flex w-full items-center gap-3 px-3 py-2.5 text-left" type="button" (click)="open(p)">
                                            <span class="w-20 shrink-0 text-sm font-semibold tabular-nums">{{ p.starts_at | appDate: 'h:mm a' }}</span>
                                            <span class="min-w-0 flex-1">
                                                <span class="block truncate font-medium">{{ p.member_name }}</span>
                                                <span class="block truncate text-xs text-fg-muted">{{ p.trainer_name }} · {{ p.plan_name }}</span>
                                            </span>
                                            <fm-badge [tone]="tone[p.status]">{{ p.status === 'NoShow' ? 'No-show' : p.status }}</fm-badge>
                                        </button>
                                    </li>
                                }
                            </ul>
                        </section>
                    }
                }
            </div>
        }

        <fm-dialog title="Book a PT session" [(open)]="booking">
            <div class="grid gap-4">
                <app-member-picker label="Member" status="Active" (changed)="member.set($event)" />
                <fm-field label="Trainer" required>
                    <fm-select
                        ariaLabel="Trainer"
                        placeholder="Choose"
                        [ngModel]="bookTrainer()"
                        [options]="bookTrainerOptions()"
                        (ngModelChange)="bookTrainer.set($event)"
                    />
                </fm-field>
                <fm-field label="Day" required>
                    <fm-date-picker [min]="today" [ngModel]="bookDate()" (ngModelChange)="bookDate.set($event)" />
                </fm-field>
                <fieldset>
                    <legend class="mb-2 text-sm font-medium">Free times (one hour)</legend>
                    @if (slots.isLoading()) {
                        <fm-skeleton height="2.5rem" />
                    } @else if (slots.value()?.slots?.length) {
                        <div class="flex flex-wrap gap-2">
                            @for (s of slots.value()!.slots; track s) {
                                <button
                                    type="button"
                                    fmButton
                                    size="sm"
                                    [attr.aria-pressed]="bookTime() === s"
                                    [variant]="bookTime() === s ? 'primary' : 'secondary'"
                                    (click)="bookTime.set(s)"
                                >
                                    {{ label12(s) }}
                                </button>
                            }
                        </div>
                    } @else {
                        <p class="text-sm text-fg-subtle">{{ bookTrainer() && bookDate() ? 'No free time that day.' : 'Choose a trainer and a day.' }}</p>
                    }
                </fieldset>
            </div>
            <ng-container fmDialogFooter>
                <button fmButton (click)="booking.set(false)">Close</button>
                <button fmButton variant="primary" [disabled]="!member() || !bookTime()" [loading]="busy()" (click)="book()">Book</button>
            </ng-container>
        </fm-dialog>

        <fm-dialog
            [description]="selected() ? (selected()!.starts_at | appDate: 'EEEE d MMM, h:mm a') + ' · ' + selected()!.trainer_name : ''"
            [title]="selected()?.member_name ?? 'PT session'"
            [(open)]="drawer"
        >
            @if (selected(); as p) {
                <div class="grid gap-4 text-sm">
                    <div class="flex flex-wrap gap-2">
                        <fm-badge [tone]="tone[p.status]">{{ p.status === 'NoShow' ? 'No-show' : p.status }}</fm-badge>
                        <fm-badge>{{ p.plan_name }}</fm-badge>
                        <fm-badge>{{ p.member_code }}</fm-badge>
                        @if (p.status === 'Cancelled') {
                            <fm-badge>{{ p.charged ? 'Session used' : 'Session given back' }}</fm-badge>
                        }
                    </div>
                    @if (p.cancel_reason) {
                        <p class="text-fg-muted">Cancelled by the {{ p.cancelled_by }}: {{ p.cancel_reason }}</p>
                    }
                    @if (p.notes) {
                        <p class="whitespace-pre-line">{{ p.notes }}</p>
                    }
                    @if (p.status === 'Booked' && canChange(p)) {
                        @if (started(p)) {
                            <fm-field label="Notes from the session">
                                <textarea fmInput rows="3" [ngModel]="notes()" (ngModelChange)="notes.set($event)"></textarea>
                            </fm-field>
                            <div class="flex flex-wrap justify-end gap-2">
                                <button fmButton [loading]="busy()" (click)="noShow(p)">No-show</button>
                                <button fmButton variant="primary" [loading]="busy()" (click)="complete(p)">Mark done</button>
                            </div>
                        } @else {
                            <div class="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                                <fm-field label="Cancelled by">
                                    <fm-select ariaLabel="Cancelled by" [ngModel]="cancelBy()" [options]="byOptions" (ngModelChange)="cancelBy.set($event)" />
                                </fm-field>
                                <fm-field label="Reason">
                                    <input fmInput maxlength="300" [ngModel]="cancelReason()" (ngModelChange)="cancelReason.set($event)" />
                                </fm-field>
                            </div>
                            <p class="text-xs text-fg-subtle">
                                A member's cancel less than {{ hours() }} hours before uses the session; any other cancel gives it back.
                            </p>
                            <div class="flex justify-end">
                                <button fmButton variant="danger" [disabled]="cancelReason().trim().length < 3" [loading]="busy()" (click)="cancel(p)">
                                    Cancel session
                                </button>
                            </div>
                        }
                    }
                </div>
            }
        </fm-dialog>
    `
})
export class PtPageComponent {
    private readonly _service = inject(SchedulingService);
    private readonly _auth = inject(AuthService);
    private readonly _router = inject(Router);
    private readonly _route = inject(ActivatedRoute);
    readonly week = input<string>();
    protected readonly today = todayIso();
    protected readonly tone = STATUS_TONE;
    protected readonly trainerPick = signal<string | null>(null);
    protected readonly data = rxResource({ params: () => this.week() ?? this.today, stream: ({ params }) => this._service.ptWeek(params) });
    /** A trainer starts on their own sessions. */
    private readonly _mine = computed(() => {
        const me = this._auth.user()?.user_id;
        return this.data.value()?.trainers.find(t => t.user_oid === me)?.oid ?? '';
    });
    protected readonly trainer = computed(() => this.trainerPick() ?? this._mine());
    protected readonly trainerOptions = computed<SelectOption<string>[]>(() => [
        { value: '', label: 'Every trainer' },
        ...(this.data.value()?.trainers ?? []).map(t => ({ value: t.oid, label: t.name }))
    ]);
    protected readonly sessions = computed(() => (this.data.value()?.sessions ?? []).filter(p => !this.trainer() || p.trainer_oid === this.trainer()));
    protected readonly days = computed(() => {
        const w = this.data.value();
        if (!w) return [];
        return Array.from({ length: 7 }, (_, i) => {
            const date = format(addDays(parseISO(w.from), i), 'yyyy-MM-dd');
            return { date, label: format(parseISO(date), 'EEEE d MMM'), sessions: this.sessions().filter(p => p.date === date) };
        });
    });
    protected readonly rangeLabel = computed(() => {
        const w = this.data.value();
        return w ? `${format(parseISO(w.from), 'd MMM')} – ${format(parseISO(w.to), 'd MMM yyyy')}` : '';
    });

    protected readonly booking = signal(false);
    protected readonly member = signal<MemberListItem | null>(null);
    protected readonly bookTrainer = signal<string>('');
    protected readonly bookDate = signal<string>(this.today);
    protected readonly bookTime = signal<string | null>(null);
    protected readonly bookTrainerOptions = computed<SelectOption<string>[]>(() =>
        (this.data.value()?.trainers ?? []).filter(t => !this._isTrainer() || t.oid === this._mine()).map(t => ({ value: t.oid, label: t.name }))
    );
    protected readonly slots = rxResource({
        params: () => ({ trainer: this.bookTrainer(), date: this.bookDate(), open: this.booking() }),
        stream: ({ params }) => (params.open && params.trainer && params.date ? this._service.ptSlots(params.trainer, params.date) : of(null))
    });
    protected readonly busy = signal(false);

    protected readonly drawer = signal(false);
    protected readonly selected = signal<PtSession | null>(null);
    protected readonly notes = signal('');
    protected readonly cancelBy = signal<'member' | 'trainer' | 'staff'>('member');
    protected readonly cancelReason = signal('');
    protected readonly byOptions: SelectOption<'member' | 'trainer' | 'staff'>[] = [
        { value: 'member', label: 'The member' },
        { value: 'trainer', label: 'The trainer' },
        { value: 'staff', label: 'The gym' }
    ];
    protected readonly hours = signal(2);
    private readonly _done = {
        next: () => {
            this.busy.set(false);
            this.drawer.set(false);
            this.data.reload();
        },
        error: () => this.busy.set(false)
    };

    protected label12(hhmm: string): string {
        const [h = 0, m = 0] = hhmm.split(':').map(Number);
        return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
    }

    protected started(p: PtSession): boolean {
        return Date.parse(p.starts_at) <= Date.now();
    }

    protected canChange(p: PtSession): boolean {
        return this._auth.can('update', 'PtSession') && (!this._isTrainer() || p.trainer_oid === this._mine());
    }

    protected go(days: number): void {
        const from = this.data.value()?.from ?? this.today;
        this.setWeek(format(addDays(parseISO(from), days), 'yyyy-MM-dd'));
    }

    protected setWeek(week: string | null): void {
        void this._router.navigate([], { relativeTo: this._route, queryParams: { week }, queryParamsHandling: 'merge', replaceUrl: true });
    }

    protected openBook(): void {
        this.bookTrainer.set(this._isTrainer() ? this._mine() : (this.trainer() ?? ''));
        this.bookTime.set(null);
        this.booking.set(true);
    }

    protected book(): void {
        const m = this.member();
        const time = this.bookTime();
        if (!m || !time) return;
        this.busy.set(true);
        this._service.bookPt({ member_oid: m.oid, trainer_oid: this.bookTrainer(), date: this.bookDate(), start_time: time }).subscribe({
            next: () => {
                this.busy.set(false);
                this.booking.set(false);
                this.data.reload();
            },
            error: () => this.busy.set(false)
        });
    }

    protected open(p: PtSession): void {
        this.selected.set(p);
        this.notes.set(p.notes ?? '');
        this.cancelBy.set(this._isTrainer() ? 'trainer' : 'member');
        this.cancelReason.set('');
        this.drawer.set(true);
    }

    protected complete(p: PtSession): void {
        this.busy.set(true);
        this._service.completePt(p.oid, this.notes().trim() || null).subscribe(this._done);
    }

    protected noShow(p: PtSession): void {
        this.busy.set(true);
        this._service.noShowPt(p.oid).subscribe(this._done);
    }

    protected cancel(p: PtSession): void {
        this.busy.set(true);
        this._service.cancelPt(p.oid, this.cancelBy(), this.cancelReason().trim()).subscribe(this._done);
    }

    private _isTrainer(): boolean {
        return !this._auth.can('manage', 'PtSession') && !this._auth.can('create', 'Member');
    }
}
