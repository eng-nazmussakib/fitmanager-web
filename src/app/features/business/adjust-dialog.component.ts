import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { StockLevel } from '@core/models/business.model';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DIALOG_DATA, DialogRef } from '@shared/ui/dialog/dialog-ref';
import { DialogFooterDirective, DialogShellComponent } from '@shared/ui/dialog/dialog-shell.component';
import { AlertComponent } from '@shared/ui/display/display';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { NumberInputComponent } from '@shared/ui/forms/number-input.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';

import { BusinessService } from './business.service';

type Reason = 'damaged' | 'expired' | 'count' | 'other';

/**
 * Corrects the stock: damaged or expired goods taken off, or a count that found a different number. Only a
 * count adds stock; what comes from a supplier comes in on a purchase order. The ledger keeps the reason.
 */
@Component({
    selector: 'app-adjust-dialog',
    imports: [
        FormsModule,
        ButtonComponent,
        DialogShellComponent,
        DialogFooterDirective,
        AlertComponent,
        FieldComponent,
        InputDirective,
        NumberInputComponent,
        SelectComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <fm-dialog-shell [description]="data.on_hand + ' on hand now.'" [title]="'Adjust: ' + data.name">
            <div class="grid gap-4">
                <fm-field label="Why"><fm-select [options]="reasons" [(ngModel)]="reason" /></fm-field>
                @if (reason === 'count') {
                    <fm-field hint="What is on the shelf now." label="Counted"><fm-number-input [min]="0" [(ngModel)]="counted" /></fm-field>
                } @else {
                    <fm-field label="How many to take off"><fm-number-input [max]="data.on_hand" [min]="1" [(ngModel)]="off" /></fm-field>
                }
                <fm-field label="Note" [hint]="reason === 'count' || reason === 'other' ? 'Required.' : ''">
                    <textarea fmInput maxlength="300" rows="2" [(ngModel)]="note"></textarea>
                </fm-field>
                @if (problem()) {
                    <fm-alert tone="danger">{{ problem() }}</fm-alert>
                }
            </div>
            <ng-container fmDialogFooter>
                <button fmButton (click)="ref.close()">Cancel</button>
                <button fmButton variant="primary" [loading]="saving()" (click)="save()">Save</button>
            </ng-container>
        </fm-dialog-shell>
    `
})
export class AdjustDialogComponent {
    protected readonly data = inject<StockLevel>(DIALOG_DATA);
    protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
    private readonly _service = inject(BusinessService);
    protected readonly reasons: SelectOption<Reason>[] = [
        { value: 'damaged', label: 'Damaged' },
        { value: 'expired', label: 'Expired' },
        { value: 'count', label: 'Stock count' },
        { value: 'other', label: 'Other' }
    ];
    protected reason: Reason = 'damaged';
    protected off = 1;
    protected counted = this.data.on_hand;
    protected note = '';
    protected readonly saving = signal(false);
    protected readonly problem = signal<string | null>(null);

    protected save(): void {
        this.problem.set(null);
        const qty = this.reason === 'count' ? this.counted - this.data.on_hand : -this.off;
        if (qty === 0) return this.problem.set(this.reason === 'count' ? 'The count matches: nothing to change.' : 'Enter how many.');
        if ((this.reason === 'count' || this.reason === 'other') && !this.note.trim()) return this.problem.set('Say what happened.');
        this.saving.set(true);
        this._service
            .adjust(this.data.product_oid, { qty, reason: this.reason, note: this.note.trim() || null })
            .subscribe({ next: () => this.ref.close(true), error: () => this.saving.set(false) });
    }
}
