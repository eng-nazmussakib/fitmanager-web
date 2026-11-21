import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import type { Invoice } from '@core/models/payment.model';
import { InvoiceViewComponent } from '@features/shared/invoice-view.component';
import { ME, TrainingService } from '@features/training/training.service';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { TakaPipe } from '@shared/pipes/taka.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogComponent } from '@shared/ui/dialog/dialog.component';
import { BarcodeComponent } from '@shared/ui/display/barcode.component';
import { AlertComponent, BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { PortalService } from './portal.service';
import { PortalFeedbackCardComponent } from './portal-governance.component';

/** H6 home: the membership card (with the code as a barcode for the desk scanner), dues, the next workout, next class. */
@Component({
    selector: 'app-portal-home',
    imports: [
        RouterLink,
        AppDatePipe,
        TakaPipe,
        BarcodeComponent,
        AlertComponent,
        BadgeComponent,
        CardComponent,
        SkeletonComponent,
        IconComponent,
        PortalFeedbackCardComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (summary.value(); as s) {
            <h1 class="mb-4 text-xl font-semibold">Hi, {{ s.member.name.split(' ')[0] }}</h1>
            <section class="relative overflow-hidden rounded-[var(--radius-panel)] bg-ink-900 p-5 text-white shadow-e5" aria-label="Membership card">
                <div class="pointer-events-none absolute -top-16 -right-16 size-56 rounded-full bg-primary-500/30 blur-3xl" aria-hidden="true"></div>
                <div class="relative flex items-start justify-between gap-3">
                    <div>
                        <p class="text-xs tracking-wider text-white/60 uppercase">{{ s.member.branch_name }} branch</p>
                        <p class="mt-1 text-lg font-semibold">{{ s.subscription?.plan_name ?? 'No plan' }}</p>
                    </div>
                    <fm-badge [tone]="s.member.status === 'Active' ? 'success' : s.member.status === 'Frozen' ? 'info' : 'danger'">
                        {{ s.member.status }}
                    </fm-badge>
                </div>
                @if (s.days_left !== null && s.days_total) {
                    <div class="relative mt-4">
                        <div class="flex justify-between text-sm">
                            <span>{{ s.days_left >= 0 ? s.days_left + ' days left' : 'Expired' }}</span>
                            <span class="text-white/60">until {{ s.subscription!.end_date | appDate }}</span>
                        </div>
                        <div
                            class="mt-1.5 h-2 overflow-hidden rounded-full bg-white/15"
                            aria-label="Days left"
                            aria-valuemin="0"
                            role="progressbar"
                            [attr.aria-valuemax]="s.days_total"
                            [attr.aria-valuenow]="clamp(s.days_left, s.days_total)"
                        >
                            <span
                                class="block h-full rounded-full bg-primary-500"
                                [style.width.%]="(clamp(s.days_left, s.days_total) / s.days_total) * 100"
                            ></span>
                        </div>
                    </div>
                }
                <div class="relative mt-5 flex justify-center">
                    <fm-barcode class="w-full max-w-xs" [value]="s.member.code" />
                </div>
                <p class="relative mt-2 text-center text-xs text-white/60">Show this at the front desk to check in.</p>
            </section>

            @if (s.dues > 0) {
                <fm-alert class="mt-4" title="You have dues" tone="warning">
                    {{ s.dues | taka: 0 }} is unpaid. Pay at the front desk; check-in is blocked above the branch limit.
                </fm-alert>
            }

            <div class="mt-4 grid gap-4 sm:grid-cols-3">
                <fm-card>
                    <p class="text-sm text-fg-muted">Streak</p>
                    <p class="mt-1 flex items-center gap-1.5 text-2xl font-semibold">
                        <fm-icon class="text-primary-500" name="flame" />
                        {{ s.streak_days }} day{{ s.streak_days === 1 ? '' : 's' }}
                    </p>
                </fm-card>
                <fm-card>
                    <p class="text-sm text-fg-muted">Visits this month</p>
                    <p class="mt-1 text-2xl font-semibold">{{ s.visits_this_month }}</p>
                </fm-card>
                <fm-card>
                    <p class="text-sm text-fg-muted">Next class</p>
                    @if (s.next_booking; as b) {
                        <p class="mt-1 font-semibold">{{ b.session.title }}</p>
                        <p class="text-sm text-fg-muted">{{ b.session.starts_at | appDate: 'EEE d MMM, h:mm a' }}</p>
                    } @else {
                        <a class="mt-1 inline-block text-sm text-accent" routerLink="bookings">Book a class</a>
                    }
                </fm-card>
            </div>
            @if (routine.value()?.current; as r) {
                @let next = r.days[r.next_day ?? 0];
                <a
                    class="mt-4 block rounded-[var(--radius-panel)] border border-border bg-surface p-5 text-fg no-underline hover:border-fg-subtle"
                    routerLink="routine"
                >
                    <p class="text-sm text-fg-muted">Next workout</p>
                    <p class="mt-1 font-semibold">{{ next.name }}: {{ r.name }}</p>
                    <p class="text-sm text-fg-subtle">
                        {{ next.exercises.length }} exercises{{ r.last_workout_on ? ' · last one ' + (r.last_workout_on | appDate: 'EEE d MMM') : '' }}
                    </p>
                </a>
            }
            <app-portal-feedback-card />
        } @else {
            <fm-skeleton height="15rem" />
            <fm-skeleton class="mt-4" height="5rem" />
        }
    `
})
export class PortalHomeComponent {
    private readonly _service = inject(PortalService);

    protected readonly summary = rxResource({ stream: () => this._service.summary() });
    private readonly _training = inject(TrainingService);
    protected readonly routine = rxResource({ stream: () => this._training.routine(ME) });

    protected clamp(left: number, total: number): number {
        return Math.max(0, Math.min(left, total));
    }
}

/**
 * H6 bookings (D-081): my upcoming classes and what is open to book (7 days ahead by default). Cancelling inside the
 * window counts like a missed class, and missing too many pauses booking for a while: both are said up front.
 */
@Component({
    selector: 'app-portal-bookings',
    imports: [AppDatePipe, AlertComponent, ButtonComponent, BadgeComponent, CardComponent, SkeletonComponent, EmptyStateComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <h1 class="mb-4 text-xl font-semibold">Classes</h1>
        @if (data.value(); as d) {
            @if (d.rules.blocked_until) {
                <fm-alert class="mb-4" title="Booking is paused" tone="warning">
                    You missed several classes recently, so you can book again from {{ d.rules.blocked_until | appDate: 'EEE d MMM' }}.
                </fm-alert>
            }
            <p class="mb-3 text-sm text-fg-muted">
                Cancel at least {{ d.rules.cancel_hours }} hours before a class; later counts as a missed class. Up to {{ d.rules.max_active }} upcoming
                bookings.
            </p>
            <fm-card flush title="My bookings">
                @if (d.upcoming.length) {
                    <ul class="divide-y divide-border">
                        @for (b of d.upcoming; track b.oid) {
                            <li class="flex items-center gap-3 px-5 py-3">
                                <span class="min-w-0 flex-1">
                                    <span class="block font-medium">{{ b.session.title }}</span>
                                    <span class="block text-sm text-fg-muted">
                                        {{ b.session.starts_at | appDate: 'EEE d MMM, h:mm a' }} · {{ b.session.trainer_name }}
                                    </span>
                                </span>
                                @if (b.status === 'Waitlist') {
                                    <fm-badge tone="warning">Waitlist</fm-badge>
                                }
                                <button fmButton size="sm" variant="ghost" [loading]="busy() === b.oid" (click)="cancel(b.oid)">Cancel</button>
                            </li>
                        }
                    </ul>
                } @else {
                    <fm-empty-state icon="calendar-days" title="No upcoming classes" />
                }
            </fm-card>
            <h2 class="mt-6 mb-3 font-semibold">Book a class</h2>
            <ul class="grid gap-3 sm:grid-cols-2">
                @for (s of d.available; track s.oid) {
                    <li class="flex items-center gap-3 rounded-[var(--radius-panel)] border border-border bg-surface p-4">
                        <span class="min-w-0 flex-1">
                            <span class="block font-medium">{{ s.title }}{{ s.ladies_only ? ' (ladies)' : '' }}</span>
                            <span class="block text-sm text-fg-muted">{{ s.starts_at | appDate: 'EEE d MMM, h:mm a' }}</span>
                            <span class="block text-xs text-fg-subtle">
                                {{ s.trainer_name }} · {{ s.capacity - s.booked > 0 ? s.capacity - s.booked + ' places left' : 'Full: join the waitlist' }}
                            </span>
                        </span>
                        @if (booked(s.oid)) {
                            <fm-badge tone="success">Booked</fm-badge>
                        } @else {
                            <button
                                fmButton
                                size="sm"
                                [loading]="busy() === s.oid"
                                [variant]="s.booked < s.capacity ? 'primary' : 'secondary'"
                                (click)="book(s.oid)"
                            >
                                {{ s.booked < s.capacity ? 'Book' : 'Waitlist' }}
                            </button>
                        }
                    </li>
                }
            </ul>
        } @else {
            <fm-skeleton height="12rem" />
        }
    `
})
export class PortalBookingsComponent {
    private readonly _service = inject(PortalService);

    protected readonly data = rxResource({ stream: () => this._service.bookings() });
    protected readonly busy = signal<string | null>(null);

    protected booked(sessionOid: string): boolean {
        return !!this.data.value()?.upcoming.some(b => b.session_oid === sessionOid);
    }

    protected book(oid: string): void {
        this.busy.set(oid);
        this._service.book(oid).subscribe({ next: () => this._done(), error: () => this.busy.set(null) });
    }

    protected cancel(oid: string): void {
        this.busy.set(oid);
        this._service.cancel(oid).subscribe({ next: () => this._done(), error: () => this.busy.set(null) });
    }

    private _done(): void {
        this.busy.set(null);
        this.data.reload();
    }
}

/** H6 payments: invoice history with receipt, PDF and print. */
@Component({
    selector: 'app-portal-payments',
    imports: [
        AppDatePipe,
        TakaPipe,
        ButtonComponent,
        BadgeComponent,
        CardComponent,
        SkeletonComponent,
        DialogComponent,
        EmptyStateComponent,
        InvoiceViewComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <h1 class="mb-4 text-xl font-semibold">Payments</h1>
        @if (invoices.value(); as list) {
            @if (list.length) {
                <ul class="flex flex-col gap-3">
                    @for (inv of list; track inv.oid) {
                        <li class="flex items-center gap-3 rounded-[var(--radius-panel)] border border-border bg-surface p-4">
                            <span class="min-w-0 flex-1">
                                <span class="block font-medium">
                                    {{ inv.kind === 'pos' ? 'Shop: ' + inv.lines[0].label + (inv.lines.length > 1 ? ' and more' : '') : inv.lines[0].label }}
                                </span>
                                <span class="block text-sm text-fg-muted">{{ inv.issued_at | appDate }} · {{ inv.number }}</span>
                            </span>
                            <span class="text-right">
                                <span class="block font-semibold tabular-nums">{{ inv.total | taka: 0 }}</span>
                                <fm-badge [tone]="inv.status === 'Paid' ? 'success' : 'warning'">{{ inv.status }}</fm-badge>
                            </span>
                            <button fmButton size="sm" variant="ghost" [attr.aria-label]="'Receipt ' + inv.number" (click)="open.set(inv)">Receipt</button>
                        </li>
                    }
                </ul>
            } @else {
                <fm-card><fm-empty-state icon="receipt" title="No payments yet" /></fm-card>
            }
        } @else {
            <fm-skeleton height="12rem" />
        }
        <fm-dialog size="lg" title="Receipt" [open]="!!open()" (openChange)="!$event && open.set(null)">
            @if (open(); as inv) {
                <app-invoice-view [invoice]="inv" />
            }
        </fm-dialog>
    `
})
export class PortalPaymentsComponent {
    private readonly _service = inject(PortalService);

    protected readonly invoices = rxResource({ stream: () => this._service.payments() });
    protected readonly open = signal<Invoice | null>(null);
}
