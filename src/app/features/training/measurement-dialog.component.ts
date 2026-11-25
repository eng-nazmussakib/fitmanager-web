import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { addDays, format, parseISO } from 'date-fns';
import { forkJoin, map, type Observable, of, switchMap } from 'rxjs';

import { MEASUREMENT_FIELDS, type MeasurementField, type MeasurementInput, type MeasurementList, type PhotoView } from '@core/models/training.model';
import { FilesService } from '@core/services/files.service';
import { shrinkPhoto } from '@core/utils/media.utils';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DIALOG_DATA, DialogRef } from '@shared/ui/dialog/dialog-ref';
import { DialogFooterDirective, DialogShellComponent } from '@shared/ui/dialog/dialog-shell.component';
import { AlertComponent } from '@shared/ui/display/display';
import { DatePickerComponent, todayIso } from '@shared/ui/forms/date-picker.component';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { NumberInputComponent } from '@shared/ui/forms/number-input.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { ME, TrainingService, type Who } from './training.service';

export interface MeasurementDialogData {
    who: Who;
    /** The member's oid (staff uploads link the photos to them); unused in the portal. */
    memberOid: string | null;
    height_cm: number | null;
}

const VIEWS: PhotoView[] = ['front', 'side', 'back'];

/**
 * Records a body measurement: any of the numbers, the height (kept on the member, for the BMI) and up to 3
 * progress photos (front, side, back), each made small in the browser before upload. The photos are private
 * to the member, their home branch and their trainer.
 */
@Component({
    selector: 'app-measurement-dialog',
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
        IconComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <fm-dialog-shell description="Fill in what was measured; leave the rest empty." title="Record a measurement">
            <div class="grid gap-4">
                <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <fm-field class="col-span-2" label="Date" required>
                        <fm-date-picker [max]="today" [min]="earliest" [(ngModel)]="measuredOn" />
                    </fm-field>
                    <fm-field hint="For the BMI." label="Height (cm)"><fm-number-input [max]="250" [min]="80" [(ngModel)]="height" /></fm-field>
                    @for (f of fields; track f.key) {
                        <fm-field [label]="f.label + ' (' + f.unit + ')'">
                            <fm-number-input [ngModel]="values[f.key]" (ngModelChange)="values[f.key] = $event" />
                        </fm-field>
                    }
                </div>
                <div>
                    <p class="mb-2 text-sm font-medium">Progress photos</p>
                    <p class="mb-3 text-sm text-fg-muted">Seen only by the member, the branch and their trainer. Made small before they are sent.</p>
                    <div class="grid grid-cols-3 gap-3">
                        @for (v of views; track v) {
                            <label
                                class="relative flex aspect-[3/4] cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border border-dashed border-border bg-surface-sunken text-sm text-fg-muted hover:border-primary-500"
                            >
                                @if (previews()[v]; as src) {
                                    <img class="absolute inset-0 size-full object-cover" alt="" [src]="src" />
                                    <span class="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 text-xs text-white capitalize">{{ v }}</span>
                                } @else {
                                    <fm-icon name="camera" size="1.25rem" />
                                    <span class="capitalize">{{ v }}</span>
                                }
                                <input
                                    class="sr-only"
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    [attr.aria-label]="v + ' photo'"
                                    (change)="pick(v, $event)"
                                />
                            </label>
                        }
                    </div>
                </div>
                <fm-field label="Notes"><textarea fmInput maxlength="500" rows="2" [(ngModel)]="notes"></textarea></fm-field>
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
export class MeasurementDialogComponent {
    protected readonly data = inject<MeasurementDialogData>(DIALOG_DATA);
    protected readonly ref = inject<DialogRef<MeasurementList>>(DialogRef);
    private readonly _service = inject(TrainingService);
    private readonly _files = inject(FilesService);
    protected readonly today = todayIso();
    protected readonly earliest = format(addDays(parseISO(this.today), -30), 'yyyy-MM-dd');
    protected readonly fields = MEASUREMENT_FIELDS;
    protected readonly views = VIEWS;
    protected measuredOn: string | null = this.today;
    protected height: number | null = this.data.height_cm;
    protected notes = '';
    protected readonly values: Record<MeasurementField, number | null> = {
        weight_kg: null,
        body_fat_pct: null,
        waist_cm: null,
        chest_cm: null,
        hips_cm: null,
        arm_cm: null,
        thigh_cm: null
    };
    protected readonly previews = signal<Partial<Record<PhotoView, string>>>({});
    private readonly _photos: Partial<Record<PhotoView, Blob>> = {};
    protected readonly saving = signal(false);
    protected readonly problem = signal<string | null>(null);

    protected pick(view: PhotoView, event: Event): void {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) return;
        this.problem.set(null);
        shrinkPhoto(file)
            .then(blob => {
                this._photos[view] = blob;
                this.previews.update(p => ({ ...p, [view]: URL.createObjectURL(blob) }));
            })
            .catch((err: unknown) => this.problem.set(err instanceof Error ? err.message : 'This photo could not be read.'));
    }

    protected save(): void {
        this.problem.set(null);
        if (!this.measuredOn) return this.problem.set('Choose the date.');
        const any = Object.values(this.values).some(v => v !== null) || VIEWS.some(v => this._photos[v]);
        if (!any) return this.problem.set('Enter at least one measurement or add a photo.');
        this.saving.set(true);
        const portal = this.data.who === ME;
        const uploads: Observable<[PhotoView, string]>[] = VIEWS.filter(v => this._photos[v]).map(v =>
            this._files
                .upload('measurement_photo', this._photos[v]!, `${v}.jpg`, this.data.memberOid ?? undefined, portal)
                .pipe(map(oid => [v, oid] as [PhotoView, string]))
        );
        (uploads.length ? forkJoin(uploads) : of([] as [PhotoView, string][]))
            .pipe(
                switchMap(done => {
                    const photo = Object.fromEntries(done) as Partial<Record<PhotoView, string>>;
                    const body: MeasurementInput = {
                        measured_on: this.measuredOn!,
                        height_cm: this.height,
                        ...this.values,
                        photo_front_oid: photo.front ?? null,
                        photo_side_oid: photo.side ?? null,
                        photo_back_oid: photo.back ?? null,
                        notes: this.notes.trim() || null
                    };
                    return this._service.recordMeasurement(this.data.who, body);
                })
            )
            .subscribe({
                next: list => this.ref.close(list),
                // The API's message is shown as a toast already.
                error: () => this.saving.set(false)
            });
    }
}
