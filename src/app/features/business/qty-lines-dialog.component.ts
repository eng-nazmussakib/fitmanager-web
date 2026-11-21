import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ButtonComponent } from '@shared/ui/button/button.component';
import { DIALOG_DATA, DialogRef } from '@shared/ui/dialog/dialog-ref';
import { DialogFooterDirective, DialogShellComponent } from '@shared/ui/dialog/dialog-shell.component';
import { AlertComponent } from '@shared/ui/display/display';
import { DatePickerComponent } from '@shared/ui/forms/date-picker.component';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { NumberInputComponent } from '@shared/ui/forms/number-input.component';

export interface QtyLinesData {
    title: string;
    description: string;
    okText: string;
    lines: { oid: string; name: string; max: number; qty: number; cost?: number }[];
    /** Show a unit cost per line (a delivery: what it cost this time). */
    costs?: boolean;
    /** Ask for a date between these (a delivery's day). */
    date?: { min: string; max: string };
    noteLabel?: string;
}

export interface QtyLinesResult {
    lines: { oid: string; qty: number; cost?: number }[];
    note: string | null;
    date: string | null;
}

/** How many of each line: a delivery against an order, or what is sent or received on a transfer (D-100, D-101). */
@Component({
    selector: 'app-qty-lines-dialog',
    imports: [
        FormsModule,
        ButtonComponent,
        DialogShellComponent,
        DialogFooterDirective,
        AlertComponent,
        DatePickerComponent,
        FieldComponent,
        InputDirective,
        NumberInputComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <fm-dialog-shell [description]="data.description" [title]="data.title">
            <div class="grid gap-3">
                @if (data.date) {
                    <fm-field class="w-48" label="On"><fm-date-picker [max]="data.date.max" [min]="data.date.min" [(ngModel)]="date" /></fm-field>
                }
                @for (l of lines; track l.oid) {
                    <div class="grid grid-cols-[minmax(0,1fr)_6rem] items-end gap-3" [class.sm:grid-cols-[minmax(0,1fr)_6rem_8rem]]="data.costs">
                        <p class="pb-2 text-sm">
                            {{ l.name }}
                            <span class="block text-xs text-fg-muted">at most {{ l.max }}</span>
                        </p>
                        <fm-field label="Qty"><fm-number-input [max]="l.max" [min]="0" [(ngModel)]="l.qty" /></fm-field>
                        @if (data.costs) {
                            <fm-field label="Unit cost (৳)"><fm-number-input [min]="0" [(ngModel)]="l.cost" /></fm-field>
                        }
                    </div>
                }
                <fm-field [label]="data.noteLabel ?? 'Note'"><textarea fmInput maxlength="300" rows="2" [(ngModel)]="note"></textarea></fm-field>
                @if (problem()) {
                    <fm-alert tone="danger">{{ problem() }}</fm-alert>
                }
            </div>
            <ng-container fmDialogFooter>
                <button fmButton (click)="ref.close()">Cancel</button>
                <button fmButton variant="primary" (click)="ok()">{{ data.okText }}</button>
            </ng-container>
        </fm-dialog-shell>
    `
})
export class QtyLinesDialogComponent {
    protected readonly data = inject<QtyLinesData>(DIALOG_DATA);
    protected readonly ref = inject<DialogRef<QtyLinesResult>>(DialogRef);
    protected readonly lines = this.data.lines.map(l => ({ ...l }));
    protected note = '';
    protected date: string | null = this.data.date?.max ?? null;
    protected readonly problem = signal<string | null>(null);

    protected ok(): void {
        if (this.lines.some(l => l.qty > l.max || l.qty < 0)) return this.problem.set('A quantity is more than there is.');
        if (!this.lines.some(l => l.qty > 0)) return this.problem.set('Enter at least one quantity.');
        this.ref.close({
            lines: this.lines.map(l => ({ oid: l.oid, qty: l.qty ?? 0, ...(this.data.costs ? { cost: l.cost } : {}) })),
            note: this.note.trim() || null,
            date: this.date
        });
    }
}
