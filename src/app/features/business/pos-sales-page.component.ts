import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '@core/auth/auth.service';
import type { PosSale } from '@core/models/business.model';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@core/models/subscription.model';
import { InvoiceViewComponent } from '@features/shared/invoice-view.component';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { TakaPipe } from '@shared/pipes/taka.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { AlertComponent, BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';
import { DatePickerComponent } from '@shared/ui/forms/date-picker.component';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { NumberInputComponent } from '@shared/ui/forms/number-input.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { SwitchComponent } from '@shared/ui/forms/switch.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { BusinessService } from './business.service';

/**
 * `/console/:branch/pos-sales` (D-102): the shop's sales, newest first, and returns. Money goes back only from what was
 * paid (a sale on the account is paid first); undamaged items go back on the shelf. The desk takes returns for 3 days,
 * a branch manager after that.
 */
@Component({
    selector: 'app-pos-sales-page',
    imports: [
        FormsModule,
        RouterLink,
        AppDatePipe,
        TakaPipe,
        InvoiceViewComponent,
        PageHeaderComponent,
        ButtonComponent,
        AlertComponent,
        BadgeComponent,
        CardComponent,
        SkeletonComponent,
        EmptyStateComponent,
        DatePickerComponent,
        FieldComponent,
        InputDirective,
        NumberInputComponent,
        SelectComponent,
        SwitchComponent,
        IconComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-page-header subtitle="Shop sales and returns" title="Shop sales">
            @if (auth.can('create', 'Sale')) {
                <a fmButton routerLink="../pos" variant="primary">
                    <fm-icon name="store" />
                    New sale
                </a>
            }
        </app-page-header>
        <div class="mb-4 flex flex-wrap items-end gap-4">
            <fm-field class="w-48" label="Day"><fm-date-picker [ngModel]="day()" (ngModelChange)="day.set($event)" /></fm-field>
            <fm-field class="w-60" label="Search">
                <input fmInput placeholder="Invoice, name or code" [ngModel]="q()" (ngModelChange)="q.set($event)" />
            </fm-field>
        </div>
        <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            @if (list.value(); as rows) {
                @if (rows.length) {
                    <fm-card flush>
                        <ul class="divide-y divide-border">
                            @for (s of rows; track s.invoice.oid) {
                                <li>
                                    <button
                                        class="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left hover:bg-surface-sunken"
                                        type="button"
                                        [class.bg-accent-soft]="open()?.invoice?.oid === s.invoice.oid"
                                        (click)="open.set(s)"
                                    >
                                        <span class="min-w-0 flex-1">
                                            <span class="block font-mono text-sm">{{ s.invoice.number }}</span>
                                            <span class="block truncate text-sm text-fg-muted">
                                                {{ s.invoice.member_name }} · {{ s.items.length }} item{{ s.items.length === 1 ? '' : 's' }} ·
                                                {{ s.invoice.issued_at | appDate: 'd MMM, h:mm a' }}
                                            </span>
                                        </span>
                                        <span class="text-sm tabular-nums">{{ s.invoice.total | taka: 0 }}</span>
                                        @if (s.returned_amount) {
                                            <fm-badge tone="warning">{{ s.returned_amount | taka: 0 }} back</fm-badge>
                                        }
                                        <fm-badge [tone]="s.invoice.status === 'Paid' ? 'success' : s.invoice.status === 'Refunded' ? 'neutral' : 'warning'">
                                            {{ s.invoice.status }}
                                        </fm-badge>
                                    </button>
                                </li>
                            }
                        </ul>
                    </fm-card>
                } @else {
                    <fm-empty-state icon="receipt" title="No sales" />
                }
            } @else {
                <fm-skeleton height="14rem" />
            }
            @if (open(); as s) {
                <div class="grid gap-4">
                    @if (returnable(s)) {
                        <fm-card title="Take items back">
                            @if (!s.desk_may_return && !canLate) {
                                <fm-alert tone="info">The desk takes returns until {{ s.desk_return_until | appDate }}. Ask a branch manager.</fm-alert>
                            } @else {
                                <div class="grid gap-3">
                                    @for (it of s.items; track it.index) {
                                        @if (it.returnable > 0) {
                                            <div class="grid grid-cols-[minmax(0,1fr)_5.5rem_auto] items-end gap-2">
                                                <p class="pb-2 text-sm">
                                                    {{ it.label }}
                                                    <span class="block text-xs text-fg-muted">{{ it.returnable }} can come back</span>
                                                </p>
                                                <fm-field label="Qty">
                                                    <fm-number-input [max]="it.returnable" [min]="0" [(ngModel)]="back[it.index]" />
                                                </fm-field>
                                                <fm-switch class="pb-2" [(ngModel)]="damaged[it.index]">Damaged</fm-switch>
                                            </div>
                                        }
                                    }
                                    <div class="grid grid-cols-2 gap-3">
                                        <fm-field label="Money back by"><fm-select [options]="methods" [(ngModel)]="method" /></fm-field>
                                        @if (method !== 'cash') {
                                            <fm-field label="Reference"><input fmInput maxlength="60" [(ngModel)]="reference" /></fm-field>
                                        }
                                    </div>
                                    <fm-field label="Why" required><input fmInput maxlength="300" [(ngModel)]="reason" /></fm-field>
                                    @if (s.invoice.paid <= 0) {
                                        <fm-alert tone="warning">
                                            Nothing is paid on this sale yet ({{ s.invoice.due | taka: 0 }} on the account). Take the payment first, then the
                                            return.
                                        </fm-alert>
                                    }
                                    <button class="justify-self-start" fmButton variant="primary" [loading]="saving()" (click)="give(s)">
                                        Take back and refund
                                    </button>
                                </div>
                            }
                        </fm-card>
                    }
                    @for (r of s.returns; track r.oid) {
                        <p class="text-sm text-fg-muted">
                            {{ r.at | appDate: 'd MMM, h:mm a' }}: {{ r.amount | taka: 0 }} back by {{ r.by_name }} ·
                            @for (l of r.lines; track l.index; let last = $last) {
                                {{ l.qty }} × {{ s.items[l.index]?.code }}{{ l.damaged ? ' (damaged)' : '' }}{{ last ? '' : ',' }}
                            }
                            · {{ r.reason }}
                        </p>
                    }
                    <app-invoice-view [invoice]="s.invoice" />
                </div>
            }
        </div>
    `
})
export class PosSalesPageComponent {
    protected readonly auth = inject(AuthService);
    private readonly _service = inject(BusinessService);
    protected readonly canLate = this.auth.can('manage', 'Sale');
    protected readonly methods: SelectOption<PaymentMethod>[] = (Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map(m => ({
        value: m,
        label: PAYMENT_METHOD_LABELS[m]
    }));
    protected readonly day = signal<string | null>(null);
    protected readonly q = signal('');
    private readonly _filters = computed(() => ({ day: this.day() ?? undefined, q: this.q().trim() || undefined }));
    protected readonly list = rxResource({ params: this._filters, stream: ({ params }) => this._service.sales(params) });
    protected readonly open = signal<PosSale | null>(null);
    protected back: Record<number, number> = {};
    protected damaged: Record<number, boolean> = {};
    protected method: PaymentMethod = 'cash';
    protected reference = '';
    protected reason = '';
    protected readonly saving = signal(false);

    protected returnable(s: PosSale): boolean {
        return this.auth.can('create', 'Sale') && s.items.some(i => i.returnable > 0);
    }

    protected give(s: PosSale): void {
        const lines = s.items
            .filter(i => (this.back[i.index] ?? 0) > 0)
            .map(i => ({ index: i.index, qty: this.back[i.index], damaged: !!this.damaged[i.index] }));
        if (!lines.length || this.reason.trim().length < 3) return;
        this.saving.set(true);
        this._service
            .returnItems(s.invoice.oid, { lines, method: this.method, reference: this.reference.trim() || null, reason: this.reason.trim() })
            .subscribe({
                next: after => {
                    this.saving.set(false);
                    this.back = {};
                    this.damaged = {};
                    this.reason = '';
                    this.reference = '';
                    this.open.set(after);
                    this.list.reload();
                },
                error: () => this.saving.set(false)
            });
    }
}
