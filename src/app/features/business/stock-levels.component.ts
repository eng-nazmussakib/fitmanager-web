import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { filter } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { BranchContextService } from '@core/branch/branch-context.service';
import { ADJUST_REASON_LABEL, type Ledger, MOVEMENT_LABEL, type StockLevel } from '@core/models/business.model';
import type { ExportFormat } from '@core/models/report.model';
import { ReportsService } from '@features/reports/reports.service';
import { ExportMenuComponent } from '@shared/components/export-menu/export-menu.component';
import { CanDirective } from '@shared/directives/can.directive';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { TakaPipe } from '@shared/pipes/taka.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogService } from '@shared/ui/dialog/dialog.service';
import { BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { NumberInputComponent } from '@shared/ui/forms/number-input.component';
import { SwitchComponent } from '@shared/ui/forms/switch.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { AdjustDialogComponent } from './adjust-dialog.component';
import { BusinessService } from './business.service';

/**
 * A branch's stock (D-101): every product with what is on hand, its reorder level and a "low" badge at or below it,
 * what is on order and in transit; costs for the branch manager only. A product's ledger shows every move with the
 * running balance; the manager adjusts and sets the reorder level there.
 */
@Component({
    selector: 'app-stock-levels',
    imports: [
        ExportMenuComponent,
        CanDirective,
        FormsModule,
        AppDatePipe,
        TakaPipe,
        ButtonComponent,
        BadgeComponent,
        CardComponent,
        SkeletonComponent,
        EmptyStateComponent,
        FieldComponent,
        InputDirective,
        NumberInputComponent,
        SwitchComponent,
        IconComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="mb-4 flex flex-wrap items-end gap-4">
            <fm-field class="w-56" label="Search"><input fmInput placeholder="Name or code" [ngModel]="q()" (ngModelChange)="q.set($event)" /></fm-field>
            <fm-switch [ngModel]="low()" (ngModelChange)="low.set($event)">Low only</fm-switch>
            <app-export-menu *appCan="'export'; on: 'Report'" label="Export the stock" size="sm" [busy]="exporting()" (export)="exportStock($event)" />
            @if (levels.value(); as l) {
                <span class="ml-auto text-sm text-fg-muted">
                    {{ l.low }} low{{ l.value !== null ? ' · stock worth ' + (l.value | taka: 0) + ' at cost' : '' }}
                </span>
                @if (canOrder && l.low) {
                    <button fmButton size="sm" (click)="reorder.emit(lowOnes())">
                        <fm-icon name="package" size="1rem" />
                        Order the low ones
                    </button>
                }
            }
        </div>
        <div class="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            @if (levels.value(); as l) {
                @if (l.rows.length) {
                    <fm-card flush>
                        <div class="overflow-x-auto">
                            <table class="fm-table">
                                <caption class="fm-sr-only">Stock</caption>
                                <thead>
                                    <tr>
                                        <th scope="col">Product</th>
                                        <th class="text-right" scope="col">On hand</th>
                                        <th class="text-right" scope="col">Reorder at</th>
                                        <th class="text-right" scope="col">Coming</th>
                                        @if (l.value !== null) {
                                            <th class="text-right" scope="col">Avg cost</th>
                                        }
                                    </tr>
                                </thead>
                                <tbody>
                                    @for (r of l.rows; track r.product_oid) {
                                        <tr
                                            class="cursor-pointer hover:bg-surface-sunken"
                                            [class.bg-accent-soft]="open()?.product?.product_oid === r.product_oid"
                                            (click)="show(r)"
                                        >
                                            <td>
                                                <span class="flex items-center gap-2">
                                                    @if (r.photo_url) {
                                                        <img class="size-8 rounded object-cover" alt="" [src]="r.photo_url" />
                                                    }
                                                    <span>
                                                        {{ r.name }}
                                                        <span class="block font-mono text-xs text-fg-subtle">{{ r.code }}</span>
                                                    </span>
                                                </span>
                                            </td>
                                            <td class="text-right tabular-nums">
                                                @if (r.on_hand === 0) {
                                                    <fm-badge tone="danger">Out</fm-badge>
                                                } @else if (r.low) {
                                                    <fm-badge tone="warning">{{ r.on_hand }} low</fm-badge>
                                                } @else {
                                                    {{ r.on_hand }}
                                                }
                                            </td>
                                            <td class="text-right tabular-nums">{{ r.reorder_level }}</td>
                                            <td class="text-right text-sm text-fg-muted tabular-nums">
                                                {{ r.on_order ? r.on_order + ' ordered' : '' }}{{ r.on_order && r.in_transit ? ' · ' : ''
                                                }}{{ r.in_transit ? r.in_transit + ' on the way' : '' }}
                                            </td>
                                            @if (l.value !== null) {
                                                <td class="text-right tabular-nums">{{ r.avg_cost | taka }}</td>
                                            }
                                        </tr>
                                    }
                                </tbody>
                            </table>
                        </div>
                    </fm-card>
                } @else {
                    <fm-empty-state icon="package" title="Nothing here" />
                }
            } @else {
                <fm-skeleton height="16rem" />
            }
            @if (open(); as o) {
                <fm-card>
                    <h2 class="text-lg font-semibold">{{ o.product.name }}</h2>
                    <p class="text-sm text-fg-muted">
                        {{ o.product.on_hand }} on hand · sells at {{ o.product.price | taka: 0
                        }}{{ o.product.avg_cost !== null ? ' · average cost ' + (o.product.avg_cost | taka) : ''
                        }}{{ o.product.last_cost !== null ? ' · last bought at ' + (o.product.last_cost | taka) : '' }}
                    </p>
                    @if (canAdjust) {
                        <div class="mt-3 flex flex-wrap items-end gap-2">
                            <button fmButton size="sm" (click)="adjust(o.product)">Adjust</button>
                            <fm-field class="w-32" label="Reorder at"><fm-number-input [min]="0" [(ngModel)]="level" /></fm-field>
                            <button fmButton size="sm" variant="ghost" [disabled]="level === o.product.reorder_level" (click)="saveLevel(o.product)">
                                Save
                            </button>
                        </div>
                    }
                    <h3 class="mt-5 mb-2 font-medium">Ledger</h3>
                    @if (o.movements.length) {
                        <ul class="divide-y divide-border text-sm">
                            @for (m of o.movements; track m.oid) {
                                <li class="flex flex-wrap items-baseline gap-x-3 py-2">
                                    <span class="w-24 shrink-0 text-xs text-fg-muted">{{ m.at | appDate: 'd MMM, h:mm a' }}</span>
                                    <span class="min-w-0 flex-1">
                                        {{ kind[m.kind] }}{{ m.reason ? ': ' + reason[m.reason] : '' }}
                                        @if (m.ref_label) {
                                            <span class="font-mono text-xs text-fg-muted">{{ m.ref_label }}</span>
                                        }
                                        <span class="block text-xs text-fg-muted">{{ m.by_name }}{{ m.note ? ' · ' + m.note : '' }}</span>
                                    </span>
                                    <span class="tabular-nums" [class.text-danger]="m.qty < 0" [class.text-success]="m.qty > 0">
                                        {{ m.qty > 0 ? '+' : '' }}{{ m.qty }}
                                    </span>
                                    <span class="w-12 text-right font-medium tabular-nums">{{ m.on_hand_after }}</span>
                                </li>
                            }
                        </ul>
                    } @else {
                        <p class="text-sm text-fg-muted">No moves yet.</p>
                    }
                </fm-card>
            }
        </div>
    `
})
export class StockLevelsComponent {
    protected readonly auth = inject(AuthService);
    private readonly _service = inject(BusinessService);
    private readonly _dialog = inject(DialogService);
    /** Raise an order for these (the low ones). */
    readonly reorder = output<{ product_oid: string; qty: number }[]>();
    protected readonly canAdjust = this.auth.can('update', 'Stock');
    protected readonly canOrder = this.auth.can('create', 'PurchaseOrder');
    protected readonly kind = MOVEMENT_LABEL;
    protected readonly reason = ADJUST_REASON_LABEL;
    protected readonly q = signal('');
    protected readonly low = signal(false);
    protected readonly exporting = signal(false);
    private readonly _reports = inject(ReportsService);
    private readonly _active = inject(BranchContextService).active;
    private readonly _filters = computed(() => ({ q: this.q().trim(), low: this.low() }));
    protected readonly levels = rxResource({ params: this._filters, stream: ({ params }) => this._service.stock(params) });
    protected readonly open = signal<Ledger | null>(null);
    protected level = 0;

    protected readonly lowOnes = computed(() =>
        (this.levels.value()?.rows ?? [])
            .filter(r => r.low && r.on_order === 0)
            .map(r => ({ product_oid: r.product_oid, qty: Math.max(r.reorder_level * 2 - r.on_hand, 1) }))
    );

    reload(): void {
        this.levels.reload();
        const o = this.open();
        if (o) this.show(o.product);
    }

    /** The stock as Excel or PDF, with the same filters (D-107; costs only for those who see them). */
    protected async exportStock(format: ExportFormat): Promise<void> {
        this.exporting.set(true);
        try {
            await this._reports.exportList('stock', { filters: { q: this.q().trim() || undefined, low: this.low() ? '1' : undefined } }, format, {
                title: 'Stock',
                subtitle: `${this._active()?.name ?? ''}${this.low() ? ' · low only' : ''}`
            });
        } finally {
            this.exporting.set(false);
        }
    }

    protected show(r: StockLevel): void {
        this._service.ledger(r.product_oid).subscribe(l => {
            this.level = l.product.reorder_level;
            this.open.set(l);
        });
    }

    protected adjust(r: StockLevel): void {
        this._dialog
            .open<AdjustDialogComponent, StockLevel, boolean>(AdjustDialogComponent, { data: r, size: 'sm' })
            .afterClosed.pipe(filter(v => !!v))
            .subscribe(() => this.reload());
    }

    protected saveLevel(r: StockLevel): void {
        this._service.setReorderLevel(r.product_oid, this.level).subscribe(() => this.reload());
    }
}
