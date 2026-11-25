import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import type { Observable } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import type { Member } from '@core/models/member.model';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogComponent } from '@shared/ui/dialog/dialog.component';
import { DialogFooterDirective } from '@shared/ui/dialog/dialog-shell.component';
import { AlertComponent, CardComponent } from '@shared/ui/display/display';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { IconComponent } from '@shared/ui/icon/icon.component';
import { ToastService } from '@shared/ui/toast/toast.service';

import { ConsoleService } from '../console.service';

type Action = 'transfer' | 'anonymise' | 'portal' | null;

/**
 * The member actions that are not about money: portal access with a temporary password (the desk),
 * move the home branch, and "delete my data" (a manager: `manage Member`). Each opens a
 * dialog; the API decides and audits.
 */
@Component({
    selector: 'app-member-manage',
    imports: [
        FormsModule,
        ButtonComponent,
        AlertComponent,
        CardComponent,
        DialogComponent,
        DialogFooterDirective,
        FieldComponent,
        InputDirective,
        SelectComponent,
        IconComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (!member().anonymised) {
            <fm-card subtitle="Portal access, transfer and personal data. Suspensions and bans are steps on a case (Discipline)." title="Manage">
                <div class="flex flex-wrap gap-2">
                    @if (canEdit && member().status !== 'Pending') {
                        <button fmButton size="sm" (click)="open('portal')">
                            <fm-icon name="key-round" size="1rem" />
                            Portal access
                        </button>
                    }
                    @if (canManage) {
                        <button fmButton size="sm" (click)="open('transfer')">
                            <fm-icon name="arrow-right-left" size="1rem" />
                            Move to another branch
                        </button>
                        <button fmButton size="sm" variant="danger" (click)="open('anonymise')">
                            <fm-icon name="user-x" size="1rem" />
                            Delete personal data
                        </button>
                    }
                </div>
            </fm-card>
        }

        <fm-dialog
            description="The home branch moves; a running plan carries on and its money stays where it was sold. Dues must be cleared first."
            size="sm"
            title="Move to another branch"
            [open]="action() === 'transfer'"
            (openChange)="!$event && close()"
        >
            <div class="grid gap-4">
                <fm-field label="New home branch" required>
                    <fm-select ariaLabel="New home branch" placeholder="Choose a branch" [options]="targets()" [(ngModel)]="target" />
                </fm-field>
                <fm-field label="Reason" required>
                    <input fmInput placeholder="e.g. Moved house" [(ngModel)]="reason" />
                </fm-field>
            </div>
            <ng-container fmDialogFooter>
                <button fmButton (click)="close()">Cancel</button>
                <button fmButton variant="primary" [disabled]="!target || reason.trim().length < 3" [loading]="busy()" (click)="transfer()">Move</button>
            </ng-container>
        </fm-dialog>

        <fm-dialog size="sm" title="Delete personal data" [open]="action() === 'anonymise'" (openChange)="!$event && close()">
            <fm-alert class="mb-4 block" title="This cannot be undone" tone="danger">
                The name, phone, email, address, photo, documents and health details are removed, and the portal account closes. Invoices, payments and visits
                stay under the member code.
            </fm-alert>
            <fm-field required [label]="'Type ' + member().code + ' to confirm'">
                <input autocomplete="off" fmInput [(ngModel)]="confirm" />
            </fm-field>
            <ng-container fmDialogFooter>
                <button fmButton (click)="close()">Cancel</button>
                <button fmButton variant="danger" [disabled]="confirm.trim().toUpperCase() !== member().code" [loading]="busy()" (click)="anonymise()">
                    Delete personal data
                </button>
            </ng-container>
        </fm-dialog>

        <fm-dialog
            size="sm"
            title="Portal access"
            [description]="'Username: ' + member().code + '. The member must choose their own password at the first sign-in.'"
            [open]="action() === 'portal'"
            (openChange)="!$event && close()"
        >
            <fm-field hint="At least 8 characters, with a letter and a digit. Tell it to the member in person." label="Temporary password" required>
                <input autocomplete="new-password" fmInput [(ngModel)]="password" />
            </fm-field>
            <ng-container fmDialogFooter>
                <button fmButton (click)="close()">Cancel</button>
                <button fmButton variant="primary" [disabled]="!strong()" [loading]="busy()" (click)="portal()">Save</button>
            </ng-container>
        </fm-dialog>
    `
})
export class MemberManageComponent {
    private readonly _service = inject(ConsoleService);
    private readonly _toast = inject(ToastService);
    private readonly _router = inject(Router);
    private readonly _route = inject(ActivatedRoute);
    private readonly _auth = inject(AuthService);

    readonly member = input.required<Member>();
    /** Something changed: the profile reloads. */
    readonly changed = output<void>();

    protected readonly canManage = this._auth.can('manage', 'Member');
    protected readonly canEdit = this._auth.can('update', 'Member');
    protected readonly action = signal<Action>(null);
    protected readonly busy = signal(false);
    protected reason = '';
    protected target: string | null = null;
    protected confirm = '';
    protected password = '';

    private readonly _branches = rxResource({ stream: () => this._service.branchOptions() });
    protected readonly targets = computed<SelectOption<string>[]>(() =>
        (this._branches.value() ?? []).filter(b => b.oid !== this.member().branch.oid).map(b => ({ value: b.oid, label: b.name }))
    );

    protected strong(): boolean {
        return this.password.length >= 8 && /\p{L}/u.test(this.password) && /\d/.test(this.password);
    }

    protected open(a: Action): void {
        this.reason = '';
        this.confirm = '';
        this.password = '';
        this.target = null;
        this.action.set(a);
    }

    protected close(): void {
        this.action.set(null);
    }

    protected transfer(): void {
        if (!this.target) return;
        this._run(
            this._service.transfer(this.member().oid, { to_branch_oid: this.target, reason: this.reason.trim() }),
            'Member moved',
            () => void this._router.navigate(['..'], { relativeTo: this._route })
        );
    }

    protected anonymise(): void {
        this._run(this._service.anonymise(this.member().oid, this.member().code), 'Personal data removed');
    }

    protected portal(): void {
        this._run(this._service.portalAccess(this.member().oid, this.password), `Portal access saved. Username: ${this.member().code}`);
    }

    private _run(call: Observable<unknown>, message: string, after?: () => void): void {
        this.busy.set(true);
        call.subscribe({
            next: () => {
                this.busy.set(false);
                this.close();
                this._toast.success(message);
                if (after) after();
                else this.changed.emit();
            },
            error: () => this.busy.set(false)
        });
    }
}
