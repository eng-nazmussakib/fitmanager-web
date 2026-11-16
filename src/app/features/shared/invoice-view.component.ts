import { ChangeDetectionStrategy, Component, ElementRef, inject, input, signal } from '@angular/core';

import { TENANT } from '@config/tenant';
import type { Invoice } from '@core/models/payment.model';
import { PAYMENT_METHOD_LABELS } from '@core/models/subscription.model';
import { exportElementToPdf } from '@core/utils/pdf.utils';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { TakaPipe } from '@shared/pipes/taka.pipe';
import { VatPercentPipe } from '@shared/pipes/vat-percent.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { BadgeComponent } from '@shared/ui/display/display';
import { IconComponent } from '@shared/ui/icon/icon.component';

/**
 * An invoice as a receipt (H4, profile, portal): on screen, as a PDF (jsPDF, rendered from this element) and printed.
 * The receipt part is always light, whatever the theme, so the PDF and the print look like paper.
 */
@Component({
    selector: 'app-invoice-view',
    imports: [AppDatePipe, TakaPipe, VatPercentPipe, ButtonComponent, BadgeComponent, IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'block' },
    template: `
        @let inv = invoice();
        <article #paper class="invoice-paper rounded-lg border border-zinc-200 bg-white p-6 text-zinc-900 sm:p-8" [attr.aria-label]="'Invoice ' + inv.number">
            <header class="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200 pb-4">
                <div>
                    <p class="text-lg font-bold">{{ brand }}</p>
                    <p class="text-sm text-zinc-600">{{ inv.branch.name }} branch</p>
                    @if (inv.vat_bin) {
                        <p class="text-xs text-zinc-500">VAT BIN {{ inv.vat_bin }}</p>
                    }
                </div>
                <div class="text-right">
                    <p class="text-sm font-semibold tracking-wide text-zinc-500 uppercase">Receipt</p>
                    <p class="font-mono text-sm">{{ inv.number }}</p>
                    <p class="text-sm text-zinc-600">{{ inv.issued_at | appDate: 'dd MMM yyyy, h:mm a' }}</p>
                </div>
            </header>
            <div class="grid gap-1 py-4 text-sm sm:grid-cols-2">
                <p>
                    <span class="text-zinc-500">Member:</span>
                    {{ inv.member_name }}
                </p>
                <p class="sm:text-right">
                    <span class="text-zinc-500">Code:</span>
                    {{ inv.member_code }}
                </p>
                <p>
                    <span class="text-zinc-500">Mobile:</span>
                    {{ inv.member_phone }}
                </p>
            </div>
            <table class="w-full text-sm">
                <thead>
                    <tr class="border-b border-zinc-200 text-left text-zinc-500">
                        <th class="py-2 font-medium" scope="col">Item</th>
                        <th class="py-2 text-right font-medium" scope="col">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    @for (l of inv.lines; track $index) {
                        <tr class="border-b border-zinc-100">
                            <td class="py-2">{{ l.label }}</td>
                            <td class="py-2 text-right tabular-nums">{{ l.amount | taka }}</td>
                        </tr>
                    }
                </tbody>
                <tfoot class="tabular-nums">
                    <tr>
                        <td class="pt-3 text-zinc-500">Subtotal</td>
                        <td class="pt-3 text-right">{{ inv.subtotal - inv.discount | taka }}</td>
                    </tr>
                    @if (inv.vat_rate > 0) {
                        <tr>
                            <td class="text-zinc-500">VAT ({{ inv.vat_rate | vatPercent }})</td>
                            <td class="text-right">{{ inv.vat | taka }}</td>
                        </tr>
                    }
                    <tr class="text-base font-semibold">
                        <td class="pt-1">Total</td>
                        <td class="pt-1 text-right">{{ inv.total | taka }}</td>
                    </tr>
                    <tr>
                        <td class="text-zinc-500">Paid</td>
                        <td class="text-right">{{ inv.paid | taka }}</td>
                    </tr>
                    @if (inv.due > 0) {
                        <tr class="font-semibold text-red-700">
                            <td>Due</td>
                            <td class="text-right">{{ inv.due | taka }}</td>
                        </tr>
                    }
                </tfoot>
            </table>
            @if (inv.payments.length) {
                <div class="mt-5 border-t border-zinc-200 pt-3 text-xs text-zinc-600">
                    <p class="mb-1 font-semibold text-zinc-700">Payments</p>
                    @for (p of inv.payments; track p.oid) {
                        <p>
                            {{ p.received_at | appDate: 'dd MMM yyyy, h:mm a' }} · {{ methods[p.method] }}{{ p.reference ? ' · ref ' + p.reference : '' }} ·
                            {{ p.amount | taka }} · received by {{ p.received_by }}
                        </p>
                    }
                </div>
            }
            <p class="mt-6 text-center text-xs text-zinc-500">Thank you for training with {{ brand }}. Keep this receipt for your records.</p>
        </article>
        @if (actions()) {
            <div class="do-not-print mt-3 flex flex-wrap items-center gap-2">
                <fm-badge dot [tone]="inv.status === 'Paid' ? 'success' : 'warning'">{{ inv.status }}</fm-badge>
                <span class="flex-1"></span>
                <button fmButton [loading]="exporting()" (click)="pdf()">
                    <fm-icon name="download" />
                    Download PDF
                </button>
                <button fmButton (click)="print()">
                    <fm-icon name="printer" />
                    Print
                </button>
            </div>
        }
    `,
    styles: `
        @media print {
            :host {
                position: fixed;
                inset: 0;
                z-index: 9999;
                background: #fff;
            }
        }
    `
})
export class InvoiceViewComponent {
    private readonly _el = inject<ElementRef<HTMLElement>>(ElementRef);

    readonly invoice = input.required<Invoice>();
    readonly actions = input(true);

    protected readonly brand = TENANT.brand.name;
    protected readonly methods = PAYMENT_METHOD_LABELS;
    protected readonly exporting = signal(false);

    protected async pdf(): Promise<void> {
        const paper = this._el.nativeElement.querySelector<HTMLElement>('.invoice-paper');
        if (!paper) return;
        this.exporting.set(true);
        try {
            await exportElementToPdf(paper, `${this.invoice().number}.pdf`);
        } finally {
            this.exporting.set(false);
        }
    }

    protected print(): void {
        this._el.nativeElement.ownerDocument.defaultView?.print();
    }
}
