import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { map, type Observable, of, switchMap } from 'rxjs';

import { type Complaint, COMPLAINT_CATEGORIES, COMPLAINT_CATEGORY_LABEL, type ComplaintCategory, type ComplaintInput } from '@core/models/governance.model';
import type { MemberListItem } from '@core/models/member.model';
import { FilesService } from '@core/services/files.service';
import { shrinkPhoto } from '@core/utils/media.utils';
import { MemberPickerComponent } from '@features/console/member-picker.component';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DIALOG_DATA, DialogRef } from '@shared/ui/dialog/dialog-ref';
import { DialogFooterDirective, DialogShellComponent } from '@shared/ui/dialog/dialog-shell.component';
import { AlertComponent } from '@shared/ui/display/display';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { GovernanceService } from './governance.service';

export interface ComplaintFormData {
    /** The member portal: the member files their own. */
    portal: boolean;
    /** The desk: a member chosen already (from their profile). */
    member?: { oid: string; name: string };
}

const ROLE_LABEL: Record<string, string> = { BRANCH_MANAGER: 'Branch manager', FRONT_DESK: 'Front desk', TRAINER: 'Trainer' };

/**
 * Files a complaint (D-095): in the portal, the member's own; at the desk, for a member of the branch or a visitor by
 * name. A category, what happened, an optional photo (made small before it is sent) and, for a complaint about staff,
 * who: it is hidden from them, and one about the branch manager goes to HQ.
 */
@Component({
    selector: 'app-complaint-form-dialog',
    imports: [
        FormsModule,
        ButtonComponent,
        DialogShellComponent,
        DialogFooterDirective,
        AlertComponent,
        FieldComponent,
        InputDirective,
        SelectComponent,
        IconComponent,
        MemberPickerComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <fm-dialog-shell
            title="File a complaint"
            [description]="
                data.portal
                    ? 'The branch replies within 2 days. If it is about a member of staff, they do not see it.'
                    : 'On someone’s behalf. A complaint about staff is hidden from them.'
            "
        >
            <div class="grid gap-4">
                @if (!data.portal) {
                    @if (data.member) {
                        <p class="text-sm">
                            From
                            <strong>{{ data.member.name }}</strong>
                        </p>
                    } @else {
                        <app-member-picker label="Member" (changed)="member = $event" />
                        <fm-field hint="If they are not a member of this branch." label="Or their name">
                            <input fmInput maxlength="120" [(ngModel)]="name" />
                        </fm-field>
                    }
                }
                <fm-field label="About" required><fm-select [options]="categories" [(ngModel)]="category" /></fm-field>
                @if (category === 'staff') {
                    <fm-field hint="They will not see this complaint." label="Which member of staff">
                        <fm-select placeholder="Not one person" [options]="staffOptions()" [(ngModel)]="namedStaff" />
                    </fm-field>
                }
                <fm-field label="Subject" required><input fmInput maxlength="120" [(ngModel)]="subject" /></fm-field>
                <fm-field label="What happened" required><textarea fmInput maxlength="2000" rows="4" [(ngModel)]="body"></textarea></fm-field>
                <div>
                    @if (preview()) {
                        <img class="mb-2 max-h-40 rounded-lg" alt="The photo to send" [src]="preview()" />
                    }
                    <label class="fm-btn fm-btn-secondary fm-btn-sm cursor-pointer">
                        <fm-icon name="camera" size="1rem" />
                        {{ preview() ? 'Another photo' : 'Add a photo' }}
                        <input class="sr-only" type="file" accept="image/jpeg,image/png,image/webp" (change)="pick($event)" />
                    </label>
                </div>
                @if (problem()) {
                    <fm-alert tone="danger">{{ problem() }}</fm-alert>
                }
            </div>
            <ng-container fmDialogFooter>
                <button fmButton (click)="ref.close()">Cancel</button>
                <button fmButton variant="primary" [loading]="saving()" (click)="save()">Send</button>
            </ng-container>
        </fm-dialog-shell>
    `
})
export class ComplaintFormDialogComponent {
    protected readonly data = inject<ComplaintFormData>(DIALOG_DATA);
    protected readonly ref = inject<DialogRef<Complaint | { oid: string; sent_to_hq: true }>>(DialogRef);
    private readonly _service = inject(GovernanceService);
    private readonly _files = inject(FilesService);
    protected readonly categories: SelectOption<ComplaintCategory>[] = COMPLAINT_CATEGORIES.map(c => ({ value: c, label: COMPLAINT_CATEGORY_LABEL[c] }));
    protected category: ComplaintCategory = 'facilities';
    protected member: MemberListItem | null = null;
    protected name = '';
    protected subject = '';
    protected body = '';
    protected namedStaff: string | null = null;
    private _photo: Blob | null = null;
    protected readonly preview = signal<string | null>(null);
    protected readonly saving = signal(false);
    protected readonly problem = signal<string | null>(null);
    private readonly _staff = rxResource({
        stream: () =>
            this.data.portal
                ? this._service.complaintStaff()
                : this._service.staffSubjects().pipe(map(list => list.map(s => ({ oid: s.oid, name: s.name, role: s.role }))))
    });
    protected readonly staffOptions = computed<SelectOption<string | null>[]>(() => [
        { value: null, label: 'Not one person' },
        ...(this._staff.value() ?? []).map(s => ({ value: s.oid, label: s.name, description: ROLE_LABEL[s.role] ?? s.role }))
    ]);

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
        if (!this.data.portal && !this.data.member && !this.member && this.name.trim().length < 2)
            return this.problem.set('Choose the member, or give the person’s name.');
        if (this.subject.trim().length < 3) return this.problem.set('Give the complaint a subject.');
        if (this.body.trim().length < 10) return this.problem.set('Say what happened (at least 10 characters).');
        this.saving.set(true);
        const memberOid = this.data.member?.oid ?? this.member?.oid ?? null;
        const photo$: Observable<string | null> = this._photo
            ? this._files.upload('complaint_photo', this._photo, 'complaint.jpg', this.data.portal ? undefined : (memberOid ?? undefined), this.data.portal)
            : of(null);
        photo$
            .pipe(
                switchMap(photo => {
                    const body: ComplaintInput = {
                        category: this.category,
                        subject: this.subject.trim(),
                        body: this.body.trim(),
                        photo_file_oid: photo,
                        named_staff_oid: this.category === 'staff' ? this.namedStaff : null,
                        ...(this.data.portal ? {} : memberOid ? { member_oid: memberOid } : { member_name: this.name.trim() })
                    };
                    return this._service.fileComplaint(body, this.data.portal);
                })
            )
            .subscribe({ next: c => this.ref.close(c), error: () => this.saving.set(false) });
    }
}
