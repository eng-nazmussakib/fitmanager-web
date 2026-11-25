import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import type { ClauseInput, Policy, PolicyMode } from '@core/models/governance.model';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DIALOG_DATA, DialogRef } from '@shared/ui/dialog/dialog-ref';
import { DialogFooterDirective, DialogShellComponent } from '@shared/ui/dialog/dialog-shell.component';
import { AlertComponent } from '@shared/ui/display/display';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { SwitchComponent } from '@shared/ui/forms/switch.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { GovernanceService } from './governance.service';

/** A new policy (`policy` null), or the next version of one. */
export interface PolicyEditorData {
    policy: Policy | null;
}

/**
 * HQ's policy editor: a new policy with its first version, or the next version of one, its clauses numbered in
 * order. A new version is "accept again" (every member must accept it, after the grace period) or "wording only"
 * (no new acceptance). Published versions are never edited.
 */
@Component({
    selector: 'app-policy-editor-dialog',
    imports: [
        FormsModule,
        ButtonComponent,
        DialogShellComponent,
        DialogFooterDirective,
        AlertComponent,
        FieldComponent,
        InputDirective,
        SwitchComponent,
        IconComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <fm-dialog-shell
            [description]="data.policy ? 'Published today. Members read the new wording at once.' : 'Published today as version 1.'"
            [title]="data.policy ? 'New version of ' + data.policy.title : 'New policy'"
        >
            <div class="grid gap-4">
                @if (!data.policy) {
                    <div class="grid gap-3 sm:grid-cols-2">
                        <fm-field label="Title" required><input fmInput maxlength="80" [(ngModel)]="title" /></fm-field>
                        <fm-field hint="Its address: /policies/locker-rules" label="Web address" required>
                            <input fmInput maxlength="60" placeholder="locker-rules" [(ngModel)]="slug" />
                        </fm-field>
                    </div>
                    <fm-field label="Summary"><input fmInput maxlength="300" [(ngModel)]="summary" /></fm-field>
                    <div class="flex flex-wrap gap-6">
                        <fm-switch [(ngModel)]="required">Members must accept it</fm-switch>
                        <fm-switch [(ngModel)]="isPublic">Show it on the website</fm-switch>
                    </div>
                } @else {
                    <div class="flex flex-wrap gap-2" aria-label="Kind of change" role="radiogroup">
                        <button
                            type="button"
                            fmButton
                            role="radio"
                            size="sm"
                            [attr.aria-checked]="mode() === 'accept_again'"
                            [variant]="mode() === 'accept_again' ? 'primary' : 'secondary'"
                            (click)="mode.set('accept_again')"
                        >
                            Accept again
                        </button>
                        <button
                            type="button"
                            fmButton
                            role="radio"
                            size="sm"
                            [attr.aria-checked]="mode() === 'wording_only'"
                            [variant]="mode() === 'wording_only' ? 'primary' : 'secondary'"
                            (click)="mode.set('wording_only')"
                        >
                            Wording only
                        </button>
                    </div>
                    <p class="text-sm text-fg-muted">
                        {{
                            mode() === 'accept_again'
                                ? 'Every member must accept it. Check-in is blocked for those who have not after the grace period.'
                                : 'A clearer wording with the same rules: no member has to accept it again.'
                        }}
                    </p>
                    <fm-field hint="Shown to members asked to accept again." label="What changed">
                        <input fmInput maxlength="500" [(ngModel)]="note" />
                    </fm-field>
                }
                <div>
                    <p class="mb-2 text-sm font-medium">Clauses</p>
                    <ol class="grid gap-3">
                        @for (c of clauses(); track $index; let i = $index) {
                            <li class="grid gap-2 rounded-lg border border-border p-3">
                                <div class="flex items-center gap-2">
                                    <span class="w-8 shrink-0 text-sm font-semibold">§{{ i + 1 }}</span>
                                    <input
                                        class="flex-1"
                                        fmInput
                                        maxlength="120"
                                        placeholder="Heading"
                                        [attr.aria-label]="'Heading of clause ' + (i + 1)"
                                        [(ngModel)]="c.heading"
                                    />
                                    <button
                                        aria-label="Remove the clause"
                                        fmButton
                                        iconOnly
                                        size="sm"
                                        variant="ghost"
                                        [disabled]="clauses().length === 1"
                                        (click)="remove(i)"
                                    >
                                        <fm-icon name="trash-2" size="1rem" />
                                    </button>
                                </div>
                                <textarea fmInput maxlength="2000" rows="2" [attr.aria-label]="'Text of clause ' + (i + 1)" [(ngModel)]="c.body"></textarea>
                            </li>
                        }
                    </ol>
                    <button class="mt-2" fmButton size="sm" variant="ghost" (click)="add()">
                        <fm-icon name="plus" size="1rem" />
                        Add a clause
                    </button>
                </div>
                @if (problem()) {
                    <fm-alert tone="danger">{{ problem() }}</fm-alert>
                }
            </div>
            <ng-container fmDialogFooter>
                <button fmButton (click)="ref.close()">Cancel</button>
                <button fmButton variant="primary" [loading]="saving()" (click)="save()">Publish</button>
            </ng-container>
        </fm-dialog-shell>
    `
})
export class PolicyEditorDialogComponent {
    protected readonly data = inject<PolicyEditorData>(DIALOG_DATA);
    protected readonly ref = inject<DialogRef<Policy>>(DialogRef);
    private readonly _service = inject(GovernanceService);
    protected title = '';
    protected slug = '';
    protected summary = '';
    protected required = true;
    protected isPublic = true;
    protected note = '';
    protected readonly mode = signal<PolicyMode>('accept_again');
    protected readonly clauses = signal<{ heading: string; body: string }[]>(
        this.data.policy?.current.clauses.map(c => ({ heading: c.heading, body: c.body })) ?? [{ heading: '', body: '' }]
    );
    protected readonly saving = signal(false);
    protected readonly problem = signal<string | null>(null);

    protected add(): void {
        this.clauses.update(list => [...list, { heading: '', body: '' }]);
    }

    protected remove(i: number): void {
        this.clauses.update(list => list.filter((_, j) => j !== i));
    }

    protected save(): void {
        this.problem.set(null);
        const clauses: ClauseInput[] = this.clauses().map(c => ({ heading: c.heading.trim(), body: c.body.trim() }));
        if (clauses.some(c => c.heading.length < 2 || c.body.length < 2)) return this.problem.set('Each clause needs a heading and its text.');
        const p = this.data.policy;
        if (!p && (this.title.trim().length < 3 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(this.slug.trim())))
            return this.problem.set('Give a title, and a web address of lower-case words joined by dashes.');
        this.saving.set(true);
        const call = p
            ? this._service.publishVersion(p.oid, { mode: this.mode(), change_note: this.note.trim() || null, clauses })
            : this._service.createPolicy({
                  slug: this.slug.trim(),
                  title: this.title.trim(),
                  summary: this.summary.trim() || null,
                  required: this.required,
                  public: this.isPublic,
                  clauses
              });
        call.subscribe({ next: r => this.ref.close(r), error: () => this.saving.set(false) });
    }
}
