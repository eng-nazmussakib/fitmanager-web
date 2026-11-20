import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { addDays, format } from 'date-fns';
import { of } from 'rxjs';

import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { AlertComponent, AvatarComponent, BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';
import { todayIso } from '@shared/ui/forms/date-picker.component';

import { PortalService } from './portal.service';

/**
 * `/me/pt` (D-079): the member's trainer and PT package, a free hour to book in the next 7 days (from the trainer's
 * availability, less their classes and other sessions), and their sessions. A cancel less than the window before
 * uses the session; the window is said on the page.
 */
@Component({
    selector: 'app-portal-pt',
    imports: [AppDatePipe, ButtonComponent, AlertComponent, AvatarComponent, BadgeComponent, CardComponent, SkeletonComponent, EmptyStateComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <h1 class="mb-4 text-xl font-semibold">Personal training</h1>
        @if (data.value(); as d) {
            @if (d.trainer; as t) {
                <fm-card>
                    <div class="flex items-center gap-3">
                        <fm-avatar size="3.5rem" [name]="t.name" [src]="t.photo_url" />
                        <div class="min-w-0 flex-1">
                            <p class="text-sm text-fg-muted">Your trainer</p>
                            <p class="font-semibold">{{ t.name }}</p>
                            <p class="truncate text-sm text-fg-subtle">{{ t.headline ?? t.specialties.join(', ') }}</p>
                        </div>
                    </div>
                </fm-card>
            } @else {
                <fm-alert title="No trainer yet" tone="info">Ask the front desk to assign one; then you can book sessions here.</fm-alert>
            }

            <div class="mt-4 grid gap-3 sm:grid-cols-2">
                @for (p of d.packages; track p.oid) {
                    <fm-card>
                        <p class="text-sm text-fg-muted">{{ p.plan_name }}</p>
                        <p class="mt-1 text-2xl font-semibold">
                            {{ p.left }}
                            <span class="text-base font-normal text-fg-muted">of {{ p.sessions }} left</span>
                        </p>
                        <p class="text-xs text-fg-subtle">Use by {{ p.end_date | appDate }}</p>
                    </fm-card>
                } @empty {
                    <fm-card class="sm:col-span-2">
                        <fm-empty-state description="Buy one at the front desk: 1, 8 or 16 sessions." icon="dumbbell" title="No PT package" />
                    </fm-card>
                }
            </div>

            @if (d.trainer && left() > 0) {
                <h2 class="mt-6 mb-3 font-semibold">Book a session</h2>
                <div class="mb-3 flex gap-2 overflow-x-auto pb-1" aria-label="Day" role="group">
                    @for (day of days; track day.date) {
                        <button
                            class="shrink-0"
                            fmButton
                            size="sm"
                            [attr.aria-pressed]="date() === day.date"
                            [variant]="date() === day.date ? 'primary' : 'secondary'"
                            (click)="pickDay(day.date)"
                        >
                            {{ day.label }}
                        </button>
                    }
                </div>
                @if (slots.isLoading()) {
                    <fm-skeleton height="2.5rem" />
                } @else if (slots.value()?.slots?.length) {
                    <div class="flex flex-wrap gap-2">
                        @for (s of slots.value()!.slots; track s) {
                            <button fmButton size="sm" [loading]="busy() === s" (click)="book(s)">{{ label12(s) }}</button>
                        }
                    </div>
                } @else {
                    <p class="text-sm text-fg-subtle">{{ d.trainer.name }} has no free hour that day.</p>
                }
            }

            <h2 class="mt-6 mb-3 font-semibold">My sessions</h2>
            <fm-card flush>
                <ul class="divide-y divide-border">
                    @for (p of d.upcoming; track p.oid) {
                        <li class="flex items-center gap-3 px-5 py-3">
                            <span class="min-w-0 flex-1">
                                <span class="block font-medium">{{ p.starts_at | appDate: 'EEE d MMM, h:mm a' }}</span>
                                <span class="block text-sm text-fg-muted">{{ p.trainer_name }}</span>
                            </span>
                            <button fmButton size="sm" variant="ghost" [loading]="busy() === p.oid" (click)="cancel(p.oid)">Cancel</button>
                        </li>
                    }
                    @for (p of d.past; track p.oid) {
                        <li class="flex items-center gap-3 px-5 py-3 text-fg-muted">
                            <span class="min-w-0 flex-1 text-sm">{{ p.starts_at | appDate: 'EEE d MMM, h:mm a' }} · {{ p.trainer_name }}</span>
                            <fm-badge [tone]="p.status === 'Completed' ? 'success' : p.status === 'NoShow' ? 'warning' : 'neutral'">
                                {{ p.status === 'NoShow' ? 'Missed' : p.status === 'Completed' ? 'Done' : 'Cancelled' }}
                            </fm-badge>
                        </li>
                    }
                    @if (!d.upcoming.length && !d.past.length) {
                        <li class="px-5 py-6 text-sm text-fg-muted">No sessions yet.</li>
                    }
                </ul>
            </fm-card>
            <p class="mt-2 text-xs text-fg-subtle">Cancel at least {{ d.cancel_hours }} hours before; later, the session counts as used.</p>
        } @else {
            <fm-skeleton height="14rem" />
        }
    `
})
export class PortalPtComponent {
    private readonly _service = inject(PortalService);
    protected readonly today = todayIso();
    protected readonly days = Array.from({ length: 7 }, (_, i) => {
        const d = addDays(new Date(`${this.today}T12:00:00`), i);
        return { date: format(d, 'yyyy-MM-dd'), label: i === 0 ? 'Today' : format(d, 'EEE d') };
    });
    protected readonly data = rxResource({ stream: () => this._service.pt() });
    protected readonly date = signal(this.today);
    protected readonly left = computed(() => (this.data.value()?.packages ?? []).reduce((n, p) => n + p.left, 0));
    protected readonly slots = rxResource({
        params: () => ({ date: this.date(), ok: !!this.data.value()?.trainer && this.left() > 0 }),
        stream: ({ params }) => (params.ok ? this._service.ptSlots(params.date) : of(null))
    });
    protected readonly busy = signal<string | null>(null);

    protected label12(hhmm: string): string {
        const [h = 0, m = 0] = hhmm.split(':').map(Number);
        return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
    }

    protected pickDay(date: string): void {
        this.date.set(date);
    }

    protected book(time: string): void {
        this.busy.set(time);
        this._service.bookPt(this.date(), time).subscribe({ next: () => this._done(), error: () => this.busy.set(null) });
    }

    protected cancel(oid: string): void {
        this.busy.set(oid);
        this._service.cancelPt(oid).subscribe({ next: () => this._done(), error: () => this.busy.set(null) });
    }

    private _done(): void {
        this.busy.set(null);
        this.data.reload();
        this.slots.reload();
    }
}
