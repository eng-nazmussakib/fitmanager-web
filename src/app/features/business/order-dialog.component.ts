import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';

import type { Branch } from '@core/models/branch.model';
import type { PurchaseOrder, StockTransfer } from '@core/models/business.model';
import { TakaPipe } from '@shared/pipes/taka.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DIALOG_DATA, DialogRef } from '@shared/ui/dialog/dialog-ref';
import { DialogFooterDirective, DialogShellComponent } from '@shared/ui/dialog/dialog-shell.component';
import { AlertComponent } from '@shared/ui/display/display';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { NumberInputComponent } from '@shared/ui/forms/number-input.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { BusinessService } from './business.service';

export interface OrderDialogData {
    /** A purchase order to a supplier, or a transfer asked of another branch. */
    kind: 'order' | 'transfer';
    /** The other branches, for a transfer. */
    branches?: Pick<Branch, 'oid' | 'name'>[];
    /** Products to start with (the low ones). */
    start?: { product_oid: string; qty: number }[];
}

interface Line {
    product_oid: string | null;
    qty: number;
    unit_cost: number;
}

/**
 * Raises a purchase order (HQ approves it) or asks another branch for stock. For a transfer, it shows what the other
 * branches hold of the chosen products (counts only).
 */
@Component({
    selector: 'app-order-dialog',
    imports: [
        FormsModule,
        TakaPipe,
        ButtonComponent,
        DialogShellComponent,
        DialogFooterDirective,
        AlertComponent,
        FieldComponent,
        InputDirective,
        NumberInputComponent,
        SelectComponent,
        IconComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <fm-dialog-shell
            [description]="
                order ? 'HQ approves it; then you send it to the supplier and receive what comes.' : 'They send what they can; you count it in when it arrives.'
            "
            [title]="order ? 'New purchase order' : 'Ask a branch for stock'"
        >
            <div class="grid gap-4">
                @if (order) {
                    <fm-field label="Supplier" required>
                        <fm-select placeholder="Choose" [options]="supplierOptions()" [(ngModel)]="supplier" />
                    </fm-field>
                } @else {
                    <fm-field label="From" required><fm-select placeholder="Choose" [options]="branchOptions" [(ngModel)]="from" /></fm-field>
                }
                @for (l of lines(); track $index) {
                    <div class="grid grid-cols-[minmax(0,1fr)_5.5rem_auto] items-end gap-2" [class.sm:grid-cols-[minmax(0,1fr)_5.5rem_7rem_auto]]="order">
                        <fm-field label="Product">
                            <fm-select
                                placeholder="Choose"
                                [ngModel]="l.product_oid"
                                [options]="productOptions()"
                                (ngModelChange)="setProduct($index, $event)"
                            />
                        </fm-field>
                        <fm-field label="Qty"><fm-number-input [min]="1" [(ngModel)]="l.qty" /></fm-field>
                        @if (order) {
                            <fm-field label="Unit cost (৳)"><fm-number-input [min]="0" [(ngModel)]="l.unit_cost" /></fm-field>
                        }
                        <button class="mb-1" aria-label="Remove" fmButton size="sm" variant="ghost" (click)="remove($index)"><fm-icon name="x" /></button>
                    </div>
                    @if (!order && l.product_oid) {
                        <p class="-mt-2 text-xs text-fg-muted">{{ held(l.product_oid) }}</p>
                    }
                }
                <button class="justify-self-start" fmButton size="sm" (click)="add()">
                    <fm-icon name="plus" size="1rem" />
                    Another product
                </button>
                <fm-field label="Note"><textarea fmInput maxlength="500" rows="2" [(ngModel)]="note"></textarea></fm-field>
                @if (order) {
                    <p class="text-sm">Total {{ total() | taka: 0 }}</p>
                }
                @if (problem()) {
                    <fm-alert tone="danger">{{ problem() }}</fm-alert>
                }
            </div>
            <ng-container fmDialogFooter>
                <button fmButton (click)="ref.close()">Cancel</button>
                <button fmButton variant="primary" [loading]="saving()" (click)="save()">{{ order ? 'Send to HQ' : 'Ask' }}</button>
            </ng-container>
        </fm-dialog-shell>
    `
})
export class OrderDialogComponent {
    protected readonly data = inject<OrderDialogData>(DIALOG_DATA);
    protected readonly ref = inject<DialogRef<PurchaseOrder | StockTransfer>>(DialogRef);
    private readonly _service = inject(BusinessService);
    protected readonly order = this.data.kind === 'order';
    private readonly _products = rxResource({ stream: () => this._service.products() });
    private readonly _suppliers = rxResource({ stream: () => this._service.suppliers() });
    protected readonly productOptions = computed<SelectOption<string>[]>(() =>
        (this._products.value() ?? []).map(p => ({ value: p.oid, label: p.name, description: p.code }))
    );
    protected readonly supplierOptions = computed<SelectOption<string>[]>(() => (this._suppliers.value() ?? []).map(s => ({ value: s.oid, label: s.name })));
    protected readonly branchOptions: SelectOption<string>[] = (this.data.branches ?? []).map(b => ({ value: b.oid, label: b.name }));
    protected supplier: string | null = null;
    protected from: string | null = null;
    protected note = '';
    protected readonly lines = signal<Line[]>(
        this.data.start?.length
            ? this.data.start.map(s => ({ product_oid: s.product_oid, qty: s.qty, unit_cost: 0 }))
            : [{ product_oid: null, qty: 1, unit_cost: 0 }]
    );
    private readonly _oids = computed(() => this.lines().flatMap(l => (l.product_oid ? [l.product_oid] : [])));
    private readonly _elsewhere = rxResource({
        params: () => (this.order || !this._oids().length ? undefined : this._oids()),
        stream: ({ params }) => this._service.elsewhere(params)
    });
    protected readonly total = computed(() => this.lines().reduce((s, l) => s + l.qty * l.unit_cost, 0));
    protected readonly saving = signal(false);
    protected readonly problem = signal<string | null>(null);

    protected held(productOid: string): string {
        const rows = (this._elsewhere.value() ?? []).filter(r => r.product_oid === productOid);
        return rows.length ? 'Held: ' + rows.map(r => `${r.branch_name} ${r.on_hand}`).join(' · ') : 'No other branch has any.';
    }

    protected setProduct(i: number, oid: string): void {
        this.lines.update(list => list.map((l, j) => (j === i ? { ...l, product_oid: oid } : l)));
    }

    protected add(): void {
        this.lines.update(list => [...list, { product_oid: null, qty: 1, unit_cost: 0 }]);
    }

    protected remove(i: number): void {
        this.lines.update(list => list.filter((_, j) => j !== i));
    }

    protected save(): void {
        this.problem.set(null);
        const lines = this.lines().filter((l): l is Line & { product_oid: string } => !!l.product_oid);
        if (!lines.length) return this.problem.set('Add at least one product.');
        if (new Set(lines.map(l => l.product_oid)).size !== lines.length) return this.problem.set('Each product once.');
        const note = this.note.trim() || null;
        if (this.order) {
            if (!this.supplier) return this.problem.set('Choose the supplier.');
            this.saving.set(true);
            this._service
                .raiseOrder({ supplier_oid: this.supplier, note, lines: lines.map(l => ({ product_oid: l.product_oid, qty: l.qty, unit_cost: l.unit_cost })) })
                .subscribe({ next: o => this.ref.close(o), error: () => this.saving.set(false) });
        } else {
            if (!this.from) return this.problem.set('Choose the branch to ask.');
            this.saving.set(true);
            this._service
                .askTransfer({ from_branch_oid: this.from, note, lines: lines.map(l => ({ product_oid: l.product_oid, qty: l.qty })) })
                .subscribe({ next: t => this.ref.close(t), error: () => this.saving.set(false) });
        }
    }
}
