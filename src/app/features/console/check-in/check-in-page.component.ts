import { isPlatformBrowser } from '@angular/common';
import { afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, PLATFORM_ID, signal, viewChild } from '@angular/core';
import { rxResource, takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, debounceTime, distinctUntilChanged, interval, map, of, switchMap } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import type { AccessDecision } from '@core/models/attendance.model';
import type { MemberListItem } from '@core/models/member.model';
import { StorageService } from '@core/services/storage.service';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { TakaPipe } from '@shared/pipes/taka.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogComponent } from '@shared/ui/dialog/dialog.component';
import { DialogFooterDirective } from '@shared/ui/dialog/dialog-shell.component';
import { AvatarComponent, BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';
import { FieldComponent, InputDirective, PrefixDirective } from '@shared/ui/forms/field.component';
import { SwitchComponent } from '@shared/ui/forms/switch.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { ConsoleService } from '../console.service';

/** Member codes as printed on the cards: MEM-GUL-000123. A scanner types the code and Enter. */
const CODE = /^MEM-[A-Z]{3}-\d{6}$/i;
const AUTO_KEY = 'app.checkin-auto';

/**
 * H3: the front desk check-in. Built for a USB barcode scanner (it types like a keyboard, D-010): the search field
 * keeps focus, an exact member code is evaluated at once, and with "Check in automatically" an allowed member is
 * checked in with no click. The access rules come from the API (mock/domain/access-rules.ts); a blocked member shows
 * every failed rule, and a manager can override with a reason, which is recorded on the check-in and the timeline.
 */
@Component({
    selector: 'app-check-in-page',
    imports: [
        FormsModule,
        RouterLink,
        PageHeaderComponent,
        AppDatePipe,
        TakaPipe,
        ButtonComponent,
        AvatarComponent,
        BadgeComponent,
        CardComponent,
        SkeletonComponent,
        DialogComponent,
        DialogFooterDirective,
        EmptyStateComponent,
        FieldComponent,
        InputDirective,
        PrefixDirective,
        SwitchComponent,
        IconComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-page-header subtitle="Scan a member card or type a name, phone or member code." title="Check-in">
            <fm-card class="min-w-56" aria-live="polite">
                <p class="text-xs text-fg-muted">Inside now</p>
                <p class="mt-0.5 flex items-baseline gap-1 text-2xl font-semibold tabular-nums">
                    {{ occupancy.value()?.inside ?? '–' }}
                    <span class="text-sm font-normal text-fg-subtle">/ {{ occupancy.value()?.capacity ?? '–' }}</span>
                </p>
                <div class="fm-progress mt-2" aria-hidden="true">
                    <span
                        [style.--fm-progress-color]="
                            occupancyPct() > 85 ? 'var(--color-danger)' : occupancyPct() > 65 ? 'var(--color-warning)' : 'var(--color-success)'
                        "
                        [style.width.%]="occupancyPct()"
                    ></span>
                </div>
                <p class="mt-1 text-xs text-fg-subtle">{{ occupancy.value()?.today ?? 0 }} visits today</p>
            </fm-card>
        </app-page-header>

        <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <div class="flex min-w-0 flex-col gap-4">
                <div class="relative">
                    <fm-field label="Member">
                        <fm-icon class="text-fg-subtle" name="scan-line" fmPrefix />
                        <input
                            #search
                            aria-autocomplete="list"
                            aria-controls="checkin-suggestions"
                            autocomplete="off"
                            enterkeyhint="search"
                            fmInput
                            placeholder="Scan the card, or type a name, phone or MEM-…"
                            role="combobox"
                            size="lg"
                            spellcheck="false"
                            style="--fm-prefix-w: 2.75rem"
                            [attr.aria-activedescendant]="activeId()"
                            [attr.aria-expanded]="suggestions().length > 0"
                            [ngModel]="query()"
                            (keydown)="onKey($event)"
                            (ngModelChange)="query.set($event)"
                        />
                    </fm-field>
                    @if (suggestions().length) {
                        <ul
                            id="checkin-suggestions"
                            class="fm-popover absolute inset-x-0 top-full z-[var(--z-dropdown)] mt-1 max-w-none"
                            aria-label="Matching members"
                            role="listbox"
                        >
                            @for (m of suggestions(); track m.oid; let i = $index) {
                                <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -- the combobox input handles the keys (aria-activedescendant) -->
                                <li
                                    class="fm-option"
                                    role="option"
                                    [attr.aria-selected]="i === active()"
                                    [attr.data-active]="i === active() ? '' : null"
                                    [id]="'checkin-opt-' + i"
                                    (click)="choose(m)"
                                    (mousedown)="$event.preventDefault()"
                                >
                                    <fm-avatar size="2rem" [name]="m.name" [src]="m.photo_url" />
                                    <span class="min-w-0 flex-1">
                                        <span class="block truncate">{{ m.name }}</span>
                                        <span class="block truncate text-xs text-fg-subtle">{{ m.code }} · {{ m.phone }}</span>
                                    </span>
                                    <fm-badge [tone]="statusTone(m.status)">{{ m.status }}</fm-badge>
                                </li>
                            }
                        </ul>
                    }
                </div>
                <fm-switch [ngModel]="auto()" (ngModelChange)="setAuto($event)">Check in automatically when allowed</fm-switch>

                @if (evaluating()) {
                    <fm-card>
                        <div class="flex gap-4">
                            <fm-skeleton circle height="6rem" width="6rem" />
                            <div class="flex-1">
                                <fm-skeleton height="1.25rem" width="50%" />
                                <fm-skeleton class="mt-3" width="70%" />
                            </div>
                        </div>
                    </fm-card>
                } @else if (decision(); as d) {
                    <section
                        class="overflow-hidden rounded-[var(--radius-panel)] border-2 bg-surface"
                        aria-live="assertive"
                        [attr.aria-label]="d.allowed ? 'Allowed' : 'Blocked'"
                        [class.border-danger]="!d.allowed && !checkedIn()"
                        [class.border-success]="d.allowed || checkedIn()"
                    >
                        <div
                            class="flex items-center gap-3 px-5 py-3 text-lg font-semibold"
                            [class.bg-danger-soft]="!d.allowed && !checkedIn()"
                            [class.bg-success-soft]="d.allowed || checkedIn()"
                            [class.text-danger-fg]="!d.allowed && !checkedIn()"
                            [class.text-success-fg]="d.allowed || checkedIn()"
                        >
                            <fm-icon size="1.75rem" [name]="d.allowed || checkedIn() ? 'circle-check' : 'ban'" />
                            {{ checkedIn() ? 'Checked in' + (checkedIn() === 'override' ? ' (override)' : '') : d.allowed ? 'Allowed' : 'Blocked' }}
                        </div>
                        <div class="flex flex-col gap-5 p-5 sm:flex-row">
                            <fm-avatar class="self-center sm:self-start" size="7.5rem" [name]="d.member.name" [src]="d.member.photo_url" />
                            <div class="min-w-0 flex-1">
                                <h2 class="text-xl font-semibold">{{ d.member.name }}</h2>
                                <p class="text-sm text-fg-muted">{{ d.member.code }}</p>
                                <dl class="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                                    <div>
                                        <dt class="text-fg-subtle">Status</dt>
                                        <dd>
                                            <fm-badge dot [tone]="statusTone(d.member.status)">{{ d.member.status }}</fm-badge>
                                        </dd>
                                    </div>
                                    <div>
                                        <dt class="text-fg-subtle">Plan</dt>
                                        <dd>{{ d.member.plan_name ?? '–' }}</dd>
                                    </div>
                                    <div>
                                        <dt class="text-fg-subtle">Valid until</dt>
                                        <dd>{{ d.member.valid_until ? (d.member.valid_until | appDate) : '–' }}</dd>
                                    </div>
                                    <div>
                                        <dt class="text-fg-subtle">Dues</dt>
                                        <dd [class.text-danger-fg]="d.member.dues > 0">{{ d.member.dues | taka: 0 }}</dd>
                                    </div>
                                </dl>
                                @if (d.failures.length && !checkedIn()) {
                                    <ul class="mt-4 flex flex-col gap-2" aria-label="Reasons">
                                        @for (f of d.failures; track f.rule) {
                                            <li class="flex gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-fg">
                                                <fm-icon class="mt-0.5" name="triangle-alert" size="1rem" />
                                                <span class="flex-1">{{ f.message }}</span>
                                                @if (!f.overridable) {
                                                    <span class="text-xs opacity-80">no override</span>
                                                }
                                            </li>
                                        }
                                    </ul>
                                }
                                <div class="mt-5 flex flex-wrap gap-2">
                                    @if (!checkedIn()) {
                                        @if (d.allowed) {
                                            <button fmButton size="lg" variant="primary" [loading]="saving()" (click)="confirm()">
                                                <fm-icon name="log-in" />
                                                Check in
                                            </button>
                                        } @else if (d.can_override) {
                                            <button fmButton size="lg" variant="danger" (click)="overrideOpen.set(true)">
                                                <fm-icon name="shield-alert" />
                                                Override…
                                            </button>
                                        }
                                    }
                                    @if (hasRule(d, 'expired') || hasRule(d, 'membership') || hasRule(d, 'pending')) {
                                        <a fmButton size="lg" [routerLink]="['../members', d.member.oid, 'subscribe']">Renew membership</a>
                                    }
                                    @if (d.member.dues > 0) {
                                        <a fmButton size="lg" [queryParams]="{ tab: 'payments' }" [routerLink]="['../members', d.member.oid]">Take payment</a>
                                    }
                                    <a fmButton size="lg" variant="ghost" [routerLink]="['../members', d.member.oid]">Open profile</a>
                                </div>
                            </div>
                        </div>
                    </section>
                } @else if (notFound()) {
                    <fm-card><fm-empty-state icon="search" title="No member found" [description]="notFound()!" /></fm-card>
                } @else {
                    <fm-card>
                        <fm-empty-state
                            description="The result shows here: a green go, or the reasons a member is blocked."
                            icon="scan-line"
                            title="Waiting for a scan"
                        />
                    </fm-card>
                }
            </div>

            <fm-card flush title="Today" [subtitle]="(log.value()?.length ?? 0) + ' check-ins'">
                @if (log.value(); as rows) {
                    @if (rows.length) {
                        <ul class="max-h-[36rem] divide-y divide-border overflow-y-auto">
                            @for (c of rows; track c.oid) {
                                <li class="flex items-center gap-3 px-5 py-2.5">
                                    <fm-avatar size="2rem" [name]="c.member_name" [src]="c.photo_url" />
                                    <span class="min-w-0 flex-1">
                                        <a
                                            class="block truncate text-sm font-medium text-fg no-underline hover:underline"
                                            [routerLink]="['../members', c.member_oid]"
                                        >
                                            {{ c.member_name }}
                                        </a>
                                        <span class="block text-xs text-fg-subtle">
                                            {{ c.checked_in_at | appDate: 'h:mm a'
                                            }}{{ c.checked_out_at ? ' – ' + (c.checked_out_at | appDate: 'h:mm a') : '' }}
                                            @if (c.override) {
                                                ·
                                                <span class="text-warning-fg">override</span>
                                            }
                                        </span>
                                    </span>
                                    @if (!c.checked_out_at) {
                                        <button fmButton size="sm" [attr.aria-label]="'Check out ' + c.member_name" (click)="checkOut(c.oid)">Out</button>
                                    }
                                </li>
                            }
                        </ul>
                    } @else {
                        <fm-empty-state icon="clock" title="No check-ins yet today" />
                    }
                } @else {
                    <div class="p-5">
                        <fm-skeleton />
                        <fm-skeleton class="mt-3" />
                        <fm-skeleton class="mt-3" />
                    </div>
                }
            </fm-card>
        </div>

        <fm-dialog
            description="The check-in is recorded with your name and this reason, and shows on the member's timeline."
            size="sm"
            title="Override the block"
            [(open)]="overrideOpen"
        >
            <fm-field hint="At least 5 characters" label="Reason" required>
                <textarea fmInput placeholder="e.g. Promised to pay the dues tomorrow" [ngModel]="reason()" (ngModelChange)="reason.set($event)"></textarea>
            </fm-field>
            <ng-container fmDialogFooter>
                <button fmButton (click)="overrideOpen.set(false)">Cancel</button>
                <button fmButton variant="danger" [disabled]="reason().trim().length < 5" [loading]="saving()" (click)="confirm(true)">Check in anyway</button>
            </ng-container>
        </fm-dialog>
    `
})
export class CheckInPageComponent {
    private readonly _service = inject(ConsoleService);
    private readonly _storage = inject(StorageService);
    private readonly _browser = isPlatformBrowser(inject(PLATFORM_ID));
    private readonly _search = viewChild.required<ElementRef<HTMLInputElement>>('search');

    protected readonly auth = inject(AuthService);
    protected readonly query = signal('');
    protected readonly active = signal(0);
    protected readonly decision = signal<AccessDecision | null>(null);
    protected readonly evaluating = signal(false);
    protected readonly notFound = signal<string | null>(null);
    protected readonly checkedIn = signal<'yes' | 'override' | null>(null);
    protected readonly saving = signal(false);
    protected readonly overrideOpen = signal(false);
    protected readonly reason = signal('');
    protected readonly auto = signal(this._storage.get<boolean>(AUTO_KEY) ?? true);

    protected readonly log = rxResource({ stream: () => this._service.today() });
    protected readonly occupancy = rxResource({ stream: () => this._service.occupancy() });
    protected readonly occupancyPct = computed(() => {
        const o = this.occupancy.value();
        return o?.capacity ? Math.min(100, Math.round((o.inside / o.capacity) * 100)) : 0;
    });

    private readonly _suggestions = signal<MemberListItem[]>([]);
    protected readonly suggestions = this._suggestions.asReadonly();
    protected readonly activeId = computed(() => (this.suggestions().length ? `checkin-opt-${this.active()}` : null));

    constructor() {
        // Suggestions as the desk types (not for scanner codes, which are evaluated on Enter).
        toObservable(this.query)
            .pipe(
                map(q => q.trim()),
                debounceTime(250),
                distinctUntilChanged(),
                switchMap(q =>
                    q.length < 2 || CODE.test(q)
                        ? of([])
                        : this._service.members({ q, size: 6 }).pipe(
                              map(p => p.rows),
                              catchError(() => of([]))
                          )
                ),
                takeUntilDestroyed()
            )
            .subscribe(rows => {
                this._suggestions.set(rows);
                this.active.set(0);
            });
        // Live occupancy and log, every 30 s.
        if (this._browser)
            interval(30_000)
                .pipe(takeUntilDestroyed())
                .subscribe(() => this._refresh());
        // The field keeps focus between scans (unless a dialog is open).
        const destroyRef = inject(DestroyRef);
        afterNextRender(() => {
            this._focus();
            const doc = this._search().nativeElement.ownerDocument;
            const refocus = (): void => {
                setTimeout(() => {
                    const el = doc.activeElement;
                    if (!this.overrideOpen() && (!el || el === doc.body)) this._focus();
                }, 0);
            };
            doc.addEventListener('focusout', refocus);
            destroyRef.onDestroy(() => doc.removeEventListener('focusout', refocus));
        });
    }

    protected statusTone(status: string): 'success' | 'danger' | 'warning' | 'info' | 'neutral' {
        return status === 'Active'
            ? 'success'
            : status === 'Frozen'
              ? 'info'
              : status === 'Pending'
                ? 'warning'
                : status === 'Expired' || status === 'Suspended'
                  ? 'danger'
                  : 'neutral';
    }

    protected hasRule(d: AccessDecision, rule: string): boolean {
        return d.failures.some(f => f.rule === rule);
    }

    protected onKey(event: KeyboardEvent): void {
        const list = this.suggestions();
        if (event.key === 'ArrowDown' && list.length) {
            event.preventDefault();
            this.active.update(i => (i + 1) % list.length);
        } else if (event.key === 'ArrowUp' && list.length) {
            event.preventDefault();
            this.active.update(i => (i - 1 + list.length) % list.length);
        } else if (event.key === 'Escape') {
            this._suggestions.set([]);
        } else if (event.key === 'Enter') {
            event.preventDefault();
            const q = this.query().trim();
            if (CODE.test(q)) this._evaluate({ code: q.toUpperCase() });
            else if (list[this.active()]) this.choose(list[this.active()]);
            else if (!q && this.decision()?.allowed && !this.checkedIn()) this.confirm();
        }
    }

    protected choose(m: MemberListItem): void {
        this._evaluate({ member_oid: m.oid });
    }

    protected setAuto(on: boolean): void {
        this.auto.set(on);
        this._storage.set(AUTO_KEY, on);
        this._focus();
    }

    protected confirm(override = false): void {
        const d = this.decision();
        if (!d) return;
        this.saving.set(true);
        this._service.checkIn({ member_oid: d.member.oid, override: override ? { reason: this.reason().trim() } : null }).subscribe({
            next: () => {
                this.saving.set(false);
                this.checkedIn.set(override ? 'override' : 'yes');
                this.overrideOpen.set(false);
                this.reason.set('');
                this._refresh();
                this._focus();
            },
            error: () => this.saving.set(false)
        });
    }

    protected checkOut(oid: string): void {
        this._service.checkOut(oid).subscribe(() => this._refresh());
    }

    private _evaluate(key: { member_oid?: string; code?: string }): void {
        this._suggestions.set([]);
        this.query.set('');
        this.decision.set(null);
        this.notFound.set(null);
        this.checkedIn.set(null);
        this.evaluating.set(true);
        this._service.evaluate(key).subscribe({
            next: d => {
                this.evaluating.set(false);
                this.decision.set(d);
                if (d.allowed && this.auto()) this.confirm();
                this._focus();
            },
            error: (err: { error?: { message?: string } }) => {
                this.evaluating.set(false);
                this.notFound.set(err.error?.message ?? 'No member matches this code at this branch.');
                this._focus();
            }
        });
    }

    private _refresh(): void {
        this.log.reload();
        this.occupancy.reload();
    }

    private _focus(): void {
        if (this._browser) this._search().nativeElement.focus();
    }
}
