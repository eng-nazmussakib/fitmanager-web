import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { type IncidentDetail, LEVEL_LABEL, type SanctionInput, type SanctionLevel } from '@core/models/governance.model';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DIALOG_DATA, DialogRef } from '@shared/ui/dialog/dialog-ref';
import { DialogFooterDirective, DialogShellComponent } from '@shared/ui/dialog/dialog-shell.component';
import { AlertComponent } from '@shared/ui/display/display';
import { DatePickerComponent, todayIso } from '@shared/ui/forms/date-picker.component';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';

import { GovernanceService } from './governance.service';

/**
 * The next step on a case (D-092, D-093): the levels the caller may give, the suggested one first (from the strikes in
 * 12 months), a reason the person will read, a reason for choosing another step, the dates of a suspension and the
 * reach of a ban, with what each does said up front.
 */
@Component({
    selector: 'app-sanction-dialog',
    imports: [FormsModule, ButtonComponent, DialogShellComponent, DialogFooterDirective, AlertComponent, DatePickerComponent, FieldComponent, InputDirective],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <fm-dialog-shell title="Give a step" [description]="'About ' + data.subject.name + '. ' + strikesLine">
            <div class="grid gap-4">
                <div class="flex flex-wrap gap-2" aria-label="Step" role="radiogroup">
                    @for (l of data.actions.levels; track l) {
                        <button
                            type="button"
                            fmButton
                            role="radio"
                            size="sm"
                            [attr.aria-checked]="level() === l"
                            [variant]="level() === l ? 'primary' : 'secondary'"
                            (click)="level.set(l)"
                        >
                            {{ label[l] }}{{ l === data.suggestion ? ' (suggested)' : '' }}
                        </button>
                    }
                </div>
                <p class="text-sm text-fg-muted">{{ effect() }}</p>
                @if (level() === 'suspension') {
                    <div class="grid gap-3 sm:grid-cols-2">
                        <fm-field label="From" required><fm-date-picker [min]="today" [(ngModel)]="startsOn" /></fm-field>
                        <fm-field label="Until (inclusive)" required><fm-date-picker [min]="startsOn ?? today" [(ngModel)]="endsOn" /></fm-field>
                    </div>
                }
                @if (level() === 'ban' && data.actions.ban_scopes.length > 1) {
                    <div class="flex flex-wrap gap-2" aria-label="Where" role="radiogroup">
                        <button
                            type="button"
                            fmButton
                            role="radio"
                            size="sm"
                            [attr.aria-checked]="scope() === 'branch'"
                            [variant]="scope() === 'branch' ? 'primary' : 'secondary'"
                            (click)="scope.set('branch')"
                        >
                            {{ data.branch.name }} only
                        </button>
                        <button
                            type="button"
                            fmButton
                            role="radio"
                            size="sm"
                            [attr.aria-checked]="scope() === 'all'"
                            [variant]="scope() === 'all' ? 'primary' : 'secondary'"
                            (click)="scope.set('all')"
                        >
                            Every branch
                        </button>
                    </div>
                }
                <fm-field hint="The person reads this, with the rule broken." label="Reason" required>
                    <textarea fmInput maxlength="500" rows="2" [(ngModel)]="reason"></textarea>
                </fm-field>
                @if (level() !== data.suggestion) {
                    <fm-field label="Why this step?" required [hint]="'The suggested step is a ' + label[data.suggestion].toLowerCase() + '.'">
                        <input fmInput maxlength="500" [(ngModel)]="choice" />
                    </fm-field>
                }
                @if (problem()) {
                    <fm-alert tone="danger">{{ problem() }}</fm-alert>
                }
            </div>
            <ng-container fmDialogFooter>
                <button fmButton (click)="ref.close()">Cancel</button>
                <button fmButton [loading]="saving()" [variant]="level() === 'ban' || level() === 'suspension' ? 'danger' : 'primary'" (click)="save()">
                    Give {{ label[level()].toLowerCase() }}
                </button>
            </ng-container>
        </fm-dialog-shell>
    `
})
export class SanctionDialogComponent {
    protected readonly data = inject<IncidentDetail>(DIALOG_DATA);
    protected readonly ref = inject<DialogRef<IncidentDetail>>(DialogRef);
    private readonly _service = inject(GovernanceService);
    protected readonly label = LEVEL_LABEL;
    protected readonly today = todayIso();
    protected readonly level = signal<SanctionLevel>(
        this.data.actions.levels.includes(this.data.suggestion) ? this.data.suggestion : this.data.actions.levels[0]
    );
    protected readonly scope = signal<'branch' | 'all'>('branch');
    protected startsOn: string | null = this.today;
    protected endsOn: string | null = null;
    protected reason = '';
    protected choice = '';
    protected readonly saving = signal(false);
    protected readonly problem = signal<string | null>(null);
    protected readonly strikesLine =
        this.data.strikes.length === 0
            ? 'No strikes in the last 12 months.'
            : `${this.data.strikes.length} strike${this.data.strikes.length === 1 ? '' : 's'} in the last 12 months.`;

    protected readonly effect = computed(() => {
        const staff = this.data.subject.kind === 'staff';
        switch (this.level()) {
            case 'verbal':
                return 'Recorded on their file; nothing is blocked.';
            case 'written':
                return 'Recorded on their file; the next case may lead to a suspension.';
            case 'suspension':
                return staff
                    ? 'They cannot sign in on these days; their sessions end now.'
                    : 'No entry at any branch on these days. The membership keeps running: no days are added.';
            case 'ban':
                return staff
                    ? 'The account is deactivated at every branch.'
                    : `No entry at ${this.scope() === 'all' ? 'any branch' : this.data.branch.name}. If it covers their home branch, the membership is cancelled, with no refund on its own.`;
        }
    });

    protected save(): void {
        this.problem.set(null);
        if (this.reason.trim().length < 3) return this.problem.set('Give the reason the person will read.');
        if (this.level() !== this.data.suggestion && this.choice.trim().length < 3)
            return this.problem.set('Say why you chose another step than the suggested one.');
        if (this.level() === 'suspension' && (!this.startsOn || !this.endsOn)) return this.problem.set('Choose the days of the suspension.');
        const body: SanctionInput = {
            level: this.level(),
            reason: this.reason.trim(),
            ...(this.level() !== this.data.suggestion ? { choice_reason: this.choice.trim() } : {}),
            ...(this.level() === 'suspension' ? { starts_on: this.startsOn!, ends_on: this.endsOn! } : {}),
            ...(this.level() === 'ban' ? { scope: this.scope() } : {})
        };
        this.saving.set(true);
        this._service.giveStep(this.data.oid, body).subscribe({ next: d => this.ref.close(d), error: () => this.saving.set(false) });
    }
}
