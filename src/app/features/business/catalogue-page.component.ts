import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { filter } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { type Product, PRODUCT_CATEGORY_LABEL, type Supplier } from '@core/models/business.model';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { TakaPipe } from '@shared/pipes/taka.pipe';
import { VatPercentPipe } from '@shared/pipes/vat-percent.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogService } from '@shared/ui/dialog/dialog.service';
import { BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { SwitchComponent } from '@shared/ui/forms/switch.component';
import { IconComponent } from '@shared/ui/icon/icon.component';
import { TabDirective, TabsComponent } from '@shared/ui/tabs/tabs.component';

import { BusinessService } from './business.service';
import { ProductDialogComponent } from './product-dialog.component';
import { SupplierDialogComponent } from './supplier-dialog.component';

/** `/hq/catalogue`: HQ's products (prices, VAT, photos) and suppliers, the same for every branch. */
@Component({
    selector: 'app-catalogue-page',
    imports: [
        FormsModule,
        TakaPipe,
        VatPercentPipe,
        PageHeaderComponent,
        ButtonComponent,
        BadgeComponent,
        CardComponent,
        SkeletonComponent,
        EmptyStateComponent,
        FieldComponent,
        InputDirective,
        SwitchComponent,
        IconComponent,
        TabsComponent,
        TabDirective
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-page-header subtitle="What the branches sell, at HQ's prices, and who supplies it" title="Catalogue">
            @if (tab() === 'products' && auth.can('create', 'Product')) {
                <button fmButton variant="primary" (click)="product(null)">
                    <fm-icon name="plus" />
                    New product
                </button>
            }
            @if (tab() === 'suppliers' && auth.can('create', 'Supplier')) {
                <button fmButton variant="primary" (click)="supplier(null)">
                    <fm-icon name="plus" />
                    New supplier
                </button>
            }
        </app-page-header>
        <fm-tabs [(active)]="tab">
            <ng-template fmTab="products" label="Products">
                <div class="mb-4 flex flex-wrap items-end gap-4">
                    <fm-field class="w-60" label="Search">
                        <input fmInput placeholder="Name or code" [ngModel]="q()" (ngModelChange)="q.set($event)" />
                    </fm-field>
                    <fm-switch [ngModel]="all()" (ngModelChange)="all.set($event)">Show products off sale</fm-switch>
                </div>
                @if (products.value()) {
                    @if (shown().length) {
                        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            @for (p of shown(); track p.oid) {
                                <fm-card>
                                    <div class="flex gap-3">
                                        @if (p.photos[0]; as ph) {
                                            <img class="size-20 shrink-0 rounded-lg object-cover" alt="" [src]="ph.url" />
                                        } @else {
                                            <span class="grid size-20 shrink-0 place-items-center rounded-lg bg-surface-sunken text-fg-subtle">
                                                <fm-icon name="image" />
                                            </span>
                                        }
                                        <div class="min-w-0 flex-1">
                                            <p class="font-medium">{{ p.name }}</p>
                                            <p class="text-sm text-fg-muted">
                                                <span class="font-mono text-xs">{{ p.code }}</span>
                                                · {{ category[p.category] }} · per {{ p.unit }}
                                            </p>
                                            <p class="mt-1 text-sm">
                                                {{ p.price | taka: 0 }} · VAT {{ p.vat_rate_applied | vatPercent }}{{ p.vat_rate !== null ? ' (its own)' : '' }}
                                            </p>
                                            <p class="text-xs text-fg-muted">{{ p.supplier_name ?? 'No usual supplier' }} · reorder at {{ p.reorder_level }}</p>
                                        </div>
                                    </div>
                                    <div class="mt-3 flex items-center gap-2">
                                        @if (!p.active) {
                                            <fm-badge>Off sale</fm-badge>
                                        }
                                        @if (auth.can('update', 'Product')) {
                                            <button class="ml-auto" fmButton size="sm" (click)="product(p)">Edit</button>
                                        }
                                    </div>
                                </fm-card>
                            }
                        </div>
                    } @else {
                        <fm-empty-state icon="package" title="No products" />
                    }
                } @else {
                    <fm-skeleton height="14rem" />
                }
            </ng-template>
            <ng-template fmTab="suppliers" label="Suppliers">
                @if (suppliers.value(); as rows) {
                    <fm-card flush>
                        <div class="overflow-x-auto">
                            <table class="fm-table">
                                <caption class="fm-sr-only">Suppliers</caption>
                                <thead>
                                    <tr>
                                        <th scope="col">Supplier</th>
                                        <th scope="col">Contact</th>
                                        <th class="text-right" scope="col">Products</th>
                                        <th scope="col"><span class="fm-sr-only">Actions</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    @for (s of rows; track s.oid) {
                                        <tr>
                                            <td>
                                                {{ s.name }}
                                                @if (!s.active) {
                                                    <fm-badge>Not used</fm-badge>
                                                }
                                                <span class="block text-xs text-fg-muted">{{ s.notes }}</span>
                                            </td>
                                            <td class="text-sm">
                                                {{ s.contact_name }}
                                                <span class="block text-xs text-fg-muted">{{ s.phone }}{{ s.email ? ' · ' + s.email : '' }}</span>
                                            </td>
                                            <td class="text-right tabular-nums">{{ s.products }}</td>
                                            <td class="text-right">
                                                @if (auth.can('update', 'Supplier')) {
                                                    <button fmButton size="sm" (click)="supplier(s)">Edit</button>
                                                }
                                            </td>
                                        </tr>
                                    }
                                </tbody>
                            </table>
                        </div>
                    </fm-card>
                } @else {
                    <fm-skeleton height="10rem" />
                }
            </ng-template>
        </fm-tabs>
    `
})
export class CataloguePageComponent {
    protected readonly auth = inject(AuthService);
    private readonly _service = inject(BusinessService);
    private readonly _dialog = inject(DialogService);
    protected readonly category = PRODUCT_CATEGORY_LABEL;
    protected readonly tab = signal('products');
    protected readonly q = signal('');
    protected readonly all = signal(false);
    protected readonly products = rxResource({ params: () => this.all(), stream: ({ params }) => this._service.products(params) });
    protected readonly suppliers = rxResource({ stream: () => this._service.suppliers(true) });
    protected readonly shown = computed(() => {
        const term = this.q().trim().toLowerCase();
        return (this.products.value() ?? []).filter(p => !term || p.name.toLowerCase().includes(term) || p.code.toLowerCase().includes(term));
    });

    protected product(p: Product | null): void {
        this._dialog
            .open<ProductDialogComponent, Product | null, Product>(ProductDialogComponent, { data: p, size: 'lg' })
            .afterClosed.pipe(filter(v => !!v))
            .subscribe(() => this.products.reload());
    }

    protected supplier(s: Supplier | null): void {
        this._dialog
            .open<SupplierDialogComponent, Supplier | null, Supplier>(SupplierDialogComponent, { data: s })
            .afterClosed.pipe(filter(v => !!v))
            .subscribe(() => this.suppliers.reload());
    }
}
