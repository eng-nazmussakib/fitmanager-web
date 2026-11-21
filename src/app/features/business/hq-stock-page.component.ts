import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';

import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { TakaPipe } from '@shared/pipes/taka.pipe';
import { BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';

import { BusinessService } from './business.service';

/** `/hq/stock` (D-101): every product at every branch, the low ones marked, and the stock's value at cost. */
@Component({
    selector: 'app-hq-stock-page',
    imports: [TakaPipe, PageHeaderComponent, BadgeComponent, CardComponent, SkeletonComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-page-header
            title="Stock"
            [subtitle]="data.value() ? 'Worth ' + (data.value()!.value | taka: 0) + ' at cost, across the branches' : 'Across the branches'"
        />
        @if (data.value(); as d) {
            <fm-card flush>
                <div class="overflow-x-auto">
                    <table class="fm-table">
                        <caption class="fm-sr-only">Stock by branch</caption>
                        <thead>
                            <tr>
                                <th scope="col">Product</th>
                                @for (b of d.branches; track b.oid) {
                                    <th class="text-right" scope="col">{{ b.name }}</th>
                                }
                            </tr>
                        </thead>
                        <tbody>
                            @for (r of d.rows; track r.product_oid) {
                                <tr>
                                    <td>
                                        {{ r.name }}
                                        <span class="block font-mono text-xs text-fg-subtle">{{ r.code }}</span>
                                    </td>
                                    @for (c of r.cells; track c.branch_oid) {
                                        <td class="text-right tabular-nums">
                                            @if (c.on_hand === 0) {
                                                <fm-badge tone="danger">0</fm-badge>
                                            } @else if (c.low) {
                                                <fm-badge tone="warning">{{ c.on_hand }}</fm-badge>
                                            } @else {
                                                {{ c.on_hand }}
                                            }
                                        </td>
                                    }
                                </tr>
                            }
                        </tbody>
                    </table>
                </div>
            </fm-card>
        } @else {
            <fm-skeleton height="16rem" />
        }
    `
})
export class HqStockPageComponent {
    private readonly _service = inject(BusinessService);
    protected readonly data = rxResource({ stream: () => this._service.hqStock() });
}
