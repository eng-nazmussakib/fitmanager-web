import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { filter } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { PO_STATUS, type PurchaseOrder } from '@core/models/business.model';
import { type TextPromptData, TextPromptDialogComponent, type TextPromptResult } from '@features/governance/text-prompt-dialog.component';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { TakaPipe } from '@shared/pipes/taka.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogService } from '@shared/ui/dialog/dialog.service';
import { BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';
import { todayIso } from '@shared/ui/forms/date-picker.component';
import { FieldComponent } from '@shared/ui/forms/field.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { IconComponent } from '@shared/ui/icon/icon.component';
import { ToastService } from '@shared/ui/toast/toast.service';

import { BusinessService } from './business.service';
import { OrderDialogComponent, type OrderDialogData } from './order-dialog.component';
import { type QtyLinesData, QtyLinesDialogComponent, type QtyLinesResult } from './qty-lines-dialog.component';

/** `2026-11-19` + n days. */
const addDays = (date: string, n: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Purchase orders. At a branch: raise one (HQ approves it), mark it sent once it is with the supplier, receive
 * what comes (in one or more deliveries, at the cost then), or cancel it. At HQ: every branch's, pending first, to
 * approve or reject. The order can be copied as text for WhatsApp or email, or printed.
 */
@Component({
    selector: 'app-purchase-orders',
    imports: [
        FormsModule,
        AppDatePipe,
        TakaPipe,
        ButtonComponent,
        BadgeComponent,
        CardComponent,
        SkeletonComponent,
        EmptyStateComponent,
        FieldComponent,
        SelectComponent,
        IconComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="mb-4 flex flex-wrap items-end gap-4">
            <fm-field class="w-52" label="Status"><fm-select [ngModel]="status()" [options]="statuses" (ngModelChange)="status.set($event)" /></fm-field>
            @if (!hq() && auth.can('create', 'PurchaseOrder')) {
                <button class="ml-auto" fmButton variant="primary" (click)="raise([])">
                    <fm-icon name="plus" />
                    New order
                </button>
            }
        </div>
        <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            @if (list.value(); as rows) {
                @if (rows.length) {
                    <fm-card flush>
                        <ul class="divide-y divide-border">
                            @for (o of rows; track o.oid) {
                                <li>
                                    <button
                                        class="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left hover:bg-surface-sunken"
                                        type="button"
                                        [class.bg-accent-soft]="open()?.oid === o.oid"
                                        (click)="show(o.oid)"
                                    >
                                        <span class="min-w-0 flex-1">
                                            <span class="block font-mono text-sm">{{ o.code }}</span>
                                            <span class="block truncate text-sm text-fg-muted">
                                                {{ hq() ? o.branch.name + ' · ' : '' }}{{ o.supplier.name }} · {{ o.raised_at | appDate: 'd MMM' }}
                                            </span>
                                        </span>
                                        <span class="text-sm tabular-nums">{{ o.total | taka: 0 }}</span>
                                        <fm-badge [tone]="statusOf[o.status].tone">{{ statusOf[o.status].label }}</fm-badge>
                                    </button>
                                </li>
                            }
                        </ul>
                    </fm-card>
                } @else {
                    <fm-empty-state icon="package" title="No purchase orders" />
                }
            } @else {
                <fm-skeleton height="14rem" />
            }
            @if (open(); as o) {
                <fm-card>
                    <div class="flex flex-wrap items-start gap-2">
                        <div class="min-w-0 flex-1">
                            <h2 class="font-mono text-lg font-semibold">{{ o.code }}</h2>
                            <p class="text-sm text-fg-muted">
                                {{ o.branch.name }} · {{ o.supplier.name }}{{ o.supplier.phone ? ' · ' + o.supplier.phone : '' }} · raised by
                                {{ o.raised_by_name }},
                                {{ o.raised_at | appDate: 'd MMM yyyy' }}
                            </p>
                        </div>
                        <fm-badge [tone]="statusOf[o.status].tone">{{ statusOf[o.status].label }}</fm-badge>
                    </div>
                    @if (o.note) {
                        <p class="mt-2 text-sm">{{ o.note }}</p>
                    }
                    <table class="fm-table mt-3">
                        <caption class="fm-sr-only">Lines</caption>
                        <thead>
                            <tr>
                                <th scope="col">Product</th>
                                <th class="text-right" scope="col">Qty</th>
                                <th class="text-right" scope="col">Unit cost</th>
                                <th class="text-right" scope="col">Received</th>
                            </tr>
                        </thead>
                        <tbody>
                            @for (l of o.lines; track l.oid) {
                                <tr>
                                    <td>{{ l.name }}</td>
                                    <td class="text-right tabular-nums">{{ l.qty }}</td>
                                    <td class="text-right tabular-nums">{{ l.unit_cost | taka }}</td>
                                    <td class="text-right tabular-nums">{{ l.received }}</td>
                                </tr>
                            }
                        </tbody>
                        <tfoot>
                            <tr>
                                <td class="font-medium">Total</td>
                                <td></td>
                                <td class="text-right font-medium tabular-nums">{{ o.total | taka: 0 }}</td>
                                <td class="text-right tabular-nums">{{ o.received }} / {{ o.ordered }}</td>
                            </tr>
                        </tfoot>
                    </table>
                    @if (o.decided_at) {
                        <p class="mt-3 text-sm text-fg-muted">
                            {{ o.status === 'rejected' ? 'Rejected' : 'Approved' }} by {{ o.decided_by_name }}, {{ o.decided_at | appDate: 'd MMM'
                            }}{{ o.decision_note ? ': ' + o.decision_note : '' }}
                        </p>
                    }
                    @if (o.cancel_reason) {
                        <p class="mt-1 text-sm text-fg-muted">Cancelled: {{ o.cancel_reason }}</p>
                    }
                    @for (d of o.deliveries ?? []; track d.oid) {
                        <p class="mt-1 text-sm text-fg-muted">
                            Received {{ d.received_on | appDate }} by {{ d.by_name }}:
                            @for (l of d.lines; track l.line_oid; let last = $last) {
                                {{ l.qty }} {{ l.name }}{{ last ? '' : ',' }}
                            }
                            {{ d.note ? '· ' + d.note : '' }}
                        </p>
                    }
                    <div class="mt-4 flex flex-wrap gap-2">
                        @if (hq() && o.status === 'pending' && auth.can('update', 'PurchaseOrder')) {
                            <button fmButton variant="primary" (click)="decide(o, true)">Approve</button>
                            <button fmButton (click)="decide(o, false)">Reject</button>
                        }
                        @if (!hq() && auth.can('update', 'PurchaseOrder')) {
                            @if (o.status === 'approved') {
                                <button fmButton variant="primary" (click)="sent(o)">Mark as sent to supplier</button>
                            }
                            @if (o.status === 'approved' || o.status === 'sent' || o.status === 'partial') {
                                <button fmButton [variant]="o.status === 'approved' ? 'secondary' : 'primary'" (click)="receive(o)">Receive a delivery</button>
                            }
                            @if (o.status === 'pending' || o.status === 'approved' || o.status === 'sent') {
                                <button fmButton variant="ghost" (click)="cancel(o)">Cancel order</button>
                            }
                        }
                        <button fmButton variant="ghost" (click)="copy(o)">
                            <fm-icon name="copy" size="1rem" />
                            Copy for the supplier
                        </button>
                        <button fmButton variant="ghost" (click)="print(o)">
                            <fm-icon name="printer" size="1rem" />
                            Print
                        </button>
                    </div>
                </fm-card>
            }
        </div>
    `
})
export class PurchaseOrdersComponent {
    protected readonly auth = inject(AuthService);
    private readonly _service = inject(BusinessService);
    private readonly _dialog = inject(DialogService);
    private readonly _toast = inject(ToastService);
    /** HQ: every branch's orders, to approve. */
    readonly hq = input(false);
    protected readonly statusOf = PO_STATUS;
    protected readonly statuses: SelectOption<string>[] = [
        { value: '', label: 'All' },
        ...Object.entries(PO_STATUS).map(([value, s]) => ({ value, label: s.label }))
    ];
    protected readonly status = signal('');
    private readonly _filters = computed(() => ({ status: this.status() || undefined }));
    protected readonly list = rxResource({ params: this._filters, stream: ({ params }) => this._service.orders(params) });
    protected readonly open = signal<PurchaseOrder | null>(null);

    raise(start: { product_oid: string; qty: number }[]): void {
        this._dialog
            .open<OrderDialogComponent, OrderDialogData, PurchaseOrder>(OrderDialogComponent, { data: { kind: 'order', start }, size: 'lg' })
            .afterClosed.pipe(filter((v): v is PurchaseOrder => !!v))
            .subscribe(o => {
                this._toast.show(`${o.code} is waiting for HQ's approval.`, { tone: 'success', title: 'Order raised' });
                this._done(o);
            });
    }

    protected show(oid: string): void {
        this._service.order(oid).subscribe(o => this.open.set(o));
    }

    protected decide(o: PurchaseOrder, approve: boolean): void {
        this._dialog
            .open<TextPromptDialogComponent, TextPromptData, TextPromptResult>(TextPromptDialogComponent, {
                data: approve
                    ? {
                          title: `Approve ${o.code}`,
                          description: 'The branch then sends it to the supplier.',
                          label: 'Note (optional)',
                          okText: 'Approve',
                          minLength: 0
                      }
                    : { title: `Reject ${o.code}`, description: 'The branch sees your reason.', label: 'Why', okText: 'Reject', minLength: 3, danger: true },
                size: 'sm'
            })
            .afterClosed.pipe(filter((v): v is TextPromptResult => !!v))
            .subscribe(r => this._service.decide(o.oid, approve, r.text.trim() || null).subscribe(x => this._done(x)));
    }

    protected sent(o: PurchaseOrder): void {
        this._service.markSent(o.oid).subscribe(x => this._done(x));
    }

    protected receive(o: PurchaseOrder): void {
        const today = todayIso();
        this._dialog
            .open<QtyLinesDialogComponent, QtyLinesData, QtyLinesResult>(QtyLinesDialogComponent, {
                data: {
                    title: `Receive: ${o.code}`,
                    description: 'What came in, at what it cost this time. The rest stays on order.',
                    okText: 'Receive',
                    costs: true,
                    date: { min: addDays(today, -7), max: today },
                    lines: o.lines
                        .filter(l => l.outstanding > 0)
                        .map(l => ({ oid: l.oid, name: l.name, max: l.outstanding, qty: l.outstanding, cost: l.unit_cost }))
                }
            })
            .afterClosed.pipe(filter((v): v is QtyLinesResult => !!v))
            .subscribe(r =>
                this._service
                    .receive(o.oid, {
                        received_on: r.date ?? undefined,
                        note: r.note,
                        lines: r.lines.filter(l => l.qty > 0).map(l => ({ line_oid: l.oid, qty: l.qty, unit_cost: l.cost }))
                    })
                    .subscribe(x => this._done(x))
            );
    }

    protected cancel(o: PurchaseOrder): void {
        this._dialog
            .open<TextPromptDialogComponent, TextPromptData, TextPromptResult>(TextPromptDialogComponent, {
                data: { title: `Cancel ${o.code}`, label: 'Why', okText: 'Cancel order', minLength: 3, danger: true },
                size: 'sm'
            })
            .afterClosed.pipe(filter((v): v is TextPromptResult => !!v))
            .subscribe(r => this._service.cancelOrder(o.oid, r.text).subscribe(x => this._done(x)));
    }

    protected copy(o: PurchaseOrder): void {
        void navigator.clipboard
            ?.writeText(this._text(o))
            .then(() => this._toast.show('Paste it into WhatsApp or an email.', { tone: 'success', title: 'Copied' }));
    }

    protected print(o: PurchaseOrder): void {
        const w = window.open('', '_blank', 'width=720,height=800');
        if (!w) return;
        w.document.title = o.code;
        const pre = w.document.createElement('pre');
        pre.style.cssText = 'font:14px/1.5 system-ui,sans-serif;white-space:pre-wrap;padding:24px';
        pre.textContent = this._text(o);
        w.document.body.append(pre);
        w.document.close();
        w.print();
    }

    private _done(o: PurchaseOrder): void {
        this.list.reload();
        this.show(o.oid);
    }

    /** The order as plain text: for WhatsApp or email (no integration). */
    private _text(o: PurchaseOrder): string {
        return [
            `Purchase order ${o.code}`,
            `${o.branch.name} branch`,
            `To: ${o.supplier.name}${o.supplier.contact_name ? ` (${o.supplier.contact_name})` : ''}`,
            '',
            ...o.lines.map(l => `${l.qty} × ${l.name} (${l.code}) at ৳${l.unit_cost}`),
            '',
            `Total: ৳${o.total.toLocaleString('en-US')}`,
            ...(o.note ? ['', o.note] : [])
        ].join('\n');
    }
}
