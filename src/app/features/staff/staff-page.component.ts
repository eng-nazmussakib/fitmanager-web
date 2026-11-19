import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, type Observable, type Subscription, switchMap } from 'rxjs';

import { ignoreHandledApiError } from '@core/http/api-error';
import { STAFF_ROLE_LABELS, type StaffRole } from '@core/models/branch.model';
import type { StaffMember } from '@core/models/staff.model';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { CellDirective, DataTableComponent } from '@shared/ui/data-table/data-table.component';
import type { TableAction, TableActionEvent, TableColumn } from '@shared/ui/data-table/data-table.model';
import { ConfirmService } from '@shared/ui/dialog/confirm.service';
import { DialogService } from '@shared/ui/dialog/dialog.service';
import { BadgeComponent } from '@shared/ui/display/display';
import { FieldComponent, InputDirective, PrefixDirective } from '@shared/ui/forms/field.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { type StaffLevel, StaffService } from './staff.service';
import { ResetPasswordDialogComponent, type StaffEditorData, StaffEditorDialogComponent } from './staff-dialogs.component';

/**
 * `/hq/staff` and `/console/:branch/staff` (phase 1, D-054, D-055). HQ lists every account and edits assignments
 * at any branch; a branch lists the people assigned there. Actions appear only on rows the API marks `manageable`.
 */
@Component({
    selector: 'app-staff-page',
    imports: [
        FormsModule,
        PageHeaderComponent,
        ButtonComponent,
        DataTableComponent,
        CellDirective,
        BadgeComponent,
        FieldComponent,
        InputDirective,
        PrefixDirective,
        SelectComponent,
        IconComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-page-header [subtitle]="subtitle()" [title]="level() === 'hq' ? 'Staff and roles' : 'Staff'">
            @if (canAdd()) {
                <button fmButton variant="primary" (click)="add()">
                    <fm-icon name="user-plus" />
                    Add staff
                </button>
            }
        </app-page-header>

        <div class="mb-4 grid gap-3" [class]="level() === 'hq' ? 'sm:grid-cols-[minmax(0,1fr)_12rem_12rem_10rem]' : 'sm:grid-cols-[minmax(0,1fr)_12rem_10rem]'">
            <fm-field>
                <fm-icon class="text-fg-subtle" name="search" fmPrefix />
                <input
                    type="search"
                    aria-label="Search staff"
                    autocomplete="off"
                    fmInput
                    placeholder="Name, username or email"
                    [ngModel]="text()"
                    (ngModelChange)="text.set($event)"
                />
            </fm-field>
            @if (level() === 'hq') {
                <fm-select ariaLabel="Branch" placeholder="Any branch" [ngModel]="branch()" [options]="branchOptions()" (ngModelChange)="branch.set($event)" />
            }
            <fm-select ariaLabel="Role" placeholder="Any role" [ngModel]="role()" [options]="roleOptions" (ngModelChange)="role.set($event)" />
            <fm-select ariaLabel="Status" placeholder="Any status" [ngModel]="status()" [options]="statusOptions" (ngModelChange)="status.set($event)" />
        </div>

        <fm-data-table
            caption="Staff"
            emptyIcon="users"
            emptyText="Try another search or filter."
            emptyTitle="No staff match"
            [actions]="actions"
            [columns]="columns"
            [loading]="data.isLoading()"
            [paginated]="false"
            [rows]="data.value()?.rows ?? []"
            [total]="data.value()?.rows?.length ?? 0"
            (action)="onAction($event)"
        >
            <ng-template fmCell="name" let-row>
                <span class="block font-medium">{{ row.name }}</span>
                <span class="block text-xs text-fg-subtle">{{ row.username }}{{ row.email ? ' · ' + row.email : '' }}</span>
                @if (row.must_change_password) {
                    <fm-badge class="mt-1" tone="warning">Temporary password</fm-badge>
                }
            </ng-template>
            <ng-template fmCell="assignments" let-row>
                <span class="flex flex-wrap gap-1">
                    @for (a of row.assignments; track a.branch_oid) {
                        <fm-badge [tone]="a.branch_kind === 'HQ' ? 'primary' : 'neutral'">
                            {{ a.branch_kind === 'HQ' ? 'HQ' : a.branch_code }} · {{ roleLabel(a.role) }}
                        </fm-badge>
                    }
                    @if (row.all_branches) {
                        <fm-badge tone="info">Every branch</fm-badge>
                    }
                </span>
            </ng-template>
        </fm-data-table>
    `
})
export class StaffPageComponent {
    private readonly _staff = inject(StaffService);
    private readonly _dialog = inject(DialogService);
    private readonly _confirm = inject(ConfirmService);

    /** From the route's `data`: which console this is. */
    readonly level = input<StaffLevel>('branch');

    protected readonly text = signal('');
    private readonly _q = signal('');
    protected readonly role = signal<StaffRole | ''>('');
    protected readonly status = signal<'Active' | 'Inactive' | ''>('Active');
    protected readonly branch = signal('');

    protected readonly roleOptions: SelectOption<StaffRole | ''>[] = [
        { value: '', label: 'Any role' },
        ...(Object.keys(STAFF_ROLE_LABELS) as StaffRole[]).map(r => ({ value: r, label: STAFF_ROLE_LABELS[r] }))
    ];
    protected readonly statusOptions: SelectOption<'Active' | 'Inactive' | ''>[] = [
        { value: '', label: 'Any status' },
        { value: 'Active', label: 'Active' },
        { value: 'Inactive', label: 'Deactivated' }
    ];
    protected readonly columns: TableColumn<StaffMember>[] = [
        { key: 'name', header: 'Name', type: 'template' },
        { key: 'assignments', header: 'Works at', type: 'template' },
        { key: 'status', header: 'Status', type: 'status', statusTones: { Active: 'success', Inactive: 'danger' } }
    ];
    protected readonly actions: TableAction<StaffMember>[] = [
        { name: 'edit', icon: 'pencil', label: 'Edit', visible: r => r.manageable },
        { name: 'reset', icon: 'lock', label: 'Reset password', visible: r => r.manageable && r.status === 'Active' },
        { name: 'sign-out', icon: 'log-out', label: 'Sign out everywhere', visible: r => r.manageable && r.status === 'Active' },
        { name: 'deactivate', icon: 'ban', label: 'Deactivate', danger: true, visible: r => r.manageable && r.status === 'Active' },
        { name: 'activate', icon: 'circle-play', label: 'Activate', visible: r => r.manageable && r.status === 'Inactive' },
        { name: 'remove', icon: 'trash-2', label: 'Remove from this branch', danger: true, visible: r => r.manageable && this.level() === 'branch' }
    ];

    protected readonly data = rxResource({
        params: () => ({ level: this.level(), q: this._q(), role: this.role(), status: this.status(), branch_oid: this.branch() }),
        stream: ({ params: { level, ...filter } }) => this._staff.list(level, filter)
    });

    protected readonly canAdd = computed(() => {
        const roles = this.data.value()?.assignable_roles;
        return !!roles && (roles.branch.length > 0 || (this.level() === 'hq' && roles.hq.length > 0));
    });
    protected readonly subtitle = computed(() => {
        const n = this.data.value()?.rows.length ?? 0;
        return `${n} ${n === 1 ? 'person' : 'people'}${this.level() === 'hq' ? '' : ' at this branch'}`;
    });
    protected readonly branchOptions = computed<SelectOption<string>[]>(() => [
        { value: '', label: 'Any branch' },
        ...(this.data.value()?.branches ?? []).map(b => ({ value: b.oid, label: b.kind === 'HQ' ? 'Head office' : b.name }))
    ]);

    constructor() {
        toObservable(this.text)
            .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
            .subscribe(t => this._q.set(t.trim()));
    }

    protected roleLabel(role: StaffRole): string {
        return STAFF_ROLE_LABELS[role];
    }

    protected add(): void {
        this._edit(undefined);
    }

    protected onAction({ action, row }: TableActionEvent<StaffMember>): void {
        const level = this.level();
        const run = (request$: Observable<unknown>): Subscription => request$.subscribe({ next: () => this.data.reload(), error: ignoreHandledApiError });
        if (action === 'edit') this._edit(row);
        else if (action === 'reset')
            this._dialog
                .open(ResetPasswordDialogComponent, { data: { level, member: row }, size: 'sm' })
                .afterClosed.subscribe(done => done && this.data.reload());
        else if (action === 'sign-out')
            run(this._confirm.ask(`Sign ${row.name} out on every device?`, { okText: 'Sign out' }).pipe(switchMap(() => this._staff.signOut(level, row.oid))));
        else if (action === 'deactivate')
            run(
                this._confirm
                    .ask(`Deactivate ${row.name}? They are signed out and cannot sign in until activated again.`, { danger: true, okText: 'Deactivate' })
                    .pipe(switchMap(() => this._staff.setActive(level, row.oid, false)))
            );
        else if (action === 'activate') run(this._staff.setActive(level, row.oid, true));
        else if (action === 'remove')
            run(
                this._confirm
                    .ask(`Remove ${row.name} from this branch? Their account stays; HQ can assign them elsewhere.`, { danger: true, okText: 'Remove' })
                    .pipe(switchMap(() => this._staff.removeHere(row.oid)))
            );
    }

    private _edit(member: StaffMember | undefined): void {
        const list = this.data.value();
        if (!list) return;
        this._dialog
            .open<StaffEditorDialogComponent, StaffEditorData, StaffMember>(StaffEditorDialogComponent, { data: { level: this.level(), member, list } })
            .afterClosed.subscribe(saved => saved && this.data.reload());
    }
}
