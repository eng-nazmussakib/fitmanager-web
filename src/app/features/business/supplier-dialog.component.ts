import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { Supplier, SupplierInput } from '@core/models/business.model';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DIALOG_DATA, DialogRef } from '@shared/ui/dialog/dialog-ref';
import { DialogFooterDirective, DialogShellComponent } from '@shared/ui/dialog/dialog-shell.component';
import { AlertComponent } from '@shared/ui/display/display';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { SwitchComponent } from '@shared/ui/forms/switch.component';

import { BusinessService } from './business.service';

/** HQ adds or edits a supplier (D-099): who to call, and notes on how they deliver. */
@Component({
    selector: 'app-supplier-dialog',
    imports: [FormsModule, ButtonComponent, DialogShellComponent, DialogFooterDirective, AlertComponent, FieldComponent, InputDirective, SwitchComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <fm-dialog-shell [title]="data ? data.name : 'New supplier'">
            <div class="grid gap-4 sm:grid-cols-2">
                <fm-field class="sm:col-span-2" label="Name" required><input fmInput maxlength="120" [(ngModel)]="f.name" /></fm-field>
                <fm-field label="Contact"><input fmInput maxlength="120" [(ngModel)]="f.contact_name" /></fm-field>
                <fm-field label="Mobile"><input fmInput inputmode="tel" maxlength="20" placeholder="01XXXXXXXXX" [(ngModel)]="f.phone" /></fm-field>
                <fm-field class="sm:col-span-2" label="Email"><input type="email" fmInput maxlength="254" [(ngModel)]="f.email" /></fm-field>
                <fm-field class="sm:col-span-2" label="Address"><input fmInput maxlength="300" [(ngModel)]="f.address" /></fm-field>
                <fm-field class="sm:col-span-2" label="Notes"><textarea fmInput maxlength="1000" rows="2" [(ngModel)]="f.notes"></textarea></fm-field>
                @if (data) {
                    <fm-switch class="sm:col-span-2" [(ngModel)]="f.active">Still used</fm-switch>
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
export class SupplierDialogComponent {
    protected readonly data = inject<Supplier | null>(DIALOG_DATA);
    protected readonly ref = inject<DialogRef<Supplier>>(DialogRef);
    private readonly _service = inject(BusinessService);
    protected readonly f: SupplierInput = {
        name: this.data?.name ?? '',
        contact_name: this.data?.contact_name ?? null,
        phone: this.data?.phone ?? null,
        email: this.data?.email ?? null,
        address: this.data?.address ?? null,
        notes: this.data?.notes ?? null,
        active: this.data?.active ?? true
    };
    protected readonly saving = signal(false);
    protected readonly problem = signal<string | null>(null);

    protected save(): void {
        if (this.f.name.trim().length < 2) return this.problem.set('Give the supplier a name.');
        this.saving.set(true);
        const body: SupplierInput = { ...this.f, name: this.f.name.trim() };
        (this.data ? this._service.updateSupplier(this.data.oid, body) : this._service.addSupplier(body)).subscribe({
            next: s => this.ref.close(s),
            error: () => this.saving.set(false)
        });
    }
}
