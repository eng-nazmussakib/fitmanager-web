import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { of, switchMap } from 'rxjs';

import type { Trainer } from '@core/models/class.model';
import type { TrainerInput } from '@core/models/scheduling.model';
import { FilesService } from '@core/services/files.service';
import { revealErrors } from '@core/utils/form.utils';
import { shrinkPhoto } from '@core/utils/media.utils';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DIALOG_DATA, DialogRef } from '@shared/ui/dialog/dialog-ref';
import { DialogFooterDirective, DialogShellComponent } from '@shared/ui/dialog/dialog-shell.component';
import { AlertComponent, AvatarComponent } from '@shared/ui/display/display';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { SwitchComponent } from '@shared/ui/forms/switch.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { SchedulingService } from '../scheduling.service';

export interface TrainerEditorData {
    /** Absent: a new profile for a staff member with the Trainer role. */
    trainer?: Trainer;
    /** A trainer editing their own profile: no web address or active switch. */
    self?: boolean;
}

const slugOf = (name: string): string =>
    name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

/**
 * Add or edit a trainer profile: the public headline, bio, specialties and certificates, a photo (resized
 * in the browser before upload), the phone for the desk, and whether the profile shows on the public site.
 */
@Component({
    selector: 'app-trainer-editor-dialog',
    imports: [
        FormsModule,
        ReactiveFormsModule,
        ButtonComponent,
        DialogShellComponent,
        DialogFooterDirective,
        AlertComponent,
        AvatarComponent,
        FieldComponent,
        InputDirective,
        SelectComponent,
        SwitchComponent,
        IconComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <fm-dialog-shell
            [description]="isNew ? 'For a staff member with the Trainer role at this branch.' : (data.trainer?.username ?? '')"
            [title]="isNew ? 'Add a trainer profile' : 'Edit ' + data.trainer!.name"
        >
            <form id="trainer-form" class="grid gap-4" novalidate [formGroup]="form" (ngSubmit)="save()">
                @if (isNew) {
                    <fm-field hint="Add them on the Staff page with the Trainer role first." label="Staff member" required>
                        <fm-select ariaLabel="Staff member" formControlName="user_oid" placeholder="Choose" [options]="candidateOptions()" />
                    </fm-field>
                }
                <div class="flex items-center gap-4">
                    <fm-avatar size="4rem" [name]="data.trainer?.name ?? '?'" [src]="photoPreview()" />
                    <label class="fm-btn fm-btn-secondary fm-btn-sm cursor-pointer">
                        <fm-icon name="camera" size="1rem" />
                        {{ photoPreview() ? 'Change photo' : 'Add a photo' }}
                        <input class="sr-only" type="file" accept="image/jpeg,image/png,image/webp" (change)="pickPhoto($event)" />
                    </label>
                </div>
                <div class="grid gap-4 sm:grid-cols-2">
                    @if (!data.self) {
                        <fm-field hint="The public page: /trainers/<address>." label="Web address" required>
                            <input autocapitalize="off" fmInput formControlName="slug" spellcheck="false" />
                        </fm-field>
                    }
                    <fm-field label="Gender" required>
                        <fm-select ariaLabel="Gender" formControlName="gender" [options]="genders" />
                    </fm-field>
                    <fm-field hint="For the desk; never shown on the public site." label="Mobile">
                        <input autocomplete="off" fmInput formControlName="phone" inputmode="tel" />
                    </fm-field>
                    <fm-field label="Headline">
                        <input fmInput formControlName="headline" maxlength="120" />
                    </fm-field>
                </div>
                <fm-field label="About">
                    <textarea fmInput formControlName="bio" maxlength="2000" rows="4"></textarea>
                </fm-field>
                <fm-field hint="Comma separated, e.g. Strength, Mobility." label="Specialties">
                    <input fmInput formControlName="specialties" />
                </fm-field>
                <fm-field hint="One per line: name, issuer, year." label="Certificates">
                    <textarea fmInput formControlName="certifications" rows="3"></textarea>
                </fm-field>
                <div class="flex flex-wrap gap-6">
                    <fm-switch formControlName="public">Show on the public site</fm-switch>
                    @if (!isNew && !data.self) {
                        <fm-switch formControlName="active">Active</fm-switch>
                    }
                </div>
                @if (problem()) {
                    <fm-alert tone="danger">{{ problem() }}</fm-alert>
                }
            </form>
            <ng-container fmDialogFooter>
                <button type="button" fmButton (click)="ref.close()">Cancel</button>
                <button type="submit" fmButton form="trainer-form" variant="primary" [loading]="saving()">{{ isNew ? 'Add' : 'Save' }}</button>
            </ng-container>
        </fm-dialog-shell>
    `
})
export class TrainerEditorDialogComponent {
    protected readonly data = inject<TrainerEditorData>(DIALOG_DATA);
    protected readonly ref = inject<DialogRef<Trainer>>(DialogRef);
    private readonly _service = inject(SchedulingService);
    private readonly _files = inject(FilesService);
    protected readonly isNew = !this.data.trainer;
    protected readonly saving = signal(false);
    protected readonly problem = signal<string | null>(null);
    protected readonly photoPreview = signal<string | null>(this.data.trainer?.photo_url ?? null);
    private _photo: Blob | null = null;
    protected readonly genders: SelectOption<string>[] = [
        { value: 'Male', label: 'Male' },
        { value: 'Female', label: 'Female' }
    ];
    private readonly _candidates = rxResource({ stream: () => (this.isNew ? this._service.candidates() : of([])) });
    protected readonly candidateOptions = computed<SelectOption<string>[]>(() =>
        (this._candidates.value() ?? []).map(c => ({ value: c.user_oid, label: c.name, description: c.username }))
    );

    private readonly _t = this.data.trainer;
    protected readonly form = inject(NonNullableFormBuilder).group({
        user_oid: ['', this.isNew ? [Validators.required] : []],
        slug: [this._t?.slug ?? '', this.data.self ? [] : [Validators.required, Validators.pattern(/^[a-z0-9][a-z0-9-]{1,60}$/)]],
        gender: [this._t?.gender ?? 'Male'],
        phone: [this._t?.phone ?? '', [Validators.pattern(/^(\+?880|0)1[3-9]\d{8}$/)]],
        headline: [this._t?.headline ?? ''],
        bio: [this._t?.bio ?? ''],
        specialties: [(this._t?.specialties ?? []).join(', ')],
        certifications: [(this._t?.certifications ?? []).map(c => [c.name, c.issuer ?? '', c.year ?? ''].join(', ')).join('\n')],
        public: [this._t?.public ?? true],
        active: [this._t?.active ?? true]
    });

    constructor() {
        // A new profile: suggest the web address from the chosen staff member's name.
        this.form.controls.user_oid.valueChanges.subscribe(oid => {
            const c = this._candidates.value()?.find(x => x.user_oid === oid);
            if (c && !this.form.controls.slug.dirty) this.form.controls.slug.setValue(slugOf(c.name));
        });
    }

    protected pickPhoto(event: Event): void {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) return;
        this.problem.set(null);
        shrinkPhoto(file, 800, 1024 * 1024)
            .then(blob => {
                this._photo = blob;
                this.photoPreview.set(URL.createObjectURL(blob));
            })
            .catch((err: unknown) => this.problem.set(err instanceof Error ? err.message : 'This photo could not be read.'));
    }

    protected save(): void {
        this.problem.set(null);
        if (this.form.invalid) {
            revealErrors(this.form);
            return;
        }
        const v = this.form.getRawValue();
        const body: TrainerInput = {
            gender: v.gender,
            phone: v.phone.trim() || null,
            headline: v.headline.trim() || null,
            bio: v.bio.trim() || null,
            specialties: v.specialties
                .split(',')
                .map(x => x.trim())
                .filter(Boolean),
            certifications: v.certifications
                .split('\n')
                .map(line => line.split(',').map(x => x.trim()))
                .filter(([name]) => !!name && name.length >= 2)
                .map(([name, issuer, year]) => ({ name: name, issuer: issuer || null, year: year && /^\d{4}$/.test(year) ? Number(year) : null })),
            public: v.public,
            ...(this.data.self ? {} : { slug: v.slug.trim() }),
            ...(this.isNew ? { user_oid: v.user_oid } : this.data.self ? {} : { active: v.active })
        };
        this.saving.set(true);
        (this._photo ? this._files.upload('trainer_photo', this._photo, 'trainer.jpg') : of<string | null>(null))
            .pipe(
                switchMap(photo => {
                    const payload = photo ? { ...body, photo_file_oid: photo } : body;
                    return this.isNew ? this._service.createTrainer(payload) : this._service.updateTrainer(this.data.trainer!.oid, payload);
                })
            )
            .subscribe({
                next: t => this.ref.close(t),
                // The API's message is shown as a toast already.
                error: () => this.saving.set(false)
            });
    }
}
