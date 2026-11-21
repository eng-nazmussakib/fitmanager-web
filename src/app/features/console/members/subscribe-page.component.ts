import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { addDays, format, parseISO } from 'date-fns';
import { catchError, debounceTime, of, switchMap } from 'rxjs';

import type { Invoice } from '@core/models/payment.model';
import type { Plan } from '@core/models/plan.model';
import {
    type DiscountKind,
    METHODS_NEEDING_REFERENCE,
    PAYMENT_METHOD_LABELS,
    type PaymentMethod,
    type Quote,
    type SubscriptionRequest
} from '@core/models/subscription.model';
import { InvoiceViewComponent } from '@features/shared/invoice-view.component';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { TakaPipe } from '@shared/pipes/taka.pipe';
import { VatPercentPipe } from '@shared/pipes/vat-percent.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { AlertComponent, AvatarComponent, BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { DatePickerComponent, todayIso } from '@shared/ui/forms/date-picker.component';
import { CheckDirective, FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { NumberInputComponent } from '@shared/ui/forms/number-input.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { ConsoleService } from '../console.service';

const STEPS = ['Member', 'Plan', 'Start and discount', 'Payment', 'Receipt'] as const;

/**
 * H4: sell or renew a membership, in five steps. The price summary on the right is the API's quote
 * (mock/domain/pricing.ts), refreshed as the desk changes the plan, date, discount or admission fee: the UI never
 * adds up money. A partial payment is allowed; the rest becomes dues. The receipt is shown, printed or saved as PDF.
 */
@Component({
    selector: 'app-subscribe-page',
    imports: [
        FormsModule,
        RouterLink,
        InvoiceViewComponent,
        PageHeaderComponent,
        AppDatePipe,
        TakaPipe,
        VatPercentPipe,
        ButtonComponent,
        AlertComponent,
        AvatarComponent,
        BadgeComponent,
        CardComponent,
        SkeletonComponent,
        DatePickerComponent,
        CheckDirective,
        FieldComponent,
        InputDirective,
        NumberInputComponent,
        SelectComponent,
        IconComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-page-header [subtitle]="member.value()?.name ?? ''" [title]="member.value()?.status === 'Pending' ? 'Sell the first plan' : 'Renew membership'" />

        <!-- Stepper -->
        <ol class="mb-6 flex flex-wrap gap-2" aria-label="Steps">
            @for (s of steps; track s; let i = $index) {
                <li class="flex items-center gap-2 text-sm" [attr.aria-current]="i === step() ? 'step' : null">
                    <span
                        class="grid size-7 place-items-center rounded-full border text-xs font-semibold"
                        [class.bg-primary-500]="i <= step()"
                        [class.border-border-strong]="i > step()"
                        [class.border-primary-500]="i <= step()"
                        [class.text-fg-on-primary]="i <= step()"
                        [class.text-fg-subtle]="i > step()"
                    >
                        @if (i < step()) {
                            <fm-icon name="check" size="0.875rem" />
                        } @else {
                            {{ i + 1 }}
                        }
                    </span>
                    <span [class.font-semibold]="i === step()" [class.text-fg-muted]="i !== step()">{{ s }}</span>
                    @if (i < steps.length - 1) {
                        <span class="mx-1 hidden h-px w-6 bg-border sm:block" aria-hidden="true"></span>
                    }
                </li>
            }
        </ol>

        <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div class="min-w-0">
                @switch (step()) {
                    @case (0) {
                        <fm-card title="Member">
                            @if (member.value(); as m) {
                                <div class="flex flex-wrap items-center gap-4">
                                    <fm-avatar size="4rem" [name]="m.name" [src]="m.photo_url" />
                                    <div class="min-w-0 flex-1">
                                        <p class="font-semibold">{{ m.name }}</p>
                                        <p class="text-sm text-fg-muted">{{ m.code }} · {{ m.phone }}</p>
                                        <p class="mt-1 text-sm">
                                            <fm-badge dot [tone]="m.status === 'Active' ? 'success' : m.status === 'Expired' ? 'danger' : 'warning'">
                                                {{ m.status }}
                                            </fm-badge>
                                            @if (m.valid_until) {
                                                <span class="ml-2 text-fg-muted">
                                                    {{ m.status === 'Active' ? 'Runs until' : 'Ended' }} {{ m.valid_until | appDate }}
                                                </span>
                                            }
                                        </p>
                                    </div>
                                    <a fmButton routerLink="../.." variant="ghost">Pick another member</a>
                                </div>
                                @if (m.status === 'Suspended' || m.status === 'Banned') {
                                    <fm-alert class="mt-4" tone="danger" [title]="m.status">
                                        {{ m.status === 'Banned' ? 'A banned member cannot be sold a plan here.' : 'Sell after the suspension ends.' }}
                                    </fm-alert>
                                }
                            } @else {
                                <fm-skeleton height="4rem" />
                            }
                        </fm-card>
                    }
                    @case (1) {
                        <fieldset>
                            <legend class="mb-3 font-semibold">Choose a plan</legend>
                            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup">
                                @for (p of plans.value() ?? []; track p.oid) {
                                    <button
                                        class="fm-focusable flex flex-col rounded-[var(--radius-panel)] border bg-surface p-4 text-left transition hover:border-fg-subtle"
                                        type="button"
                                        role="radio"
                                        [attr.aria-checked]="p.oid === planOid()"
                                        [class.border-border]="p.oid !== planOid()"
                                        [class.border-primary-500]="p.oid === planOid()"
                                        [class.ring-2]="p.oid === planOid()"
                                        [class.ring-primary-500]="p.oid === planOid()"
                                        (click)="planOid.set(p.oid)"
                                    >
                                        <span class="flex items-center justify-between gap-2">
                                            <span class="font-semibold">{{ p.tier_name }}</span>
                                            @if (p.featured) {
                                                <fm-badge tone="primary">Popular</fm-badge>
                                            }
                                        </span>
                                        <span class="text-sm text-fg-muted">
                                            {{ p.period_label }} · {{ p.persons === 1 ? '1 person' : p.persons + ' persons' }}
                                        </span>
                                        <span class="mt-3 text-xl font-semibold tabular-nums">{{ p.price | taka: 0 }}</span>
                                    </button>
                                }
                            </div>
                        </fieldset>
                    }
                    @case (2) {
                        <fm-card title="Start date, discount and admission">
                            <div class="grid gap-4 sm:grid-cols-2">
                                <fm-field label="Start date" required [hint]="startHint()">
                                    <fm-date-picker [min]="minStart" [ngModel]="start()" (ngModelChange)="start.set($event ?? today)" />
                                </fm-field>
                                <fm-field label="Discount">
                                    <fm-select [ngModel]="discountKind()" [options]="discountOptions" (ngModelChange)="discountKind.set($event ?? 'none')" />
                                </fm-field>
                                @if (discountKind() === 'amount' || discountKind() === 'percent') {
                                    <fm-field
                                        [hint]="
                                            discountKind() === 'percent' ? 'Above 20% needs a branch manager' : 'Above 20% of the price needs a branch manager'
                                        "
                                        [label]="discountKind() === 'percent' ? 'Percent' : 'Amount'"
                                    >
                                        <fm-number-input
                                            [max]="discountKind() === 'percent' ? 100 : undefined"
                                            [min]="0"
                                            [ngModel]="discountValue()"
                                            [taka]="discountKind() === 'amount'"
                                            (ngModelChange)="discountValue.set($event ?? 0)"
                                        />
                                    </fm-field>
                                }
                                @if (discountKind() === 'promo') {
                                    <fm-field hint="e.g. NOADMISSION, STUDENT10, REFER500" label="Promo code" [error]="quote.value()?.promo_error ?? null">
                                        <input class="uppercase" autocomplete="off" fmInput [ngModel]="promo()" (ngModelChange)="promo.set($event)" />
                                    </fm-field>
                                }
                                <label class="fm-check-label sm:col-span-2">
                                    <input type="checkbox" fmCheck [checked]="admission()" (change)="admission.set(!admission())" />
                                    Charge the admission fee
                                    @if (quote.value()?.admission_suggested !== undefined) {
                                        <span class="text-fg-subtle">
                                            ({{ quote.value()!.admission_suggested ? 'new or returning after 30+ days' : 'not usually due for this member' }})
                                        </span>
                                    }
                                </label>
                            </div>
                        </fm-card>
                    }
                    @case (3) {
                        <fm-card title="Payment">
                            <div class="grid gap-4 sm:grid-cols-2">
                                <fm-field class="sm:col-span-2" label="Method">
                                    <div class="flex flex-wrap gap-2" aria-label="Payment method" role="radiogroup">
                                        @for (m of methods; track m.value) {
                                            <button
                                                fmButton
                                                role="radio"
                                                [attr.aria-checked]="method() === m.value"
                                                [variant]="method() === m.value ? 'primary' : 'secondary'"
                                                (click)="method.set(m.value)"
                                            >
                                                {{ m.label }}
                                            </button>
                                        }
                                    </div>
                                </fm-field>
                                @if (needsRef()) {
                                    <fm-field
                                        hint="The transaction ID on the bKash or Nagad message, the POS slip or the bank transfer"
                                        label="Reference"
                                        required
                                    >
                                        <input autocomplete="off" fmInput [ngModel]="reference()" (ngModelChange)="reference.set($event)" />
                                    </fm-field>
                                }
                                <fm-field
                                    label="Amount received"
                                    required
                                    [hint]="'Total ' + (quote.value()?.total ?? 0 | taka: 0) + '. Pay less to leave the rest as dues.'"
                                >
                                    <fm-number-input
                                        taka
                                        [max]="quote.value()?.total ?? 0"
                                        [min]="0"
                                        [ngModel]="amount()"
                                        (ngModelChange)="amount.set($event)"
                                    />
                                </fm-field>
                            </div>
                            @if (dueAfter() > 0) {
                                <fm-alert class="mt-4" tone="warning">
                                    {{ dueAfter() | taka: 0 }} will be recorded as dues. Check-in is blocked once dues pass the branch limit.
                                </fm-alert>
                            }
                        </fm-card>
                    }
                    @case (4) {
                        @if (invoice(); as inv) {
                            <fm-alert class="mb-4" title="Membership sold" tone="success">
                                {{ quote.value()?.plan_name }} from {{ start() | appDate }}. The profile, dashboard and cash closing already show it.
                            </fm-alert>
                            <app-invoice-view [invoice]="inv" />
                            <div class="mt-4 flex flex-wrap gap-2">
                                <a fmButton routerLink=".." variant="primary">Back to the profile</a>
                                <a fmButton routerLink="../../../check-in">Go to check-in</a>
                            </div>
                        }
                    }
                }

                @if (step() < 4) {
                    <div class="mt-5 flex justify-between gap-2">
                        <button fmButton [disabled]="step() === 0" (click)="step.set(step() - 1)">
                            <fm-icon name="arrow-left" />
                            Back
                        </button>
                        @if (step() < 3) {
                            <button fmButton variant="primary" [disabled]="!canNext()" (click)="step.set(step() + 1)">
                                Next
                                <fm-icon name="arrow-right" />
                            </button>
                        } @else {
                            <button fmButton variant="primary" [disabled]="!canSell()" [loading]="saving()" (click)="sell()">
                                <fm-icon name="check" />
                                Confirm sale
                            </button>
                        }
                    </div>
                }
            </div>

            <!-- Live price summary -->
            <aside aria-label="Price summary" aria-live="polite">
                <fm-card class="xl:sticky xl:top-20" title="Summary">
                    @if (quote.value(); as q) {
                        <dl class="grid gap-2 text-sm tabular-nums">
                            @for (l of q.lines; track l.label) {
                                <div class="flex justify-between gap-3">
                                    <dt class="text-fg-muted">{{ l.label }}</dt>
                                    <dd>{{ l.amount | taka: 0 }}</dd>
                                </div>
                            }
                            <div class="flex justify-between gap-3 border-t border-border pt-2">
                                <dt class="text-fg-muted">Subtotal</dt>
                                <dd>{{ q.subtotal | taka: 0 }}</dd>
                            </div>
                            @if (q.discount) {
                                <div class="flex justify-between gap-3 text-success-fg">
                                    <dt>{{ q.discount_label }}</dt>
                                    <dd>−{{ q.discount | taka: 0 }}</dd>
                                </div>
                            }
                            @if (q.vat_rate > 0) {
                                <div class="flex justify-between gap-3">
                                    <dt class="text-fg-muted">VAT ({{ q.vat_rate | vatPercent }})</dt>
                                    <dd>{{ q.vat | taka: 0 }}</dd>
                                </div>
                            }
                            <div class="flex justify-between gap-3 border-t border-border pt-2 text-base font-semibold">
                                <dt>Total</dt>
                                <dd>{{ q.total | taka: 0 }}</dd>
                            </div>
                            <div class="flex justify-between gap-3">
                                <dt class="text-fg-muted">Paid</dt>
                                <dd>{{ amount() ?? 0 | taka: 0 }}</dd>
                            </div>
                            <div class="flex justify-between gap-3" [class.text-danger-fg]="dueAfter() > 0">
                                <dt>Due</dt>
                                <dd>{{ dueAfter() | taka: 0 }}</dd>
                            </div>
                        </dl>
                        <p class="mt-3 text-xs text-fg-subtle">{{ q.start_date | appDate }} to {{ q.end_date | appDate }}</p>
                    } @else if (planOid()) {
                        <fm-skeleton />
                        <fm-skeleton class="mt-2" />
                        <fm-skeleton class="mt-2" width="60%" />
                    } @else {
                        <p class="text-sm text-fg-muted">Choose a plan to see the price.</p>
                    }
                </fm-card>
            </aside>
        </div>
    `
})
export class SubscribePageComponent {
    private readonly _service = inject(ConsoleService);
    private _admissionDecided = false;
    private _lastTotal: number | null = null;

    readonly id = input.required<string>();

    protected readonly steps = STEPS;
    protected readonly today = todayIso();
    protected readonly minStart = format(addDays(parseISO(this.today), -7), 'yyyy-MM-dd');
    protected readonly methods: SelectOption<PaymentMethod>[] = (Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map(m => ({
        value: m,
        label: PAYMENT_METHOD_LABELS[m]
    }));
    protected readonly discountOptions: SelectOption<DiscountKind>[] = [
        { value: 'none', label: 'No discount' },
        { value: 'amount', label: 'Fixed amount (৳)' },
        { value: 'percent', label: 'Percent of the plan' },
        { value: 'promo', label: 'Promo code' }
    ];

    protected readonly member = rxResource({ params: () => this.id(), stream: ({ params }) => this._service.member(params) });
    protected readonly plans = rxResource({ stream: () => this._service.plans() });

    protected readonly step = signal(0);
    protected readonly planOid = signal<string | null>(null);
    protected readonly start = signal(this.today);
    protected readonly discountKind = signal<DiscountKind>('none');
    protected readonly discountValue = signal(0);
    protected readonly promo = signal('');
    protected readonly admission = signal(true);
    protected readonly method = signal<PaymentMethod>('cash');
    protected readonly reference = signal('');
    protected readonly amount = signal<number | null>(null);
    protected readonly saving = signal(false);
    protected readonly invoice = signal<Invoice | null>(null);

    private readonly _request = computed<SubscriptionRequest | null>(() => {
        const plan = this.planOid();
        if (!plan) return null;
        return {
            member_oid: this.id(),
            plan_oid: plan,
            start_date: this.start(),
            discount: { kind: this.discountKind(), value: this.discountValue(), code: this.promo() },
            charge_admission: this.admission()
        };
    });

    private readonly _quote = signal<(Quote & { admission_suggested: boolean }) | null>(null);
    protected readonly quote = { value: this._quote.asReadonly() };

    protected readonly needsRef = computed(() => (this.amount() ?? 0) > 0 && METHODS_NEEDING_REFERENCE.includes(this.method()));
    protected readonly dueAfter = computed(() => Math.max(0, (this._quote()?.total ?? 0) - (this.amount() ?? 0)));
    protected readonly startHint = computed(() => {
        const m = this.member.value();
        return m?.status === 'Active' && m.valid_until
            ? `The current plan runs until ${m.valid_until}; a renewal starts the day after.`
            : 'Up to 7 days back, or any day ahead.';
    });
    protected readonly canNext = computed(() => {
        const s = this.step();
        if (s === 0) return !!this.member.value() && !['Suspended', 'Banned'].includes(this.member.value()!.status);
        if (s === 1) return !!this.planOid();
        if (s === 2) return !!this._quote() && !this._quote()!.promo_error;
        return true;
    });
    protected readonly canSell = computed(
        () => !!this._quote() && !this._quote()!.promo_error && this.amount() !== null && (!this.needsRef() || !!this.reference().trim())
    );

    constructor() {
        // Renewals start the day after the running plan; a new or lapsed member starts today.
        effect(() => {
            const m = this.member.value();
            if (m?.status === 'Active' && m.valid_until && m.valid_until >= this.today)
                this.start.set(format(addDays(parseISO(m.valid_until), 1), 'yyyy-MM-dd'));
        });
        // The live quote, debounced while the desk types.
        toObservable(this._request)
            .pipe(
                debounceTime(200),
                switchMap(req => (req ? this._service.quote(req).pipe(catchError(() => of(null))) : of(null))),
                takeUntilDestroyed()
            )
            .subscribe(q => {
                this._quote.set(q);
                if (q && !this._admissionDecided) {
                    this._admissionDecided = true;
                    if (this.admission() !== q.admission_suggested) this.admission.set(q.admission_suggested);
                }
                // Default the amount received to the full total until the desk types another amount.
                if (q && (this.amount() === null || this.amount() === this._lastTotal)) this.amount.set(q.total);
                this._lastTotal = q?.total ?? null;
            });
    }

    protected plan(): Plan | undefined {
        return this.plans.value()?.find(p => p.oid === this.planOid());
    }

    protected sell(): void {
        const req = this._request();
        if (!req) return;
        this.saving.set(true);
        this._service.sell({ ...req, payment: { method: this.method(), amount: this.amount() ?? 0, reference: this.reference().trim() || null } }).subscribe({
            next: ({ invoice }) => {
                this.saving.set(false);
                this.invoice.set(invoice);
                this.step.set(4);
            },
            error: () => this.saving.set(false)
        });
    }
}
