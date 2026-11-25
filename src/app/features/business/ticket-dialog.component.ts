import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { type Observable, of, switchMap } from 'rxjs';

import { type Equipment, type Ticket, type TicketPriority, type TicketStatus } from '@core/models/business.model';
import { FilesService } from '@core/services/files.service';
import { shrinkPhoto } from '@core/utils/media.utils';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DIALOG_DATA, DialogRef } from '@shared/ui/dialog/dialog-ref';
import { DialogFooterDirective, DialogShellComponent } from '@shared/ui/dialog/dialog-shell.component';
import { AlertComponent } from '@shared/ui/display/display';
import { DatePickerComponent } from '@shared/ui/forms/date-picker.component';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { NumberInputComponent } from '@shared/ui/forms/number-input.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { SwitchComponent } from '@shared/ui/forms/switch.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { BusinessService } from './business.service';

export type TicketDialogData =
    /** Any staff member reports a fault (`create Equipment`). */
    | { mode: 'raise'; equipment: Pick<Equipment, 'oid' | 'name'> }
    /** The manager runs it: in progress, fixed, or cannot be fixed. */
    | { mode: 'update'; ticket: Ticket }
    /** A routine service, recorded as done. */
    | { mode: 'service'; equipment: Pick<Equipment, 'oid' | 'name'>; today: string };

const PRIORITIES: SelectOption<TicketPriority>[] = [
    { value: 'low', label: 'Low: it still works' },
    { value: 'normal', label: 'Normal' },
    { value: 'urgent', label: 'Urgent: unsafe or broken' }
];
const STATUSES: SelectOption<TicketStatus>[] = [
    { value: 'open', label: 'Open' },
    { value: 'in_progress', label: 'In progress' },
    { value: 'fixed', label: 'Fixed' },
    { value: 'cannot_fix', label: 'Cannot be fixed' }
];

/** Raises a maintenance ticket, moves one on, or records a service. */
@Component({
    selector: 'app-ticket-dialog',
    imports: [
        FormsModule,
        ButtonComponent,
        DialogShellComponent,
        DialogFooterDirective,
        AlertComponent,
        DatePickerComponent,
        FieldComponent,
        InputDirective,
        NumberInputComponent,
        SelectComponent,
        SwitchComponent,
        IconComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <fm-dialog-shell [description]="description" [title]="title">
            <div class="grid gap-4">
                @switch (data.mode) {
                    @case ('raise') {
                        <fm-field label="What is wrong" required><textarea fmInput maxlength="1000" rows="3" [(ngModel)]="fault"></textarea></fm-field>
                        <fm-field label="How urgent"><fm-select [options]="priorities" [(ngModel)]="priority" /></fm-field>
                        <fm-switch [(ngModel)]="outOfOrder">Out of order: put a sign on it, nobody uses it until it is fixed</fm-switch>
                        <div>
                            @if (preview()) {
                                <img class="mb-2 max-h-36 rounded-lg" alt="The photo" [src]="preview()" />
                            }
                            <label class="fm-btn fm-btn-secondary fm-btn-sm cursor-pointer">
                                <fm-icon name="camera" size="1rem" />
                                {{ preview() ? 'Another photo' : 'Add a photo' }}
                                <input class="sr-only" type="file" accept="image/jpeg,image/png,image/webp" (change)="pick($event)" />
                            </label>
                        </div>
                    }
                    @case ('update') {
                        <fm-field label="Status"><fm-select [options]="statuses" [(ngModel)]="status" /></fm-field>
                        <fm-field label="Technician"><input fmInput maxlength="120" [(ngModel)]="technician" /></fm-field>
                        <fm-field label="Cost (৳)"><fm-number-input [min]="0" [(ngModel)]="cost" /></fm-field>
                        <fm-field label="What was done" [hint]="status === 'cannot_fix' ? 'Required: why it cannot be fixed.' : ''">
                            <textarea fmInput maxlength="1000" rows="2" [(ngModel)]="resolution"></textarea>
                        </fm-field>
                    }
                    @case ('service') {
                        <fm-field label="Done on"><fm-date-picker [max]="today" [(ngModel)]="on" /></fm-field>
                        <fm-field label="Technician or company" required><input fmInput maxlength="120" [(ngModel)]="technician" /></fm-field>
                        <fm-field label="Cost (৳)"><fm-number-input [min]="0" [(ngModel)]="cost" /></fm-field>
                        <fm-field label="Note"><textarea fmInput maxlength="1000" rows="2" [(ngModel)]="resolution"></textarea></fm-field>
                    }
                }
                @if (problem()) {
                    <fm-alert tone="danger">{{ problem() }}</fm-alert>
                }
            </div>
            <ng-container fmDialogFooter>
                <button fmButton (click)="ref.close()">Cancel</button>
                <button fmButton variant="primary" [loading]="saving()" (click)="save()">{{ data.mode === 'raise' ? 'Raise ticket' : 'Save' }}</button>
            </ng-container>
        </fm-dialog-shell>
    `
})
export class TicketDialogComponent {
    protected readonly data = inject<TicketDialogData>(DIALOG_DATA);
    protected readonly ref = inject<DialogRef<unknown>>(DialogRef);
    private readonly _service = inject(BusinessService);
    private readonly _files = inject(FilesService);
    protected readonly priorities = PRIORITIES;
    protected readonly statuses = STATUSES;
    protected readonly title =
        this.data.mode === 'raise'
            ? `Report a fault: ${this.data.equipment.name}`
            : this.data.mode === 'service'
              ? `Record a service: ${this.data.equipment.name}`
              : `${this.data.ticket.code}: ${this.data.ticket.equipment.name}`;
    protected readonly description =
        this.data.mode === 'raise'
            ? 'The branch manager sees it on the tickets list.'
            : this.data.mode === 'service'
              ? 'The next service is due from this date.'
              : this.data.ticket.description;
    protected readonly today = this.data.mode === 'service' ? this.data.today : null;
    protected fault = '';
    protected priority: TicketPriority = 'normal';
    protected outOfOrder = false;
    protected status: TicketStatus = this.data.mode === 'update' ? this.data.ticket.status : 'open';
    protected technician = (this.data.mode === 'update' ? this.data.ticket.technician : null) ?? '';
    protected cost: number | null = this.data.mode === 'update' ? this.data.ticket.cost : null;
    protected resolution = (this.data.mode === 'update' ? this.data.ticket.resolution : null) ?? '';
    protected on: string | null = this.today;
    private _photo: Blob | null = null;
    protected readonly preview = signal<string | null>(null);
    protected readonly saving = signal(false);
    protected readonly problem = signal<string | null>(null);

    protected pick(event: Event): void {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) return;
        shrinkPhoto(file)
            .then(blob => {
                this._photo = blob;
                this.preview.set(URL.createObjectURL(blob));
            })
            .catch((err: unknown) => this.problem.set(err instanceof Error ? err.message : 'This photo could not be read.'));
    }

    protected save(): void {
        this.problem.set(null);
        const d = this.data;
        let call: Observable<unknown>;
        if (d.mode === 'raise') {
            if (this.fault.trim().length < 3) return this.problem.set('Say what is wrong.');
            const photo$: Observable<string | null> = this._photo ? this._files.upload('ticket_photo', this._photo, 'ticket.jpg') : of(null);
            call = photo$.pipe(
                switchMap(photo =>
                    this._service.raiseTicket(d.equipment.oid, {
                        description: this.fault.trim(),
                        priority: this.priority,
                        out_of_order: this.outOfOrder,
                        photo_file_oid: photo
                    })
                )
            );
        } else if (d.mode === 'update') {
            if (this.status === 'cannot_fix' && !this.resolution.trim()) return this.problem.set('Say why it cannot be fixed.');
            call = this._service.updateTicket(d.ticket.oid, {
                status: this.status,
                technician: this.technician.trim() || null,
                cost: this.cost,
                resolution: this.resolution.trim() || null
            });
        } else {
            if (this.technician.trim().length < 2) return this.problem.set('Who serviced it?');
            call = this._service.recordService(d.equipment.oid, {
                on: this.on ?? undefined,
                technician: this.technician.trim(),
                cost: this.cost,
                note: this.resolution.trim() || null
            });
        }
        this.saving.set(true);
        call.subscribe({ next: v => this.ref.close(v), error: () => this.saving.set(false) });
    }
}
