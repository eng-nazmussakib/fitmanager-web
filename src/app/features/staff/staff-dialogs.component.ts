import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize, Observable, of, switchMap } from 'rxjs';

import { ignoreHandledApiError } from '@core/http/api-error';
import { STAFF_ROLE_LABELS, type StaffRole } from '@core/models/branch.model';
import type { StaffAssignmentInput, StaffList, StaffMember } from '@core/models/staff.model';
import { revealErrors } from '@core/utils/form.utils';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DIALOG_DATA, DialogRef } from '@shared/ui/dialog/dialog-ref';
import { DialogFooterDirective, DialogShellComponent } from '@shared/ui/dialog/dialog-shell.component';
import { AlertComponent } from '@shared/ui/display/display';
import { CheckDirective, FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { type StaffLevel, StaffService } from './staff.service';

const PASSWORD = /^(?=.*\p{L})(?=.*\d).{8,200}$/u;
const USERNAME = /^[a-z0-9][a-z0-9._-]{2,49}$/;

export interface StaffEditorData {
    level: StaffLevel;
    /** Absent: a new account. */
    member?: StaffMember;
    list: StaffList;
}

/**
 * Add or edit a staff account (D-054, D-055). A new account gets a temporary password the admin types; the person
 * must change it at sign-in. At HQ the assignments are edited as a set (one role per branch); at a branch, the role
 * there. Only the roles the caller may hand out are offered (`assignable_roles` from the API).
 */
@Component({
    selector: 'app-staff-editor-dialog',
    imports: [
        FormsModule,
        ReactiveFormsModule,
        ButtonComponent,
        DialogShellComponent,
        DialogFooterDirective,
        AlertComponent,
        FieldComponent,
        InputDirective,
        CheckDirective,
        SelectComponent,
        IconComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <fm-dialog-shell
            [description]="isNew ? 'They sign in with the temporary password and must choose their own.' : data.member!.username"
            [title]="isNew ? 'Add staff' : 'Edit ' + data.member!.name"
        >
            <form id="staff-form" class="grid gap-4" novalidate [formGroup]="form" (ngSubmit)="save()">
                @if (isNew) {
                    <fm-field hint="Letters, digits, dots, dashes or underscores." label="Username" required>
                        <input autocapitalize="off" autocomplete="off" fmInput formControlName="username" spellcheck="false" />
                    </fm-field>
                }
                <fm-field label="Full name" required>
                    <input autocomplete="off" fmInput formControlName="name" />
                </fm-field>
                <fm-field hint="Optional." label="Email">
                    <input type="email" autocomplete="off" fmInput formControlName="email" />
                </fm-field>
                @if (isNew) {
                    <fm-field hint="At least 8 characters with a letter and a digit. Tell them in person." label="Temporary password" required>
                        <input autocomplete="new-password" fmInput formControlName="password" />
                    </fm-field>
                }

                @if (data.level === 'branch') {
                    <fm-field label="Role at this branch" required>
                        <fm-select
                            ariaLabel="Role"
                            [ngModel]="branchRole()"
                            [ngModelOptions]="{ standalone: true }"
                            [options]="branchRoleOptions"
                            (ngModelChange)="branchRole.set($event)"
                        />
                    </fm-field>
                } @else {
                    <fieldset class="grid gap-2">
                        <legend class="mb-1 text-sm font-medium">Where they work</legend>
                        @for (row of rows(); track $index; let i = $index) {
                            <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
                                <fm-select
                                    ariaLabel="Branch"
                                    [ngModel]="row.branch_oid"
                                    [ngModelOptions]="{ standalone: true }"
                                    [options]="branchOptions"
                                    (ngModelChange)="setRow(i, { branch_oid: $event })"
                                />
                                <fm-select
                                    ariaLabel="Role"
                                    [ngModel]="row.role"
                                    [ngModelOptions]="{ standalone: true }"
                                    [options]="roleOptionsFor(row.branch_oid)"
                                    (ngModelChange)="setRow(i, { role: $event })"
                                />
                                <button
                                    type="button"
                                    aria-label="Remove"
                                    fmButton
                                    iconOnly
                                    variant="ghost"
                                    [disabled]="rows().length === 1"
                                    (click)="removeRow(i)"
                                >
                                    <fm-icon name="trash-2" />
                                </button>
                            </div>
                        }
                        <button class="justify-self-start" type="button" fmButton size="sm" variant="ghost" (click)="addRow()">
                            <fm-icon name="plus" />
                            Add a branch
                        </button>
                        @if (data.list.assignable_roles.hq.includes('OWNER')) {
                            <label class="fm-check-label mt-1 text-sm">
                                <input type="checkbox" fmCheck [checked]="allBranches()" (change)="allBranches.set($any($event.target).checked)" />
                                Every branch, with their HQ role (for owners)
                            </label>
                        }
                    </fieldset>
                }
                @if (problem()) {
                    <fm-alert tone="danger">{{ problem() }}</fm-alert>
                }
            </form>
            <ng-container fmDialogFooter>
                <button type="button" fmButton (click)="ref.close()">Cancel</button>
                <button type="submit" fmButton form="staff-form" variant="primary" [loading]="saving()">{{ isNew ? 'Add' : 'Save' }}</button>
            </ng-container>
        </fm-dialog-shell>
    `
})
export class StaffEditorDialogComponent {
    protected readonly data = inject<StaffEditorData>(DIALOG_DATA);
    protected readonly ref = inject<DialogRef<StaffMember>>(DialogRef);
    private readonly _staff = inject(StaffService);

    protected readonly isNew = !this.data.member;
    protected readonly saving = signal(false);
    protected readonly problem = signal<string | null>(null);

    protected readonly form = inject(NonNullableFormBuilder).group({
        username: ['', this.isNew ? [Validators.required, Validators.pattern(USERNAME)] : []],
        name: [this.data.member?.name ?? '', [Validators.required, Validators.maxLength(100)]],
        email: [this.data.member?.email ?? '', [Validators.email]],
        password: ['', this.isNew ? [Validators.required, Validators.pattern(PASSWORD)] : []]
    });

    private readonly _initialRows: StaffAssignmentInput[] = this.data.member?.assignments.map(a => ({ branch_oid: a.branch_oid, role: a.role })) ?? [];
    protected readonly rows = signal<StaffAssignmentInput[]>(this._initialRows.length ? this._initialRows : [{ branch_oid: '', role: '' as StaffRole }]);
    protected readonly allBranches = signal(this.data.member?.all_branches ?? false);
    private readonly _here = this.data.member?.assignments.find(a => a.branch_oid === this.data.list.branches[0]?.oid)?.role;
    protected readonly branchRole = signal<StaffRole | ''>(this.data.level === 'branch' ? (this._here ?? '') : '');

    protected readonly branchOptions: SelectOption<string>[] = this.data.list.branches.map(b => ({
        value: b.oid,
        label: b.kind === 'HQ' ? 'Head office' : b.name
    }));
    protected readonly branchRoleOptions: SelectOption<StaffRole | ''>[] = this.data.list.assignable_roles.branch.map(r => ({
        value: r,
        label: STAFF_ROLE_LABELS[r]
    }));

    private readonly _assignmentsChanged = computed(
        () => JSON.stringify(this.rows()) !== JSON.stringify(this._initialRows) || this.allBranches() !== (this.data.member?.all_branches ?? false)
    );

    private readonly _kinds = new Map(this.data.list.branches.map(b => [b.oid, b.kind]));
    protected roleOptionsFor(branchOid: string): SelectOption<StaffRole | ''>[] {
        const kind = this._kinds.get(branchOid);
        const roles = kind === 'HQ' ? this.data.list.assignable_roles.hq : kind === 'BRANCH' ? this.data.list.assignable_roles.branch : [];
        return roles.map(r => ({ value: r, label: STAFF_ROLE_LABELS[r] }));
    }

    protected setRow(i: number, patch: Partial<StaffAssignmentInput>): void {
        this.rows.update(list => list.map((r, j) => (j === i ? { ...r, ...patch, ...(patch.branch_oid ? { role: '' as StaffRole } : {}) } : r)));
    }

    protected addRow(): void {
        this.rows.update(list => [...list, { branch_oid: '', role: '' as StaffRole }]);
    }

    protected removeRow(i: number): void {
        this.rows.update(list => list.filter((_, j) => j !== i));
    }

    protected save(): void {
        this.problem.set(null);
        if (this.form.invalid) {
            revealErrors(this.form);
            return;
        }
        const v = this.form.getRawValue();
        const email = v.email.trim() || null;
        const rows = this.rows();
        if (this.data.level === 'hq' && rows.some(r => !r.branch_oid || !r.role)) return this.problem.set('Choose a branch and a role on every line.');
        if (this.data.level === 'branch' && !this.branchRole()) return this.problem.set('Choose a role.');

        const member = this.data.member;
        let request$: Observable<StaffMember>;
        if (!member) {
            const base = { username: v.username.trim().toLowerCase(), name: v.name.trim(), email, password: v.password };
            request$ =
                this.data.level === 'hq'
                    ? this._staff.createAtHq({ ...base, assignments: rows, all_branches: this.allBranches() })
                    : this._staff.createAtBranch({ ...base, role: this.branchRole() as StaffRole });
        } else {
            const profileChanged = v.name.trim() !== member.name || email !== member.email;
            const profile$ = profileChanged ? this._staff.updateProfile(this.data.level, member.oid, { name: v.name.trim(), email }) : of(member);
            request$ = profile$.pipe(
                switchMap(updated => {
                    if (this.data.level === 'hq')
                        return this._assignmentsChanged() ? this._staff.setAssignments(member.oid, rows, this.allBranches()) : of(updated);
                    return this.branchRole() !== this._here ? this._staff.setRoleHere(member.oid, this.branchRole() as StaffRole) : of(updated);
                })
            );
        }
        this.saving.set(true);
        request$.pipe(finalize(() => this.saving.set(false))).subscribe({ next: m => this.ref.close(m), error: ignoreHandledApiError });
    }
}

/** A new temporary password for someone (D-054): they must change it at their next sign-in; every session ends. */
@Component({
    selector: 'app-reset-password-dialog',
    imports: [ReactiveFormsModule, ButtonComponent, DialogShellComponent, DialogFooterDirective, FieldComponent, InputDirective],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <fm-dialog-shell
            description="They are signed out everywhere and must choose their own password at the next sign-in."
            [title]="'Reset password: ' + data.member.name"
        >
            <form id="reset-form" novalidate [formGroup]="form" (ngSubmit)="save()">
                <fm-field hint="At least 8 characters with a letter and a digit. Tell them in person." label="Temporary password" required>
                    <input autocomplete="new-password" fmInput formControlName="password" />
                </fm-field>
            </form>
            <ng-container fmDialogFooter>
                <button type="button" fmButton (click)="ref.close()">Cancel</button>
                <button type="submit" fmButton form="reset-form" variant="primary" [loading]="saving()">Set password</button>
            </ng-container>
        </fm-dialog-shell>
    `
})
export class ResetPasswordDialogComponent {
    protected readonly data = inject<{ level: StaffLevel; member: StaffMember }>(DIALOG_DATA);
    protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
    private readonly _staff = inject(StaffService);
    protected readonly saving = signal(false);
    protected readonly form = inject(NonNullableFormBuilder).group({ password: ['', [Validators.required, Validators.pattern(PASSWORD)]] });

    protected save(): void {
        if (this.form.invalid) {
            revealErrors(this.form);
            return;
        }
        this.saving.set(true);
        this._staff
            .resetPassword(this.data.level, this.data.member.oid, this.form.getRawValue().password)
            .pipe(finalize(() => this.saving.set(false)))
            .subscribe({ next: () => this.ref.close(true), error: ignoreHandledApiError });
    }
}
