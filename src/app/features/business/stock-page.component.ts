import { ChangeDetectionStrategy, Component, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { AuthService } from '@core/auth/auth.service';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { TabDirective, TabsComponent } from '@shared/ui/tabs/tabs.component';

import { PurchaseOrdersComponent } from './purchase-orders.component';
import { StockLevelsComponent } from './stock-levels.component';
import { TransfersComponent } from './transfers.component';

/**
 * `/console/:branch/stock`: the branch's stock and ledger, its purchase orders and its transfers. HQ's
 * purchase orders page (`/hq/purchase-orders`) is the same orders panel with `hq`.
 */
const TABS = ['stock', 'orders', 'transfers'] as const;

@Component({
    selector: 'app-stock-page',
    imports: [PageHeaderComponent, TabsComponent, TabDirective, StockLevelsComponent, PurchaseOrdersComponent, TransfersComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (hq) {
            <app-page-header subtitle="Branches raise them; HQ approves or rejects" title="Purchase orders" />
            <app-purchase-orders [hq]="true" />
        } @else {
            <app-page-header subtitle="What is on the shelf, what is coming, and from where" title="Stock" />
            <fm-tabs [(active)]="tab">
                <ng-template fmTab="stock" label="Stock">
                    <app-stock-levels (reorder)="order($event)" />
                </ng-template>
                @if (auth.can('read', 'PurchaseOrder')) {
                    <ng-template fmTab="orders" label="Purchase orders">
                        <app-purchase-orders />
                    </ng-template>
                }
                @if (auth.can('read', 'Transfer')) {
                    <ng-template fmTab="transfers" label="Transfers">
                        <app-transfers />
                    </ng-template>
                }
            </fm-tabs>
        }
    `
})
export class StockPageComponent {
    protected readonly auth = inject(AuthService);
    private readonly _route = inject(ActivatedRoute).snapshot;
    protected readonly hq = this._route.data['hq'] === true;
    /** `?tab=orders` / `?tab=transfers` open those tabs (the inbox's links). */
    protected readonly tab = signal<string>(TABS.find(t => t === this._route.queryParamMap.get('tab')) ?? 'stock');
    private readonly _orders = viewChild(PurchaseOrdersComponent);

    /** "Order the low ones": the orders tab, with a new order started for them. */
    protected order(lines: { product_oid: string; qty: number }[]): void {
        this.tab.set('orders');
        setTimeout(() => this._orders()?.raise(lines));
    }
}
