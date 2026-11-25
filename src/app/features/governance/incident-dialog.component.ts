import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { forkJoin, map, type Observable, of, switchMap } from 'rxjs';

import { INCIDENT_CATEGORIES, INCIDENT_CATEGORY_LABEL, type IncidentCategory, type IncidentCreated, type IncidentInput } from '@core/models/governance.model';
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

export interface IncidentDialogData {
    /** Prefilled from a member's profile. */
    member?: { code: string; name: string };
    /** At HQ: the branches the case may be recorded at. */
    branches?: { oid: string; name: string }[];
}

const ROLE_LABEL: Record<string, string> = { BRANCH_MANAGER: 'Branch manager', FRONT_DESK: 'Front desk', TRAINER: 'Trainer' };
const MAX_EVIDENCE = 5;

/** `yyyy-MM-ddTHH:mm` in Dhaka now, for the time field. */
function dhakaLocalNow(): string {
    return new Date(Date.now() + 6 * 3_600_000).toISOString().slice(0, 16);
}

/**
 * Records an incident about a member (this branch's, or a visitor by code) or a staff member, at the branch
 * where it happened, citing a policy clause where one applies, with evidence (photos made small, or PDFs). The
 * notes and witnesses stay internal. A case about a branch manager goes to HQ.
 */
@Component({
    selector: 'app-incident-dialog',
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
            description="What happened, who it was about, and the rule it broke. The person never sees the notes or the evidence."
            title="Record an incident"
        >
            <div class="grid gap-4">
                @if (data.branches) {
                    <fm-field label="Branch where it happened" required>
                        <fm-select [options]="branchOptions" [(ngModel)]="branchOid" (ngModelChange)="staff.reload()" />
                    </fm-field>
                }
                <div class="flex gap-2" aria-label="About" role="radiogroup">
                    @for (k of kinds; track k.value) {
                        <button
                            type="button"
                            fmButton
                            role="radio"
                            size="sm"
                            [attr.aria-checked]="kind() === k.value"
                            [variant]="kind() === k.value ? 'primary' : 'secondary'"
                            (click)="kind.set(k.value)"
                        >
                            {{ k.label }}
                        </button>
                    }
                </div>
                @if (kind() === 'member') {
                    @if (data.member) {
                        <p class="text-sm">
                            About
                            <strong>{{ data.member.name }}</strong>
                            ({{ data.member.code }})
                        </p>
                    } @else {
                        <app-member-picker label="Member of this branch" (changed)="pickMember($event)" />
                        <fm-field hint="For a visitor from another branch, type their member code." label="Or a member code">
                            <input autocomplete="off" fmInput placeholder="MEM-DHA-000123" [(ngModel)]="code" />
                        </fm-field>
                    }
                } @else {
                    <fm-field hint="A case about a branch manager goes to HQ." label="Staff member" required>
                        <fm-select placeholder="Choose who" [options]="staffOptions()" [(ngModel)]="staffOid" />
                    </fm-field>
                }
                <div class="grid gap-3 sm:grid-cols-2">
                    <fm-field label="When" required><input type="datetime-local" fmInput [max]="now" [(ngModel)]="when" /></fm-field>
                    <fm-field label="Category" required><fm-select [options]="categories" [(ngModel)]="category" /></fm-field>
                </div>
                <fm-field label="Summary" required><input fmInput maxlength="120" placeholder="Shouting at another member" [(ngModel)]="summary" /></fm-field>
                <fm-field label="What happened" required><textarea fmInput maxlength="2000" rows="3" [(ngModel)]="description"></textarea></fm-field>
                <fm-field hint="The person sees the clause with the step you give." label="Rule broken">
                    <fm-select placeholder="None" [options]="clauseOptions()" [(ngModel)]="clauseOid" />
                </fm-field>
                <fm-field hint="Internal." label="Witnesses"><input fmInput maxlength="500" [(ngModel)]="witnesses" /></fm-field>
                <fm-field hint="Internal: never shown to the person." label="Notes">
                    <textarea fmInput maxlength="2000" rows="2" [(ngModel)]="notes"></textarea>
                </fm-field>
                @if (!data.branches) {
                    <div>
                        <p class="mb-1 text-sm font-medium">Evidence</p>
                        <p class="mb-2 text-sm text-fg-muted">Photos (made small before they are sent) or PDF statements, up to {{ max }}. No video.</p>
                        <ul class="mb-2 flex flex-wrap gap-2">
                            @for (f of files(); track $index) {
                                <li class="flex items-center gap-1 rounded border border-border px-2 py-1 text-sm">
                                    <fm-icon size="1rem" [name]="f.type === 'application/pdf' ? 'file-text' : 'image'" />
                                    {{ f.name }}
                                    <button type="button" aria-label="Remove" fmButton iconOnly size="sm" variant="ghost" (click)="drop($index)">
                                        <fm-icon name="x" size="0.875rem" />
                                    </button>
                                </li>
                            }
                        </ul>
                        @if (files().length < max) {
                            <label class="fm-btn fm-btn-secondary fm-btn-sm cursor-pointer">
                                <fm-icon name="upload" size="1rem" />
                                Add a file
                                <input class="sr-only" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" (change)="pick($event)" />
                            </label>
                        }
                    </div>
                }
                @if (problem()) {
                    <fm-alert tone="danger">{{ problem() }}</fm-alert>
                }
            </div>
            <ng-container fmDialogFooter>
                <button fmButton (click)="ref.close()">Cancel</button>
                <button fmButton variant="primary" [loading]="saving()" (click)="save()">Record</button>
            </ng-container>
        </fm-dialog-shell>
    `
})
export class IncidentDialogComponent {
    protected readonly data = inject<IncidentDialogData>(DIALOG_DATA);
    protected readonly ref = inject<DialogRef<IncidentCreated>>(DialogRef);
    private readonly _service = inject(GovernanceService);
    private readonly _files = inject(FilesService);
    protected readonly max = MAX_EVIDENCE;
    protected readonly now = dhakaLocalNow();
    protected readonly kinds: { value: 'member' | 'staff'; label: string }[] = [
        { value: 'member', label: 'A member' },
        { value: 'staff', label: 'A staff member' }
    ];
    protected readonly kind = signal<'member' | 'staff'>('member');
    protected readonly categories: SelectOption<IncidentCategory>[] = INCIDENT_CATEGORIES.map(c => ({ value: c, label: INCIDENT_CATEGORY_LABEL[c] }));
    protected readonly branchOptions: SelectOption<string>[] = (this.data.branches ?? []).map(b => ({ value: b.oid, label: b.name }));
    protected branchOid: string | null = this.data.branches?.[0]?.oid ?? null;
    protected code = this.data.member?.code ?? '';
    protected staffOid: string | null = null;
    protected when = this.now;
    protected category: IncidentCategory = 'conduct';
    protected summary = '';
    protected description = '';
    protected clauseOid: string | null = null;
    protected witnesses = '';
    protected notes = '';
    protected readonly files = signal<{ name: string; type: string; blob: Blob }[]>([]);
    protected readonly saving = signal(false);
    protected readonly problem = signal<string | null>(null);

    private readonly _clauses = rxResource({ stream: () => this._service.clauses() });
    protected readonly clauseOptions = computed<SelectOption<string | null>[]>(() => [
        { value: null, label: 'None' },
        ...(this._clauses.value() ?? []).map(c => ({ value: c.oid, label: c.label }))
    ]);
    protected readonly staff = rxResource({ stream: () => this._service.staffSubjects(this.data.branches ? (this.branchOid ?? undefined) : undefined) });
    protected readonly staffOptions = computed<SelectOption<string>[]>(() =>
        (this.staff.value() ?? []).map(s => ({ value: s.oid, label: s.name, description: ROLE_LABEL[s.role] ?? s.role }))
    );

    protected pickMember(m: MemberListItem | null): void {
        this.code = m?.code ?? '';
    }

    protected pick(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        this.problem.set(null);
        if (file.type === 'application/pdf') {
            if (file.size > 2 * 1024 * 1024) return this.problem.set('A PDF is at most 2 MB.');
            this.files.update(f => [...f, { name: file.name, type: file.type, blob: file }]);
            return;
        }
        shrinkPhoto(file)
            .then(blob => this.files.update(f => [...f, { name: file.name.replace(/\.\w+$/, '.jpg'), type: blob.type, blob }]))
            .catch((err: unknown) => this.problem.set(err instanceof Error ? err.message : 'This photo could not be read.'));
    }

    protected drop(i: number): void {
        this.files.update(f => f.filter((_, j) => j !== i));
    }

    protected save(): void {
        this.problem.set(null);
        const member = this.kind() === 'member';
        if (member && !this.code.trim()) return this.problem.set('Choose the member, or type their code.');
        if (!member && !this.staffOid) return this.problem.set('Choose the staff member.');
        if (this.summary.trim().length < 3 || this.description.trim().length < 3) return this.problem.set('Give a summary and say what happened.');
        this.saving.set(true);
        const uploads: Observable<string>[] = this.files().map(f => this._files.upload('incident_evidence', f.blob, f.name));
        (uploads.length ? forkJoin(uploads) : of([] as string[]))
            .pipe(
                map(evidence => {
                    const body: IncidentInput = {
                        subject_kind: this.kind(),
                        occurred_at: `${this.when}:00+06:00`,
                        category: this.category,
                        summary: this.summary.trim(),
                        description: this.description.trim(),
                        clause_oid: this.clauseOid,
                        witnesses: this.witnesses.trim() || null,
                        internal_notes: this.notes.trim() || null,
                        evidence_file_oids: evidence,
                        ...(member ? { member_code: this.code.trim().toUpperCase() } : { staff_oid: this.staffOid! }),
                        ...(this.data.branches && this.branchOid ? { branch_oid: this.branchOid } : {})
                    };
                    return body;
                }),
                switchMap(body => this._service.recordIncident(body))
            )
            .subscribe({ next: c => this.ref.close(c), error: () => this.saving.set(false) });
    }
}
