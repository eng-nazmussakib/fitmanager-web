import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { forkJoin, type Observable, of, switchMap } from 'rxjs';

import {
    type Product,
    PRODUCT_CATEGORIES,
    PRODUCT_CATEGORY_LABEL,
    PRODUCT_UNITS,
    type ProductCategory,
    type ProductInput,
    type ProductUnit
} from '@core/models/business.model';
import { FilesService } from '@core/services/files.service';
import { shrinkPhoto } from '@core/utils/media.utils';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DIALOG_DATA, DialogRef } from '@shared/ui/dialog/dialog-ref';
import { DialogFooterDirective, DialogShellComponent } from '@shared/ui/dialog/dialog-shell.component';
import { AlertComponent } from '@shared/ui/display/display';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { NumberInputComponent } from '@shared/ui/forms/number-input.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { SwitchComponent } from '@shared/ui/forms/switch.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { BusinessService } from './business.service';

interface Photo {
    /** A saved photo's file oid, or null for a new one still to upload. */
    oid: string | null;
    url: string;
    blob?: Blob;
}

/** HQ adds or edits a product: its price (HQ's only), its own VAT rate if any, up to 3 photos, the usual supplier. */
@Component({
    selector: 'app-product-dialog',
    imports: [
        FormsModule,
        ButtonComponent,
        DialogShellComponent,
        DialogFooterDirective,
        AlertComponent,
        FieldComponent,
        InputDirective,
        NumberInputComponent,
        SelectComponent,
        SwitchComponent,
        IconComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <fm-dialog-shell description="Every branch sells it at this price." [title]="data ? data.code + ': ' + data.name : 'New product'">
            <div class="grid gap-4 sm:grid-cols-2">
                <fm-field class="sm:col-span-2" label="Name" required><input fmInput maxlength="80" [(ngModel)]="f.name" /></fm-field>
                <fm-field label="Kind"><fm-select [options]="categories" [(ngModel)]="f.category" /></fm-field>
                <fm-field label="Sold by the"><fm-select [options]="units" [(ngModel)]="f.unit" /></fm-field>
                <fm-field label="Price (৳)" required><fm-number-input [min]="1" [(ngModel)]="f.price" /></fm-field>
                <fm-field hint="Empty: HQ's rate. Bottled water is 5 %." label="Own VAT rate (%)">
                    <fm-number-input [max]="50" [min]="0" [(ngModel)]="vatPercent" />
                </fm-field>
                <fm-field label="Usual supplier"><fm-select placeholder="None" [options]="supplierOptions()" [(ngModel)]="f.supplier_oid" /></fm-field>
                <fm-field hint="Each branch can set its own." label="Reorder at"><fm-number-input [min]="0" [(ngModel)]="f.reorder_level" /></fm-field>
                <fm-field class="sm:col-span-2" label="Description">
                    <textarea fmInput maxlength="500" rows="2" [(ngModel)]="f.description"></textarea>
                </fm-field>
                <div class="sm:col-span-2">
                    <div class="mb-2 flex flex-wrap gap-2">
                        @for (p of photos(); track p.url; let i = $index) {
                            <span class="relative">
                                <img class="size-20 rounded-lg object-cover" alt="" [src]="p.url" />
                                <button
                                    class="absolute -top-2 -right-2 rounded-full bg-surface p-0.5 shadow"
                                    type="button"
                                    aria-label="Remove the photo"
                                    (click)="drop(i)"
                                >
                                    <fm-icon name="x" size="0.875rem" />
                                </button>
                            </span>
                        }
                    </div>
                    @if (photos().length < 3) {
                        <label class="fm-btn fm-btn-secondary fm-btn-sm cursor-pointer">
                            <fm-icon name="camera" size="1rem" />
                            Add a photo ({{ photos().length }} of 3)
                            <input class="sr-only" type="file" accept="image/jpeg,image/png,image/webp" (change)="pick($event)" />
                        </label>
                    }
                </div>
                @if (data) {
                    <fm-switch class="sm:col-span-2" [(ngModel)]="f.active">On sale</fm-switch>
                }
                @if (problem()) {
                    <fm-alert class="sm:col-span-2" tone="danger">{{ problem() }}</fm-alert>
                }
            </div>
            <ng-container fmDialogFooter>
                <button fmButton (click)="ref.close()">Cancel</button>
                <button fmButton variant="primary" [loading]="saving()" (click)="save()">Save</button>
            </ng-container>
        </fm-dialog-shell>
    `
})
export class ProductDialogComponent {
    protected readonly data = inject<Product | null>(DIALOG_DATA);
    protected readonly ref = inject<DialogRef<Product>>(DialogRef);
    private readonly _service = inject(BusinessService);
    private readonly _files = inject(FilesService);
    protected readonly categories: SelectOption<ProductCategory>[] = PRODUCT_CATEGORIES.map(c => ({ value: c, label: PRODUCT_CATEGORY_LABEL[c] }));
    protected readonly units: SelectOption<ProductUnit>[] = PRODUCT_UNITS.map(u => ({ value: u, label: u }));
    private readonly _suppliers = rxResource({ stream: () => this._service.suppliers() });
    protected readonly supplierOptions = computed<SelectOption<string | null>[]>(() => [
        { value: null, label: 'None' },
        ...(this._suppliers.value() ?? []).map(s => ({ value: s.oid, label: s.name }))
    ]);
    protected readonly f: ProductInput = {
        name: this.data?.name ?? '',
        category: this.data?.category ?? 'supplements',
        unit: this.data?.unit ?? 'piece',
        description: this.data?.description ?? null,
        price: this.data?.price ?? 0,
        supplier_oid: this.data?.supplier_oid ?? null,
        reorder_level: this.data?.reorder_level ?? 5,
        active: this.data?.active ?? true
    };
    protected vatPercent: number | null = this.data?.vat_rate === null || this.data?.vat_rate === undefined ? null : Math.round(this.data.vat_rate * 1000) / 10;
    protected readonly photos = signal<Photo[]>((this.data?.photos ?? []).map(p => ({ oid: p.file_oid, url: p.url })));
    protected readonly saving = signal(false);
    protected readonly problem = signal<string | null>(null);

    protected pick(event: Event): void {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) return;
        shrinkPhoto(file)
            .then(blob => this.photos.update(list => [...list, { oid: null, url: URL.createObjectURL(blob), blob }]))
            .catch((err: unknown) => this.problem.set(err instanceof Error ? err.message : 'This photo could not be read.'));
    }

    protected drop(i: number): void {
        this.photos.update(list => list.filter((_, j) => j !== i));
    }

    protected save(): void {
        this.problem.set(null);
        if (this.f.name.trim().length < 2) return this.problem.set('Give it a name.');
        if (!(this.f.price > 0)) return this.problem.set('Give it a price.');
        this.saving.set(true);
        const uploads: Observable<string>[] = this.photos().map(p => (p.oid ? of(p.oid) : this._files.upload('product_photo', p.blob!, 'product.jpg')));
        (uploads.length ? forkJoin(uploads) : of([] as string[]))
            .pipe(
                switchMap(oids => {
                    const body: ProductInput = {
                        ...this.f,
                        name: this.f.name.trim(),
                        vat_rate: this.vatPercent === null ? null : Math.round(this.vatPercent * 10) / 1000,
                        photo_file_oids: oids
                    };
                    return this.data ? this._service.updateProduct(this.data.oid, body) : this._service.addProduct(body);
                })
            )
            .subscribe({ next: p => this.ref.close(p), error: () => this.saving.set(false) });
    }
}
