import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { addDays, format, parseISO } from 'date-fns';
import { catchError, debounceTime, map, of, switchMap } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import type { ClassSession, ClassType } from '@core/models/class.model';
import type { MemberListItem } from '@core/models/member.model';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { CanDirective } from '@shared/directives/can.directive';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogComponent } from '@shared/ui/dialog/dialog.component';
import { BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';
import { todayIso } from '@shared/ui/forms/date-picker.component';
import { FieldComponent, InputDirective, PrefixDirective } from '@shared/ui/forms/field.component';
import { SwitchComponent } from '@shared/ui/forms/switch.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { ConsoleService } from '../console.service';
import { type Lane, lanes } from './class-lanes';

/** Grid hours: 06:00 to 22:00. */
const FIRST_HOUR = 6;
const LAST_HOUR = 22;
const HOUR_PX = 56;

/** Class colours (Tailwind's palette, readable as tints in light and dark mode). */
const COLORS: Record<ClassType['color'], string> = {
    red: 'border-red-500 bg-red-500/12',
    orange: 'border-orange-500 bg-orange-500/12',
    amber: 'border-amber-500 bg-amber-500/14',
    green: 'border-green-600 bg-green-600/12',
    teal: 'border-teal-600 bg-teal-600/12',
    blue: 'border-blue-600 bg-blue-600/12',
    violet: 'border-violet-600 bg-violet-600/12',
    pink: 'border-pink-500 bg-pink-500/12'
};

/**
 * H5: the class week (Saturday to Friday). Desktop: a time grid with a column per day; phones: a list per day.
 * A session opens a drawer with the trainer, room, roster and waitlist: book a member, move someone in from the
 * waitlist, mark attendance. Trainers see "My classes" by default.
 */
@Component({
    selector: 'app-classes-page',
    imports: [
        NgTemplateOutlet,
        FormsModule,
        PageHeaderComponent,
        CanDirective,
        AppDatePipe,
        ButtonComponent,
        BadgeComponent,
        CardComponent,
        SkeletonComponent,
        DialogComponent,
        EmptyStateComponent,
        FieldComponent,
        InputDirective,
        PrefixDirective,
        SwitchComponent,
        IconComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-page-header title="Classes" [subtitle]="rangeLabel()">
            <div class="flex items-center gap-1">
                <button aria-label="Previous week" fmButton iconOnly (click)="go(-7)"><fm-icon name="chevron-left" /></button>
                <button fmButton (click)="goToday()">This week</button>
                <button aria-label="Next week" fmButton iconOnly (click)="go(7)"><fm-icon name="chevron-right" /></button>
            </div>
        </app-page-header>

        <div class="mb-4 flex flex-wrap items-center gap-4">
            @if (data.value()?.my_trainer_oid) {
                <fm-switch [ngModel]="mineOnly()" (ngModelChange)="mine.set($event)">My classes</fm-switch>
            }
            <ul class="flex flex-wrap gap-2 text-xs" aria-label="Class types">
                @for (t of data.value()?.types ?? []; track t.oid) {
                    <li class="flex items-center gap-1.5 rounded-full border-l-4 px-2 py-0.5" [class]="colors[t.color]">{{ t.name }}</li>
                }
            </ul>
        </div>

        @if (data.isLoading() && !data.value()) {
            <fm-skeleton height="32rem" />
        } @else if (sessions().length === 0) {
            <fm-card>
                <fm-empty-state
                    icon="calendar-days"
                    title="No classes this week"
                    [description]="mineOnly() ? 'You have no classes this week. Turn off “My classes” to see the whole timetable.' : ''"
                />
            </fm-card>
        } @else {
            <ng-template #count let-s>
                <span
                    class="shrink-0 tabular-nums"
                    [class.font-semibold]="s.booked >= s.capacity"
                    [class.text-danger-fg]="s.booked >= s.capacity"
                    [class.text-fg-muted]="s.booked < s.capacity"
                >
                    {{ s.booked }}/{{ s.capacity }}{{ s.waitlist ? ' +' + s.waitlist : '' }}
                </span>
            </ng-template>
            <!-- Desktop week grid -->
            <div class="hidden overflow-x-auto rounded-[var(--radius-panel)] border border-border bg-surface lg:block">
                <div class="grid min-w-[56rem] grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
                    <div class="border-b border-border"></div>
                    @for (d of days(); track d.date) {
                        <div class="border-b border-l border-border px-2 py-2 text-center text-sm" [class.bg-accent-soft]="d.date === today">
                            <span class="font-semibold">{{ d.label }}</span>
                            <span class="block text-xs text-fg-subtle">{{ d.sub }}</span>
                        </div>
                    }
                    <div class="relative" [style.height.px]="gridHeight">
                        @for (h of hours; track h) {
                            <span class="absolute right-2 -translate-y-1/2 text-xs text-fg-subtle" [style.top.px]="(h - firstHour) * hourPx">
                                {{ hourLabel(h) }}
                            </span>
                        }
                    </div>
                    @for (d of days(); track d.date) {
                        <div class="relative border-l border-border" [style.height.px]="gridHeight">
                            @for (h of hours; track h) {
                                <span class="absolute inset-x-0 border-t border-dashed border-border" [style.top.px]="(h - firstHour) * hourPx"></span>
                            }
                            @for (s of d.sessions; track s.oid) {
                                <button
                                    class="fm-focusable absolute overflow-hidden rounded-md border-l-4 px-2 py-1 text-left text-xs transition hover:brightness-95"
                                    type="button"
                                    [attr.aria-label]="sessionLabel(s)"
                                    [attr.title]="sessionLabel(s)"
                                    [class]="colors[s.color]"
                                    [style.height.px]="height(s)"
                                    [style.left]="laneLeft(d.lanes, s)"
                                    [style.top.px]="top(s)"
                                    [style.width]="laneWidth(d.lanes, s)"
                                    (click)="open(s)"
                                >
                                    <!-- Two lines, so a 45-minute card still shows the booked count. A full-width card: title + count, then
                                         time · room. A card split with an overlapping class: title, then count (its place on the grid gives the time). -->
                                    @let narrow = (d.lanes.get(s.oid)?.of ?? 1) > 1;
                                    <span class="flex items-baseline gap-1.5">
                                        <span class="min-w-0 flex-1 truncate font-semibold text-fg">{{ s.title }}</span>
                                        @if (!narrow) {
                                            <ng-container *ngTemplateOutlet="count; context: { $implicit: s }" />
                                        }
                                    </span>
                                    <span class="flex items-baseline gap-1 truncate text-fg-muted">
                                        @if (narrow) {
                                            <ng-container *ngTemplateOutlet="count; context: { $implicit: s }" />
                                        } @else {
                                            {{ s.starts_at | appDate: 'h:mm' }} · {{ s.room }}
                                        }
                                    </span>
                                </button>
                            }
                        </div>
                    }
                </div>
            </div>
            <!-- Phones: a list per day -->
            <div class="flex flex-col gap-4 lg:hidden">
                @for (d of days(); track d.date) {
                    @if (d.sessions.length) {
                        <section [attr.aria-label]="d.label + ' ' + d.sub">
                            <h2 class="mb-2 text-sm font-semibold" [class.text-accent]="d.date === today">{{ d.label }} {{ d.sub }}</h2>
                            <ul class="flex flex-col gap-2">
                                @for (s of d.sessions; track s.oid) {
                                    <li>
                                        <button
                                            class="fm-focusable flex w-full items-center gap-3 rounded-lg border-l-4 px-3 py-2.5 text-left"
                                            type="button"
                                            [class]="colors[s.color]"
                                            (click)="open(s)"
                                        >
                                            <span class="w-16 shrink-0 text-sm font-semibold tabular-nums">{{ s.starts_at | appDate: 'h:mm a' }}</span>
                                            <span class="min-w-0 flex-1">
                                                <span class="block truncate font-medium">{{ s.title }}</span>
                                                <span class="block truncate text-xs text-fg-muted">{{ s.trainer_name }} · {{ s.room }}</span>
                                            </span>
                                            <span class="text-xs tabular-nums">{{ s.booked }}/{{ s.capacity }}</span>
                                        </button>
                                    </li>
                                }
                            </ul>
                        </section>
                    }
                }
            </div>
        }

        <fm-dialog
            size="drawer"
            [description]="selected() ? (selected()!.starts_at | appDate: 'EEEE d MMM, h:mm a') + ' · ' + selected()!.room : ''"
            [title]="selected()?.title ?? 'Class'"
            [(open)]="drawerOpen"
        >
            @if (detail.value(); as s) {
                <div class="flex flex-col gap-5">
                    <div class="flex flex-wrap gap-2 text-sm">
                        <fm-badge>
                            <fm-icon name="user" size="0.875rem" />
                            {{ s.trainer_name }}
                        </fm-badge>
                        <fm-badge [tone]="s.booked >= s.capacity ? 'danger' : 'success'">{{ s.booked }} of {{ s.capacity }} booked</fm-badge>
                        @if (s.ladies_only) {
                            <fm-badge tone="primary">Ladies only</fm-badge>
                        }
                    </div>

                    @if (!past(s)) {
                        <div *appCan="'create'; on: 'Booking'" class="relative">
                            <fm-field label="Book a member">
                                <fm-icon class="text-fg-subtle" name="search" fmPrefix />
                                <input
                                    autocomplete="off"
                                    fmInput
                                    placeholder="Name, phone or member code"
                                    [ngModel]="bookQuery()"
                                    (ngModelChange)="bookQuery.set($event)"
                                />
                            </fm-field>
                            @if (matches().length) {
                                <ul class="mt-1 flex flex-col rounded-lg border border-border" aria-label="Matching members">
                                    @for (m of matches(); track m.oid) {
                                        <li class="flex items-center gap-3 border-b border-border px-3 py-2 last:border-0">
                                            <span class="min-w-0 flex-1 text-sm">
                                                <span class="block truncate">{{ m.name }}</span>
                                                <span class="text-xs text-fg-subtle">{{ m.code }} · {{ m.status }}</span>
                                            </span>
                                            <button fmButton size="sm" variant="primary" [loading]="busy() === m.oid" (click)="book(m)">Book</button>
                                        </li>
                                    }
                                </ul>
                            }
                        </div>
                    }

                    <section aria-labelledby="roster-h">
                        <h3 id="roster-h" class="mb-2 text-sm font-semibold">Roster ({{ s.roster.length }})</h3>
                        <ul class="flex flex-col divide-y divide-border rounded-lg border border-border">
                            @for (b of s.roster; track b.oid) {
                                <li class="flex items-center gap-2 px-3 py-2">
                                    <span class="min-w-0 flex-1 text-sm">
                                        <span class="block truncate">{{ b.member_name }}</span>
                                        <span class="text-xs text-fg-subtle">{{ b.member_code }}</span>
                                    </span>
                                    @if (b.status === 'Booked') {
                                        <span *appCan="'update'; on: 'Booking'" class="flex gap-1">
                                            <button
                                                fmButton
                                                size="sm"
                                                [attr.aria-label]="'Mark ' + b.member_name + ' attended'"
                                                [loading]="busy() === b.oid"
                                                (click)="mark(b.oid, 'Attended')"
                                            >
                                                <fm-icon name="check" size="1rem" />
                                            </button>
                                            <button
                                                fmButton
                                                size="sm"
                                                variant="ghost"
                                                [attr.aria-label]="'Mark ' + b.member_name + ' no-show'"
                                                (click)="mark(b.oid, 'NoShow')"
                                            >
                                                <fm-icon name="x" size="1rem" />
                                            </button>
                                        </span>
                                    } @else {
                                        <fm-badge [tone]="b.status === 'Attended' ? 'success' : 'warning'">
                                            {{ b.status === 'NoShow' ? 'No-show' : b.status }}
                                        </fm-badge>
                                    }
                                </li>
                            } @empty {
                                <li class="px-3 py-4 text-sm text-fg-muted">No bookings yet.</li>
                            }
                        </ul>
                    </section>

                    @if (s.waitlisted.length) {
                        <section aria-labelledby="wait-h">
                            <h3 id="wait-h" class="mb-2 text-sm font-semibold">Waitlist ({{ s.waitlisted.length }})</h3>
                            <ol class="flex flex-col divide-y divide-border rounded-lg border border-border">
                                @for (b of s.waitlisted; track b.oid; let i = $index) {
                                    <li class="flex items-center gap-2 px-3 py-2">
                                        <span class="w-5 text-xs text-fg-subtle">{{ i + 1 }}.</span>
                                        <span class="min-w-0 flex-1 truncate text-sm">{{ b.member_name }}</span>
                                        <button
                                            *appCan="'update'; on: 'Booking'"
                                            fmButton
                                            size="sm"
                                            [disabled]="s.booked >= s.capacity"
                                            [loading]="busy() === b.oid"
                                            (click)="mark(b.oid, 'Booked')"
                                        >
                                            Move in
                                        </button>
                                    </li>
                                }
                            </ol>
                            @if (s.booked >= s.capacity) {
                                <p class="mt-1 text-xs text-fg-subtle">The class is full: mark a no-show or cancel a booking to move someone in.</p>
                            }
                        </section>
                    }
                </div>
            } @else {
                <fm-skeleton height="12rem" />
            }
        </fm-dialog>
    `
})
export class ClassesPageComponent {
    private readonly _service = inject(ConsoleService);
    private readonly _router = inject(Router);
    private readonly _route = inject(ActivatedRoute);
    protected readonly auth = inject(AuthService);

    readonly week = input<string>();

    protected readonly today = todayIso();
    protected readonly colors = COLORS;
    protected readonly firstHour = FIRST_HOUR;
    protected readonly hourPx = HOUR_PX;
    protected readonly hours = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i);
    protected readonly gridHeight = (LAST_HOUR - FIRST_HOUR) * HOUR_PX;

    protected readonly mine = signal<boolean | null>(null);
    protected readonly selected = signal<ClassSession | null>(null);
    protected readonly drawerOpen = signal(false);
    protected readonly bookQuery = signal('');
    protected readonly busy = signal<string | null>(null);
    private readonly _matches = signal<MemberListItem[]>([]);
    protected readonly matches = this._matches.asReadonly();

    protected readonly data = rxResource({ params: () => this.week() ?? this.today, stream: ({ params }) => this._service.schedule(params) });
    protected readonly detail = rxResource({ params: () => this.selected()?.oid, stream: ({ params }) => this._service.session(params) });

    /** Trainers start on their own classes. */
    protected readonly mineOnly = computed(() => this.mine() ?? !!this.data.value()?.my_trainer_oid);
    protected readonly sessions = computed(() => {
        const d = this.data.value();
        if (!d) return [];
        return this.mineOnly() && d.my_trainer_oid ? d.sessions.filter(s => s.trainer_oid === d.my_trainer_oid) : d.sessions;
    });
    protected readonly days = computed(() => {
        const d = this.data.value();
        if (!d) return [];
        return Array.from({ length: 7 }, (_, i) => {
            const date = format(addDays(parseISO(d.from), i), 'yyyy-MM-dd');
            return {
                date,
                label: format(parseISO(date), 'EEE'),
                sub: format(parseISO(date), 'd MMM'),
                sessions: this.sessions().filter(s => s.starts_at.startsWith(date))
            };
        }).map(day => ({ ...day, lanes: lanes(day.sessions) }));
    });
    protected readonly rangeLabel = computed(() => {
        const d = this.data.value();
        return d ? `${format(parseISO(d.from), 'd MMM')} – ${format(parseISO(d.to), 'd MMM yyyy')}` : '';
    });

    constructor() {
        toObservable(this.bookQuery)
            .pipe(
                debounceTime(250),
                map(q => q.trim()),
                switchMap(q =>
                    q.length < 2
                        ? of([])
                        : this._service.members({ q, size: 5, status: 'Active' }).pipe(
                              map(p => p.rows),
                              catchError(() => of([]))
                          )
                ),
                takeUntilDestroyed()
            )
            .subscribe(rows => this._matches.set(rows));
    }

    protected hourLabel(h: number): string {
        return `${((h + 11) % 12) + 1} ${h < 12 ? 'am' : 'pm'}`;
    }

    protected top(s: ClassSession): number {
        const [h, m] = s.starts_at.slice(11, 16).split(':').map(Number);
        return (h - FIRST_HOUR + m / 60) * HOUR_PX;
    }

    protected height(s: ClassSession): number {
        return Math.max(40, ((Date.parse(s.ends_at) - Date.parse(s.starts_at)) / 3_600_000) * HOUR_PX - 2);
    }

    /** Overlapping classes sit side by side: each takes 1/n of the column, 4px gutters. */
    protected laneLeft(layout: Map<string, Lane>, s: ClassSession): string {
        const l = layout.get(s.oid) ?? { lane: 0, of: 1 };
        return `calc(${(l.lane * 100) / l.of}% + 4px)`;
    }

    protected laneWidth(layout: Map<string, Lane>, s: ClassSession): string {
        const l = layout.get(s.oid) ?? { lane: 0, of: 1 };
        return `calc(${100 / l.of}% - 8px)`;
    }

    protected sessionLabel(s: ClassSession): string {
        return `${s.title}, ${s.starts_at.slice(11, 16)}, ${s.room}, ${s.trainer_name}, ${s.booked} of ${s.capacity} booked${s.waitlist ? `, ${s.waitlist} waiting` : ''}`;
    }

    protected past(s: ClassSession): boolean {
        return s.starts_at.slice(0, 10) < this.today;
    }

    protected go(days: number): void {
        const from = this.data.value()?.from ?? this.today;
        this._setWeek(format(addDays(parseISO(from), days), 'yyyy-MM-dd'));
    }

    protected goToday(): void {
        this._setWeek(null);
    }

    protected open(s: ClassSession): void {
        this.selected.set(s);
        this.bookQuery.set('');
        this.drawerOpen.set(true);
    }

    protected book(m: MemberListItem): void {
        const s = this.selected();
        if (!s) return;
        this.busy.set(m.oid);
        this._service.book(s.oid, m.oid).subscribe({ next: () => this._after(), error: () => this.busy.set(null) });
    }

    protected mark(oid: string, status: 'Booked' | 'Attended' | 'NoShow'): void {
        this.busy.set(oid);
        this._service.setBooking(oid, status).subscribe({ next: () => this._after(), error: () => this.busy.set(null) });
    }

    private _after(): void {
        this.busy.set(null);
        this.bookQuery.set('');
        this.detail.reload();
        this.data.reload();
    }

    private _setWeek(week: string | null): void {
        void this._router.navigate([], { relativeTo: this._route, queryParams: { week }, queryParamsHandling: 'merge', replaceUrl: true });
    }
}
