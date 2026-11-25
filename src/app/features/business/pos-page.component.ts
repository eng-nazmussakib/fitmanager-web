import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { switchMap, timer } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { type CartLine, type PosProduct, type PosSaleResult, PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABEL } from '@core/models/business.model';
import type { MemberListItem } from '@core/models/member.model';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@core/models/subscription.model';
import { MemberPickerComponent } from '@features/console/member-picker.component';
import { InvoiceViewComponent } from '@features/shared/invoice-view.component';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { TakaPipe } from '@shared/pipes/taka.pipe';
import { VatPercentPipe } from '@shared/pipes/vat-percent.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { AlertComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { NumberInputComponent } from '@shared/ui/forms/number-input.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { SwitchComponent } from '@shared/ui/forms/switch.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { BusinessService } from './business.service';

interface Line extends CartLine {
    product: PosProduct;
}

/**
 * `/console/:branch/pos`: the shop at the desk. Products by photo with what is on the shelf; a cart priced by
 * the API (VAT per line); a walk-in pays it all, a member may pay part or nothing and have the rest on their account
 * (the dues limit only warns). A branch manager gives a line discount with a reason. The receipt is the invoice.
 */
@Component({
    selector: 'app-pos-page',
    imports: [
        FormsModule,
        RouterLink,
        TakaPipe,
        VatPercentPipe,
        PageHeaderComponent,
        ButtonComponent,
        AlertComponent,
        CardComponent,
        SkeletonComponent,
        FieldComponent,
        InputDirective,
        NumberInputComponent,
        SelectComponent,
        SwitchComponent,
        IconComponent,
        MemberPickerComponent,
        InvoiceViewComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-page-header subtitle="Sell from the shelf to a member or a walk-in" title="Shop">
            <a fmButton routerLink="../pos-sales">
                <fm-icon name="receipt" />
                Sales and returns
            </a>
        </app-page-header>
        @if (done(); as d) {
            <fm-card class="mx-auto block max-w-2xl">
                <fm-alert class="mb-4" tone="success" [title]="d.charged ? 'Sold: ' + (d.charged | taka: 0) + ' on the account' : 'Sold and paid'">
                    @if (d.customer.over_limit) {
                        Their dues are now {{ d.customer.dues_after | taka: 0 }}, over the branch limit of {{ d.customer.dues_limit | taka: 0 }}: check-in will
                        ask for payment.
                    }
                </fm-alert>
                <app-invoice-view [invoice]="d.invoice" />
                <div class="mt-4 flex justify-end">
                    <button fmButton variant="primary" (click)="next()">Next sale</button>
                </div>
            </fm-card>
        } @else {
            <div class="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                <div>
                    <div class="mb-3 flex flex-wrap items-end gap-3">
                        <fm-field class="w-60" label="Find">
                            <input fmInput placeholder="Name or code" [ngModel]="q()" (ngModelChange)="q.set($event)" />
                        </fm-field>
                        <fm-field class="w-44" label="Kind">
                            <fm-select [ngModel]="category()" [options]="categories" (ngModelChange)="category.set($event)" />
                        </fm-field>
                    </div>
                    @if (products.value()) {
                        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                            @for (p of shown(); track p.oid) {
                                <button
                                    class="flex flex-col overflow-hidden rounded-xl border border-border bg-surface text-left transition hover:border-accent disabled:opacity-50"
                                    type="button"
                                    [attr.aria-label]="'Add ' + p.name"
                                    [disabled]="left(p) <= 0"
                                    (click)="add(p)"
                                >
                                    @if (p.photo_url) {
                                        <img class="aspect-square w-full object-cover" alt="" [src]="p.photo_url" />
                                    } @else {
                                        <span class="grid aspect-square w-full place-items-center bg-surface-sunken text-fg-subtle">
                                            <fm-icon name="package" size="2rem" />
                                        </span>
                                    }
                                    <span class="p-2">
                                        <span class="line-clamp-2 block text-sm font-medium">{{ p.name }}</span>
                                        <span class="flex items-center justify-between text-sm">
                                            <span class="tabular-nums">{{ p.price | taka: 0 }}</span>
                                            <span class="text-xs" [class.text-danger]="left(p) <= 0" [class.text-fg-muted]="left(p) > 0">
                                                {{ p.on_hand === 0 ? 'Out of stock' : left(p) + ' left' }}
                                            </span>
                                        </span>
                                    </span>
                                </button>
                            }
                        </div>
                    } @else {
                        <fm-skeleton height="20rem" />
                    }
                </div>
                <fm-card title="Sale">
                    <div class="grid gap-3">
                        <fm-switch [ngModel]="walkIn()" (ngModelChange)="setWalkIn($event)">Walk-in customer</fm-switch>
                        @if (walkIn()) {
                            <fm-field label="Name (optional)">
                                <input fmInput maxlength="80" placeholder="Walk-in customer" [(ngModel)]="walkInName" />
                            </fm-field>
                        } @else {
                            <app-member-picker label="Member" (changed)="member.set($event)" />
                        }
                        @if (lines().length) {
                            <ul class="divide-y divide-border">
                                @for (l of lines(); track l.product_oid; let i = $index) {
                                    <li class="py-2">
                                        <div class="flex items-center gap-2">
                                            <span class="min-w-0 flex-1 text-sm">
                                                {{ l.product.name }}
                                                <span class="block text-xs text-fg-muted">
                                                    {{ l.product.price | taka: 0 }} each · VAT {{ l.product.vat_rate | vatPercent }}
                                                </span>
                                            </span>
                                            <button aria-label="One less" fmButton size="sm" variant="ghost" (click)="qty(i, -1)">
                                                <fm-icon name="minus" size="1rem" />
                                            </button>
                                            <span class="w-6 text-center tabular-nums">{{ l.qty }}</span>
                                            <button
                                                aria-label="One more"
                                                fmButton
                                                size="sm"
                                                variant="ghost"
                                                [disabled]="left(l.product) <= 0"
                                                (click)="qty(i, 1)"
                                            >
                                                <fm-icon name="plus" size="1rem" />
                                            </button>
                                            <span class="w-16 text-right text-sm tabular-nums">{{ lineTotal(i) | taka: 0 }}</span>
                                        </div>
                                        @if (canDiscount) {
                                            <div class="mt-1 grid grid-cols-[6rem_minmax(0,1fr)] gap-2">
                                                <fm-number-input
                                                    aria-label="Discount (৳)"
                                                    placeholder="Discount"
                                                    [min]="0"
                                                    [ngModel]="l.discount"
                                                    (ngModelChange)="discount(i, $event, null)"
                                                />
                                                <input
                                                    aria-label="Why"
                                                    fmInput
                                                    maxlength="120"
                                                    placeholder="Why (with a discount)"
                                                    [ngModel]="l.discount_reason"
                                                    (ngModelChange)="discount(i, null, $event)"
                                                />
                                            </div>
                                        }
                                    </li>
                                }
                            </ul>
                            @if (quote.value(); as q) {
                                <dl class="grid grid-cols-2 gap-y-1 text-sm tabular-nums">
                                    <dt class="text-fg-muted">Items</dt>
                                    <dd class="text-right">{{ q.subtotal | taka: 0 }}</dd>
                                    @if (q.discount) {
                                        <dt class="text-fg-muted">Discounts</dt>
                                        <dd class="text-right">−{{ q.discount | taka: 0 }}</dd>
                                    }
                                    <dt class="text-fg-muted">VAT{{ q.vat_inclusive ? ' (included)' : '' }}</dt>
                                    <dd class="text-right">{{ q.vat | taka: 0 }}</dd>
                                    <dt class="text-base font-semibold">Total</dt>
                                    <dd class="text-right text-base font-semibold">{{ q.total | taka: 0 }}</dd>
                                </dl>
                                @for (s of q.short; track s.product_oid) {
                                    <fm-alert tone="danger">Only {{ s.on_hand }} of {{ s.name }} on the shelf.</fm-alert>
                                }
                                <div class="grid grid-cols-2 gap-3">
                                    <fm-field label="Paid by"><fm-select [options]="methods" [(ngModel)]="method" /></fm-field>
                                    <fm-field label="Amount (৳)" [hint]="walkIn() ? 'A walk-in pays it all.' : 'Less than the total goes on their account.'">
                                        <fm-number-input
                                            [disabled]="walkIn()"
                                            [max]="q.total"
                                            [min]="0"
                                            [ngModel]="walkIn() ? q.total : amount()"
                                            (ngModelChange)="amount.set($event)"
                                        />
                                    </fm-field>
                                </div>
                                @if (method !== 'cash' && (walkIn() || amount() > 0)) {
                                    <fm-field label="Transaction reference" required><input fmInput maxlength="60" [(ngModel)]="reference" /></fm-field>
                                }
                                @if (!walkIn() && q.customer.member_oid && charged() > 0) {
                                    <fm-alert [tone]="overLimit() ? 'warning' : 'info'">
                                        {{ charged() | taka: 0 }} goes on {{ q.customer.name }}'s account: dues {{ q.customer.dues | taka: 0 }} →
                                        {{ q.customer.dues + charged() | taka: 0 }}.
                                        @if (overLimit()) {
                                            That is over the branch limit of {{ q.customer.dues_limit | taka: 0 }}: check-in will ask them to pay.
                                        }
                                    </fm-alert>
                                }
                            } @else if (quote.error()) {
                                <fm-alert tone="danger">{{ problemOf(quote.error()) }}</fm-alert>
                            }
                            <button fmButton variant="primary" [disabled]="!ready()" [loading]="saving()" (click)="sell()">
                                <fm-icon name="banknote" />
                                Sell{{ quote.value() ? ' · ' + (quote.value()!.total | taka: 0) : '' }}
                            </button>
                            <button fmButton size="sm" variant="ghost" (click)="clear()">Clear</button>
                        } @else {
                            <p class="text-sm text-fg-muted">Tap a product to add it.</p>
                        }
                    </div>
                </fm-card>
            </div>
        }
    `
})
export class PosPageComponent {
    protected readonly auth = inject(AuthService);
    private readonly _service = inject(BusinessService);
    protected readonly canDiscount = this.auth.can('manage', 'Sale');
    protected readonly categories: SelectOption<string>[] = [
        { value: '', label: 'Everything' },
        ...PRODUCT_CATEGORIES.map(c => ({ value: c, label: PRODUCT_CATEGORY_LABEL[c] }))
    ];
    protected readonly methods: SelectOption<PaymentMethod>[] = (Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map(m => ({
        value: m,
        label: PAYMENT_METHOD_LABELS[m]
    }));
    protected readonly products = rxResource({ stream: () => this._service.posProducts() });
    protected readonly q = signal('');
    protected readonly category = signal('');
    protected readonly shown = computed(() => {
        const term = this.q().trim().toLowerCase();
        return (this.products.value() ?? []).filter(
            p => (!this.category() || p.category === this.category()) && (!term || p.name.toLowerCase().includes(term) || p.code.toLowerCase().includes(term))
        );
    });
    protected readonly walkIn = signal(true);
    protected readonly member = signal<MemberListItem | null>(null);
    protected walkInName = '';
    protected readonly lines = signal<Line[]>([]);
    protected method: PaymentMethod = 'cash';
    protected readonly amount = signal(0);
    protected reference = '';
    protected readonly saving = signal(false);
    protected readonly done = signal<PosSaleResult | null>(null);
    private readonly _cart = computed(() => ({
        member: this.walkIn() ? null : (this.member()?.oid ?? null),
        lines: this.lines().map(l => ({ product_oid: l.product_oid, qty: l.qty, discount: l.discount ?? 0, discount_reason: l.discount_reason ?? null }))
    }));
    protected readonly quote = rxResource({
        params: () => (this.lines().length ? this._cart() : undefined),
        stream: ({ params }) => timer(250).pipe(switchMap(() => this._service.quote(params.member, params.lines)))
    });
    protected readonly charged = computed(() => Math.max(0, (this.quote.value()?.total ?? 0) - this.amount()));
    protected readonly overLimit = computed(() => {
        const c = this.quote.value()?.customer;
        return !!c && c.dues + this.charged() > c.dues_limit;
    });
    protected readonly ready = computed(() => {
        const q = this.quote.value();
        return !!q && !q.short.length && (this.walkIn() || !!this.member());
    });

    protected left(p: PosProduct): number {
        return p.on_hand - (this.lines().find(l => l.product_oid === p.oid)?.qty ?? 0);
    }

    protected lineTotal(i: number): number {
        const l = this.lines()[i];
        return this.quote.value()?.lines.find(x => x.product_oid === l?.product_oid)?.total ?? (l ? l.product.price * l.qty : 0);
    }

    protected add(p: PosProduct): void {
        const i = this.lines().findIndex(l => l.product_oid === p.oid);
        if (i >= 0) this.qty(i, 1);
        else this.lines.update(list => [...list, { product_oid: p.oid, qty: 1, product: p, discount: 0, discount_reason: null }]);
    }

    protected qty(i: number, by: number): void {
        this.lines.update(list => list.map((l, j) => (j === i ? { ...l, qty: l.qty + by } : l)).filter(l => l.qty > 0));
    }

    protected discount(i: number, amount: number | null, reason: string | null): void {
        this.lines.update(list =>
            list.map((l, j) =>
                j === i ? { ...l, ...(amount !== null ? { discount: amount ?? 0 } : {}), ...(reason !== null ? { discount_reason: reason } : {}) } : l
            )
        );
    }

    protected setWalkIn(on: boolean): void {
        this.walkIn.set(on);
        if (on) this.member.set(null);
        this.amount.set(0);
    }

    protected problemOf(err: unknown): string {
        const e = err as { error?: { message?: string } } | null;
        return e?.error?.message ?? 'This cart cannot be priced.';
    }

    protected sell(): void {
        const q = this.quote.value();
        if (!q) return;
        const amount = this.walkIn() ? q.total : this.amount();
        this.saving.set(true);
        this._service
            .sell({
                member_oid: this.walkIn() ? null : (this.member()?.oid ?? null),
                walk_in_name: this.walkIn() ? this.walkInName.trim() || null : null,
                lines: this._cart().lines,
                payment: { method: this.method, amount, reference: this.reference.trim() || null }
            })
            .subscribe({
                next: r => {
                    this.saving.set(false);
                    this.done.set(r);
                    this.products.reload();
                },
                error: () => this.saving.set(false)
            });
    }

    protected clear(): void {
        this.lines.set([]);
        this.amount.set(0);
        this.reference = '';
    }

    protected next(): void {
        this.clear();
        this.walkInName = '';
        this.done.set(null);
    }
}
