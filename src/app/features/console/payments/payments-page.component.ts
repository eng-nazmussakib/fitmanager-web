import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import { PAYMENT_METHOD_LABELS } from '@core/models/subscription.model';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { TakaPipe } from '@shared/pipes/taka.pipe';
import { CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';

import { ConsoleService } from '../console.service';

/**
 * Payments at the branch: today's cash closing by method (what the desk counts at the end of the day), the
 * latest payments, and the members who owe the most.
 */
@Component({
    selector: 'app-payments-page',
    imports: [RouterLink, PageHeaderComponent, AppDatePipe, TakaPipe, CardComponent, SkeletonComponent, EmptyStateComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-page-header subtitle="Cash, card, bKash, Nagad and bank payments, recorded at the desk" title="Payments" />
        <section class="grid gap-3 sm:grid-cols-3 xl:grid-cols-6" aria-label="Cash closing">
            @if (closing.value(); as c) {
                <fm-card class="sm:col-span-3 xl:col-span-1">
                    <p class="text-sm text-fg-muted">Today's takings</p>
                    <p class="mt-1 text-2xl font-semibold tabular-nums">{{ c.total | taka: 0 }}</p>
                    <p class="mt-1 text-xs text-fg-subtle">{{ c.invoices }} sales · {{ c.new_members }} new · {{ c.renewals }} renewals</p>
                </fm-card>
                @for (m of c.by_method; track m.method) {
                    <fm-card>
                        <p class="text-sm text-fg-muted">{{ labels[m.method] }}</p>
                        <p class="mt-1 text-xl font-semibold tabular-nums">{{ m.amount | taka: 0 }}</p>
                        <p class="mt-1 text-xs text-fg-subtle">{{ m.count }} payment{{ m.count === 1 ? '' : 's' }}</p>
                    </fm-card>
                }
            } @else {
                @for (i of [1, 2, 3, 4, 5, 6]; track i) {
                    <fm-card><fm-skeleton height="3.5rem" /></fm-card>
                }
            }
        </section>

        <div class="mt-4 grid gap-4 xl:grid-cols-3">
            <fm-card class="xl:col-span-2" flush title="Latest payments">
                @if (data.value(); as d) {
                    <div class="overflow-x-auto">
                        <table class="fm-table">
                            <caption class="fm-sr-only">Latest payments</caption>
                            <thead>
                                <tr>
                                    <th scope="col">When</th>
                                    <th scope="col">Member</th>
                                    <th scope="col">Invoice</th>
                                    <th scope="col">Method</th>
                                    <th class="fm-num" scope="col">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                @for (p of d.payments; track p.oid) {
                                    <tr>
                                        <td class="whitespace-nowrap">{{ p.received_at | appDate: 'dd MMM, h:mm a' }}</td>
                                        <td>
                                            <a class="text-fg hover:underline" [routerLink]="['../members', p.member_oid]">{{ p.member_name }}</a>
                                        </td>
                                        <td class="font-mono text-xs">{{ p.invoice_number }}</td>
                                        <td>
                                            {{ labels[p.method] }}
                                            @if (p.reference) {
                                                <span class="block text-xs text-fg-subtle">{{ p.reference }}</span>
                                            }
                                        </td>
                                        <td class="fm-num">{{ p.amount | taka: 0 }}</td>
                                    </tr>
                                }
                            </tbody>
                        </table>
                    </div>
                } @else {
                    <div class="p-5">
                        <fm-skeleton />
                        <fm-skeleton class="mt-3" />
                    </div>
                }
            </fm-card>
            <fm-card flush title="Highest dues">
                @if (data.value()?.top_dues; as dues) {
                    @if (dues.length) {
                        <ul class="divide-y divide-border">
                            @for (d of dues; track d.member_oid) {
                                <li>
                                    <a
                                        class="flex items-center justify-between gap-3 px-5 py-3 text-fg no-underline hover:bg-surface-sunken"
                                        [queryParams]="{ tab: 'payments' }"
                                        [routerLink]="['../members', d.member_oid]"
                                    >
                                        <span class="min-w-0">
                                            <span class="block truncate text-sm font-medium">{{ d.member_name }}</span>
                                            <span class="text-xs text-fg-subtle">{{ d.member_code }}</span>
                                        </span>
                                        <span class="text-sm font-semibold text-danger-fg tabular-nums">{{ d.dues | taka: 0 }}</span>
                                    </a>
                                </li>
                            }
                        </ul>
                    } @else {
                        <fm-empty-state icon="badge-check" title="Nobody owes money" />
                    }
                }
            </fm-card>
        </div>
    `
})
export class PaymentsPageComponent {
    private readonly _service = inject(ConsoleService);

    protected readonly labels = PAYMENT_METHOD_LABELS;
    protected readonly closing = rxResource({ stream: () => this._service.cashClosing() });
    protected readonly data = rxResource({ stream: () => this._service.payments() });
}
