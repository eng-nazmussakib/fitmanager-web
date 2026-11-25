import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { type Observable, of, switchMap } from 'rxjs';

import type { Gender } from '@core/models/member.model';
import { dataUrlToBlob, FilesService } from '@core/services/files.service';
import { revealErrors } from '@core/utils/form.utils';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogComponent } from '@shared/ui/dialog/dialog.component';
import { AvatarComponent, CardComponent, CardFooterDirective } from '@shared/ui/display/display';
import { DatePickerComponent, todayIso } from '@shared/ui/forms/date-picker.component';
import { CheckDirective, FieldComponent, InputDirective, PrefixDirective } from '@shared/ui/forms/field.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { IconComponent } from '@shared/ui/icon/icon.component';
import { AppValidators } from '@shared/validators/app.validators';

import { ConsoleService } from '../console.service';
import { PhotoCropperComponent } from './photo-cropper.component';

const HEALTH = ['Asthma', 'Diabetes', 'High blood pressure', 'Heart condition', 'Knee injury', 'Lower back pain', 'Shoulder injury', 'Pregnancy'];

/**
 * H2: "Add member". A new member starts as a join request (Pending); the membership starts with the first payment
 *, so saving goes straight on to selling the first plan.
 */
@Component({
    selector: 'app-member-form-page',
    imports: [
        ReactiveFormsModule,
        RouterLink,
        PageHeaderComponent,
        ButtonComponent,
        AvatarComponent,
        CardComponent,
        CardFooterDirective,
        DialogComponent,
        DatePickerComponent,
        CheckDirective,
        FieldComponent,
        InputDirective,
        PrefixDirective,
        SelectComponent,
        IconComponent,
        PhotoCropperComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-page-header subtitle="After saving, sell the first plan: the membership starts with the first payment." title="Add member" />
        <form class="grid max-w-4xl gap-5" novalidate [formGroup]="form" (ngSubmit)="save()">
            <fm-card title="Photo and identity">
                <div class="flex flex-col gap-6 sm:flex-row">
                    <div class="flex flex-col items-center gap-3">
                        <fm-avatar size="7rem" [name]="form.controls.name.value || 'New member'" [src]="photo()" />
                        <label class="fm-btn fm-btn-secondary fm-btn-sm cursor-pointer">
                            <fm-icon name="camera" size="1rem" />
                            {{ photo() ? 'Change photo' : 'Add photo' }}
                            <input #file class="sr-only" type="file" accept="image/*" capture="user" (change)="pick($event, file)" />
                        </label>
                    </div>
                    <div class="grid flex-1 gap-4 sm:grid-cols-2">
                        <fm-field class="sm:col-span-2" label="Full name" required><input autocomplete="off" fmInput formControlName="name" /></fm-field>
                        <fm-field hint="01XXXXXXXXX: the member's contact number, unique across branches" label="Mobile" required>
                            <span class="text-sm" fmPrefix>+88</span>
                            <input autocomplete="off" fmInput formControlName="phone" inputmode="tel" style="--fm-prefix-w: 2.75rem" />
                        </fm-field>
                        <fm-field label="Gender" required><fm-select formControlName="gender" [options]="genders" /></fm-field>
                        <fm-field label="Date of birth"><fm-date-picker formControlName="date_of_birth" [max]="today" /></fm-field>
                        <fm-field label="E-mail"><input type="email" autocomplete="off" fmInput formControlName="email" /></fm-field>
                        <fm-field class="sm:col-span-2" label="Address"><input autocomplete="off" fmInput formControlName="address" /></fm-field>
                    </div>
                </div>
            </fm-card>

            <fm-card formGroupName="emergency" title="Emergency contact">
                <div class="grid gap-4 sm:grid-cols-3">
                    <fm-field label="Name"><input fmInput formControlName="name" /></fm-field>
                    <fm-field label="Mobile"><input fmInput formControlName="phone" inputmode="tel" /></fm-field>
                    <fm-field label="Relation"><input fmInput formControlName="relation" placeholder="e.g. Brother" /></fm-field>
                </div>
            </fm-card>

            <fm-card title="Health declaration">
                <fieldset>
                    <legend class="fm-label mb-2">Conditions the trainer should know about</legend>
                    <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        @for (h of health; track h) {
                            <label class="fm-check-label">
                                <input type="checkbox" fmCheck [checked]="flags().includes(h)" (change)="toggleFlag(h)" />
                                {{ h }}
                            </label>
                        }
                    </div>
                </fieldset>
                <label class="fm-check-label mt-5 items-start">
                    <input class="mt-0.5" type="checkbox" fmCheck formControlName="health_declared" [attr.aria-invalid]="declarationMissing()" />
                    <span>The member declares they are fit to exercise and has told us about any condition above.</span>
                </label>
                <label class="fm-check-label mt-3 items-start">
                    <input class="mt-0.5" type="checkbox" fmCheck formControlName="policies_signed" />
                    <span>
                        The member signed the gym's policies on paper (gym rules, membership terms, refund and privacy policies, liability waiver). Otherwise
                        they accept them in the member portal within 14 days.
                    </span>
                </label>
                @if (declarationMissing()) {
                    <p class="fm-error mt-2">The member must sign the health declaration.</p>
                }
                <footer fmCardFooter>
                    <a fmButton routerLink="..">Cancel</a>
                    <button type="submit" fmButton variant="primary" [loading]="saving()">Save and sell a plan</button>
                </footer>
            </fm-card>
        </form>

        <fm-dialog size="sm" title="Crop photo" [open]="!!pickEvent()" (openChange)="!$event && pickEvent.set(null)">
            @if (pickEvent(); as e) {
                @defer {
                    <app-photo-cropper [event]="e" (cancelled)="pickEvent.set(null)" (done)="photo.set($event); pickEvent.set(null)" />
                }
            }
        </fm-dialog>
    `
})
export class MemberFormPageComponent {
    private readonly _service = inject(ConsoleService);
    private readonly _router = inject(Router);
    private readonly _route = inject(ActivatedRoute);
    private readonly _fb = inject(NonNullableFormBuilder);
    private readonly _files = inject(FilesService);

    protected readonly today = todayIso();
    protected readonly health = HEALTH;
    protected readonly genders: SelectOption<Gender>[] = [
        { value: 'Male', label: 'Male' },
        { value: 'Female', label: 'Female' }
    ];
    protected readonly saving = signal(false);
    protected readonly photo = signal<string | null>(null);
    protected readonly pickEvent = signal<Event | null>(null);
    protected readonly flags = signal<string[]>([]);
    protected readonly submitted = signal(false);

    protected readonly form = this._fb.group({
        name: ['', [Validators.required, Validators.minLength(3)]],
        phone: ['', [Validators.required, AppValidators.bdMobile]],
        gender: ['Male' as Gender, Validators.required],
        date_of_birth: [null as string | null],
        email: ['', Validators.email],
        address: [''],
        emergency: this._fb.group({ name: [''], phone: [''], relation: [''] }),
        health_declared: [false, Validators.requiredTrue],
        policies_signed: [true]
    });

    protected declarationMissing(): boolean {
        return this.submitted() && !this.form.controls.health_declared.value;
    }

    protected pick(event: Event, input: HTMLInputElement): void {
        if (input.files?.length) this.pickEvent.set(event);
    }

    protected toggleFlag(flag: string): void {
        this.flags.update(list => (list.includes(flag) ? list.filter(f => f !== flag) : [...list, flag]));
    }

    protected save(): void {
        this.submitted.set(true);
        if (this.form.invalid) {
            revealErrors(this.form);
            return;
        }
        const v = this.form.getRawValue();
        this.saving.set(true);
        // The photo goes to the file store first; the member then points at the checked file.
        const photo = this.photo();
        const photoFile$: Observable<string | null> = photo ? this._files.upload('member_photo', dataUrlToBlob(photo), 'photo.jpg') : of(null);
        photoFile$
            .pipe(
                switchMap(photoFileOid =>
                    this._service.createMember({
                        name: v.name,
                        phone: v.phone,
                        gender: v.gender,
                        email: v.email || null,
                        date_of_birth: v.date_of_birth,
                        address: v.address || null,
                        emergency_contact: v.emergency.name ? v.emergency : null,
                        health_flags: this.flags(),
                        health_declared: v.health_declared,
                        policies_signed: v.policies_signed,
                        photo_file_oid: photoFileOid
                    })
                )
            )
            .subscribe({
                next: m => void this._router.navigate(['..', m.oid, 'subscribe'], { relativeTo: this._route }),
                error: () => this.saving.set(false)
            });
    }
}
