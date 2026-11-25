import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { concatMap, from, map, type Observable, of, switchMap, toArray } from 'rxjs';

import {
    CATEGORY_LABEL,
    type Equipment,
    EQUIPMENT_LABEL,
    type Exercise,
    type ExerciseCategory,
    type ExerciseInput,
    type Measure,
    MEASURE_LABEL,
    type Muscle,
    MUSCLE_LABEL
} from '@core/models/training.model';
import { FilesService } from '@core/services/files.service';
import { checkVideo, shrinkPhoto } from '@core/utils/media.utils';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DIALOG_DATA, DialogRef } from '@shared/ui/dialog/dialog-ref';
import { DialogFooterDirective, DialogShellComponent } from '@shared/ui/dialog/dialog-shell.component';
import { AlertComponent } from '@shared/ui/display/display';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { SwitchComponent } from '@shared/ui/forms/switch.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { TrainingService } from './training.service';

export interface ExerciseEditorData {
    exercise?: Exercise;
    /** Where it is added: HQ's library or the branch's own. */
    scope: 'hq' | 'branch';
}

interface Photo {
    /** An uploaded file, or a new one to upload on save. */
    file_oid?: string;
    blob?: Blob;
    url: string;
}

const options = <T extends string>(labels: Record<T, string>): SelectOption<T>[] =>
    Object.entries(labels).map(([value, label]) => ({ value: value as T, label: label as string }));

/**
 * Adds or edits an exercise: name, category, how sets are measured, muscles (the first is the main one),
 * equipment and instructions, up to 3 photos (made small in the browser) and a short video (MP4 or WebM, at most
 * 8 MB and 10 seconds). The files are uploaded on save.
 */
@Component({
    selector: 'app-exercise-editor-dialog',
    imports: [
        FormsModule,
        ButtonComponent,
        DialogShellComponent,
        DialogFooterDirective,
        AlertComponent,
        FieldComponent,
        InputDirective,
        SelectComponent,
        SwitchComponent,
        IconComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <fm-dialog-shell
            [description]="data.scope === 'hq' ? 'In the HQ library: every branch sees it.' : 'This branch’s own: other branches do not see it.'"
            [title]="data.exercise ? 'Edit ' + data.exercise.name : 'Add an exercise'"
        >
            <div class="grid gap-4">
                <div class="grid gap-3 sm:grid-cols-2">
                    <fm-field class="sm:col-span-2" label="Name" required><input fmInput maxlength="80" [(ngModel)]="name" /></fm-field>
                    <fm-field label="Category"><fm-select ariaLabel="Category" [options]="categories" [(ngModel)]="category" /></fm-field>
                    <fm-field hint="What a set records." label="Measured as">
                        <fm-select ariaLabel="Measured as" [options]="measures" [(ngModel)]="measure" />
                    </fm-field>
                    <fm-field label="Equipment"><fm-select ariaLabel="Equipment" [options]="equipment" [(ngModel)]="gear" /></fm-field>
                </div>
                <fieldset>
                    <legend class="mb-2 text-sm font-medium">
                        Muscles
                        <span class="font-normal text-fg-muted">(the first picked is the main one; up to 5)</span>
                    </legend>
                    <div class="flex flex-wrap gap-1.5">
                        @for (m of muscleList; track m.value) {
                            <button
                                class="rounded-full border px-3 py-1 text-sm"
                                type="button"
                                [attr.aria-pressed]="muscles().includes(m.value)"
                                [class]="muscles().includes(m.value) ? 'border-primary-500 bg-primary-500/10' : 'border-border'"
                                (click)="toggle(m.value)"
                            >
                                {{ m.label }}{{ muscles()[0] === m.value ? ' (main)' : '' }}
                            </button>
                        }
                    </div>
                </fieldset>
                <fm-field label="How to do it"><textarea fmInput maxlength="2000" rows="3" [(ngModel)]="instructions"></textarea></fm-field>

                <div>
                    <p class="mb-2 text-sm font-medium">
                        Photos
                        <span class="font-normal text-fg-muted">(up to 3, made small before they are sent)</span>
                    </p>
                    <div class="flex flex-wrap gap-2">
                        @for (p of photos(); track p.url; let i = $index) {
                            <div class="relative">
                                <img class="h-24 w-32 rounded-md border border-border object-cover" alt="" [src]="p.url" />
                                <button
                                    class="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white"
                                    type="button"
                                    aria-label="Remove photo"
                                    (click)="removePhoto(i)"
                                >
                                    <fm-icon name="x" size="0.875rem" />
                                </button>
                            </div>
                        }
                        @if (photos().length < 3) {
                            <label
                                class="flex h-24 w-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border text-sm text-fg-muted hover:border-primary-500"
                            >
                                <fm-icon name="image" size="1.25rem" />
                                Add a photo
                                <input class="sr-only" type="file" accept="image/jpeg,image/png,image/webp" (change)="pickPhoto($event)" />
                            </label>
                        }
                    </div>
                </div>
                <div>
                    <p class="mb-2 text-sm font-medium">
                        Video
                        <span class="font-normal text-fg-muted">(MP4 or WebM, up to 10 seconds and 8 MB)</span>
                    </p>
                    @if (video(); as v) {
                        <div class="flex items-start gap-2">
                            <video class="h-32 rounded-md border border-border" controls loop muted playsinline [src]="v.url"></video>
                            <button fmButton size="sm" variant="ghost" (click)="video.set(null)">
                                <fm-icon name="trash-2" size="1rem" />
                                Remove
                            </button>
                        </div>
                    } @else {
                        <label class="fm-btn fm-btn-secondary fm-btn-sm cursor-pointer">
                            <fm-icon name="video" size="1rem" />
                            Add a video
                            <input class="sr-only" type="file" accept="video/mp4,video/webm" (change)="pickVideo($event)" />
                        </label>
                    }
                </div>
                @if (data.exercise) {
                    <fm-switch [(ngModel)]="active">In use (offered in routines and workouts)</fm-switch>
                }
                @if (problem()) {
                    <fm-alert tone="danger">{{ problem() }}</fm-alert>
                }
            </div>
            <ng-container fmDialogFooter>
                <button fmButton (click)="ref.close()">Cancel</button>
                <button fmButton variant="primary" [loading]="saving()" (click)="save()">{{ data.exercise ? 'Save' : 'Add' }}</button>
            </ng-container>
        </fm-dialog-shell>
    `
})
export class ExerciseEditorDialogComponent {
    protected readonly data = inject<ExerciseEditorData>(DIALOG_DATA);
    protected readonly ref = inject<DialogRef<Exercise>>(DialogRef);
    private readonly _service = inject(TrainingService);
    private readonly _files = inject(FilesService);
    private readonly _e = this.data.exercise;
    protected name = this._e?.name ?? '';
    protected category: ExerciseCategory = this._e?.category ?? 'strength';
    protected measure: Measure = this._e?.measure ?? 'weight_reps';
    protected gear: Equipment = this._e?.equipment ?? 'dumbbell';
    protected instructions = this._e?.instructions ?? '';
    protected active = this._e?.active ?? true;
    protected readonly muscles = signal<Muscle[]>(this._e?.muscles ?? []);
    protected readonly photos = signal<Photo[]>(this._e?.photos.map(p => ({ file_oid: p.file_oid, url: p.url })) ?? []);
    protected readonly video = signal<Photo | null>(this._e?.video ? { file_oid: this._e.video.file_oid, url: this._e.video.url } : null);
    protected readonly saving = signal(false);
    protected readonly problem = signal<string | null>(null);
    protected readonly categories = options(CATEGORY_LABEL);
    protected readonly measures = options(MEASURE_LABEL);
    protected readonly equipment = options(EQUIPMENT_LABEL);
    protected readonly muscleList = options(MUSCLE_LABEL);

    protected toggle(m: Muscle): void {
        this.muscles.update(list => (list.includes(m) ? list.filter(x => x !== m) : list.length < 5 ? [...list, m] : list));
    }

    protected pickPhoto(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        this.problem.set(null);
        shrinkPhoto(file)
            .then(blob => this.photos.update(p => [...p, { blob, url: URL.createObjectURL(blob) }]))
            .catch((err: unknown) => this.problem.set(err instanceof Error ? err.message : 'This photo could not be read.'));
    }

    protected removePhoto(i: number): void {
        this.photos.update(p => p.filter((_, j) => j !== i));
    }

    protected pickVideo(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        this.problem.set(null);
        checkVideo(file)
            .then(problem => (problem ? this.problem.set(problem) : this.video.set({ blob: file, url: URL.createObjectURL(file) })))
            .catch((err: unknown) => this.problem.set(err instanceof Error ? err.message : 'This video could not be read.'));
    }

    protected save(): void {
        this.problem.set(null);
        if (this.name.trim().length < 2) return this.problem.set('Name the exercise (at least 2 characters).');
        if (!this.muscles().length) return this.problem.set('Pick at least one muscle.');
        this.saving.set(true);
        const photoOids: Observable<string[]> = from(this.photos()).pipe(
            concatMap(p => (p.file_oid ? of(p.file_oid) : this._files.upload('exercise_photo', p.blob!, 'photo.jpg'))),
            toArray()
        );
        const v = this.video();
        const videoOid: Observable<string | null> = !v ? of(null) : v.file_oid ? of(v.file_oid) : this._files.upload('exercise_video', v.blob!, 'video');
        photoOids
            .pipe(
                switchMap(photos => videoOid.pipe(map(video => ({ photos, video })))),
                switchMap(({ photos, video }) => {
                    const body: ExerciseInput = {
                        name: this.name.trim(),
                        category: this.category,
                        measure: this.measure,
                        muscles: this.muscles(),
                        equipment: this.gear,
                        instructions: this.instructions.trim() || null,
                        photo_file_oids: photos,
                        video_file_oid: video,
                        ...(this._e ? { active: this.active } : {})
                    };
                    return this._e ? this._service.updateExercise(this._e.oid, body) : this._service.createExercise(body);
                })
            )
            .subscribe({
                next: e => this.ref.close(e),
                // The API's message is shown as a toast already.
                error: () => this.saving.set(false)
            });
    }
}
