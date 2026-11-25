import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { type Observable, of, switchMap } from 'rxjs';

import { type Equipment, EQUIPMENT_CATEGORIES, EQUIPMENT_CATEGORY_LABEL, type EquipmentCategory, type EquipmentInput } from '@core/models/business.model';
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
import { IconComponent } from '@shared/ui/icon/icon.component';

import { BusinessService } from './business.service';

/** Adds a machine to the register, or edits one: what it is, where, its warranty and service schedule, a photo. */
@Component({
    selector: 'app-equipment-dialog',
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
        IconComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <fm-dialog-shell description="The service schedule makes it due from the last service." [title]="data ? 'Edit ' + data.name : 'Add equipment'">
            <div class="grid gap-4 sm:grid-cols-2">
                <fm-field class="sm:col-span-2" label="Name" required><input fmInput maxlength="80" placeholder="Treadmill 4" [(ngModel)]="f.name" /></fm-field>
                <fm-field label="Category" required><fm-select [options]="categories" [(ngModel)]="f.category" /></fm-field>
                <fm-field label="Where"><fm-select placeholder="The gym floor" [options]="roomOptions()" [(ngModel)]="f.room_oid" /></fm-field>
                <fm-field label="Brand"><input fmInput maxlength="60" [(ngModel)]="f.brand" /></fm-field>
                <fm-field label="Model"><input fmInput maxlength="60" [(ngModel)]="f.model" /></fm-field>
                <fm-field label="Serial number"><input fmInput maxlength="60" [(ngModel)]="f.serial" /></fm-field>
                <fm-field label="Cost (৳)"><fm-number-input [min]="0" [(ngModel)]="f.cost" /></fm-field>
                <fm-field label="Bought on"><fm-date-picker [(ngModel)]="f.purchased_on" /></fm-field>
                <fm-field label="Warranty until"><fm-date-picker [(ngModel)]="f.warranty_until" /></fm-field>
                <fm-field hint="Leave empty for none." label="Service every (days)">
                    <fm-number-input [max]="730" [min]="7" [(ngModel)]="f.service_every_days" />
                </fm-field>
                <fm-field label="Last serviced"><fm-date-picker [(ngModel)]="f.last_serviced_on" /></fm-field>
                <fm-field class="sm:col-span-2" label="Notes"><textarea fmInput maxlength="1000" rows="2" [(ngModel)]="f.notes"></textarea></fm-field>
                <div class="sm:col-span-2">
                    @if (preview()) {
                        <img class="mb-2 max-h-36 rounded-lg" alt="The photo" [src]="preview()" />
                    }
                    <label class="fm-btn fm-btn-secondary fm-btn-sm cursor-pointer">
                        <fm-icon name="camera" size="1rem" />
                        {{ preview() ? 'Another photo' : 'Add a photo' }}
                        <input class="sr-only" type="file" accept="image/jpeg,image/png,image/webp" (change)="pick($event)" />
                    </label>
                </div>
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
export class EquipmentDialogComponent {
    protected readonly data = inject<Equipment | null>(DIALOG_DATA);
    protected readonly ref = inject<DialogRef<Equipment>>(DialogRef);
    private readonly _service = inject(BusinessService);
    private readonly _files = inject(FilesService);
    protected readonly categories: SelectOption<EquipmentCategory>[] = EQUIPMENT_CATEGORIES.map(c => ({ value: c, label: EQUIPMENT_CATEGORY_LABEL[c] }));
    private readonly _rooms = rxResource({ stream: () => this._service.rooms() });
    protected readonly roomOptions = computed<SelectOption<string | null>[]>(() => [
        { value: null, label: 'The gym floor' },
        ...(this._rooms.value() ?? []).map(r => ({ value: r.oid, label: r.name }))
    ]);
    protected readonly f: EquipmentInput = {
        name: this.data?.name ?? '',
        category: this.data?.category ?? 'cardio',
        brand: this.data?.brand ?? null,
        model: this.data?.model ?? null,
        serial: this.data?.serial ?? null,
        purchased_on: this.data?.purchased_on ?? null,
        cost: this.data?.cost ?? null,
        warranty_until: this.data?.warranty_until ?? null,
        room_oid: this.data?.room?.oid ?? null,
        service_every_days: this.data?.service_every_days ?? null,
        last_serviced_on: this.data?.last_serviced_on ?? null,
        notes: this.data?.notes ?? null
    };
    private _photo: Blob | null = null;
    protected readonly preview = signal<string | null>(this.data?.photo_url ?? null);
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
        if (this.f.name.trim().length < 2) return this.problem.set('Give it a name.');
        this.saving.set(true);
        const photo$: Observable<string | null | undefined> = this._photo ? this._files.upload('equipment_photo', this._photo, 'equipment.jpg') : of(undefined);
        photo$
            .pipe(
                switchMap(photo => {
                    const body: EquipmentInput = { ...this.f, name: this.f.name.trim(), ...(photo !== undefined ? { photo_file_oid: photo } : {}) };
                    return this.data ? this._service.updateEquipment(this.data.oid, body) : this._service.addEquipment(body);
                })
            )
            .subscribe({ next: e => this.ref.close(e), error: () => this.saving.set(false) });
    }
}
