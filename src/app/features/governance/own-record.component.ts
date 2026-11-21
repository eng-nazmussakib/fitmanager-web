import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { filter, switchMap } from 'rxjs';

import { LEVEL_LABEL, type OwnSanction, SANCTION_STATE } from '@core/models/governance.model';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogService } from '@shared/ui/dialog/dialog.service';
import { BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';

import { GovernanceService } from './governance.service';
import { type TextPromptData, TextPromptDialogComponent, type TextPromptResult } from './text-prompt-dialog.component';

/**
 * The person's own record (D-094): their sanctions with the reason and the rule, never the notes, witnesses or evidence,
 * and an appeal within 7 days, decided by someone other than the person who gave the step. `portal`: the member portal
 * (`/me/record`); otherwise a staff member's "My record" in the console.
 */
@Component({
    selector: 'app-own-record',
    imports: [AppDatePipe, PageHeaderComponent, ButtonComponent, BadgeComponent, CardComponent, SkeletonComponent, EmptyStateComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (portal()) {
            <h1 class="mb-1 text-xl font-semibold">My record</h1>
            <p class="mb-4 text-sm text-fg-muted">Warnings and other steps the gym has recorded. You can appeal each one within 7 days.</p>
        } @else {
            <app-page-header subtitle="Warnings and other steps recorded about you, at any branch. Appeal within 7 days." title="My record" />
        }
        @if (list.value(); as rows) {
            @if (rows.length) {
                <div class="grid gap-3">
                    @for (s of rows; track s.oid) {
                        <fm-card>
                            <div class="flex flex-wrap items-center gap-2">
                                <span class="font-semibold">{{ level[s.level] }}</span>
                                <fm-badge [tone]="state[s.state].tone">{{ state[s.state].label }}</fm-badge>
                                <span class="text-sm text-fg-muted">{{ s.given_on | appDate: 'd MMM yyyy' }} · {{ s.branch_name }}</span>
                            </div>
                            @if (s.level === 'suspension') {
                                <p class="mt-1 text-sm">
                                    {{ s.starts_on | appDate: 'd MMM' }} to {{ s.ends_on | appDate: 'd MMM yyyy'
                                    }}{{ portal() ? ': no entry at any branch; your plan keeps running.' : ': you cannot sign in on these days.' }}
                                </p>
                            }
                            @if (s.level === 'ban') {
                                <p class="mt-1 text-sm">
                                    {{ s.scope === 'all' ? 'Every branch' : s.branch_name }}{{ s.state === 'lifted' ? ' (lifted)' : '' }}
                                </p>
                            }
                            <p class="mt-2 text-sm">{{ s.reason }}</p>
                            @if (s.clause_label) {
                                <p class="mt-1 text-sm text-fg-muted">Rule: {{ s.clause_label }}</p>
                            }
                            @if (s.appeal; as a) {
                                <div class="mt-3 rounded-lg bg-surface-sunken p-3 text-sm">
                                    <p class="font-medium">
                                        Your appeal:
                                        {{
                                            a.status === 'open'
                                                ? 'waiting for a decision'
                                                : a.status === 'upheld'
                                                  ? 'upheld, the step is overturned'
                                                  : 'not upheld'
                                        }}
                                    </p>
                                    <p class="mt-1 text-fg-muted">{{ a.body }}</p>
                                    @if (a.decision_note) {
                                        <p class="mt-1">{{ a.decision_note }}</p>
                                    }
                                </div>
                            } @else if (s.can_appeal) {
                                <button class="mt-3" fmButton size="sm" (click)="appeal(s)">Appeal (until {{ s.appeal_deadline | appDate: 'd MMM' }})</button>
                            }
                        </fm-card>
                    }
                </div>
            } @else {
                <fm-empty-state description="Nothing has been recorded about you." icon="badge-check" title="A clean record" />
            }
        } @else {
            <fm-skeleton height="10rem" />
        }
    `
})
export class OwnRecordComponent {
    readonly portal = input(false);
    private readonly _service = inject(GovernanceService);
    private readonly _dialog = inject(DialogService);
    protected readonly list = rxResource({ params: () => this.portal(), stream: ({ params }) => this._service.ownRecord(params) });
    protected readonly level = LEVEL_LABEL;
    protected readonly state = SANCTION_STATE;

    protected appeal(s: OwnSanction): void {
        this._dialog
            .open<TextPromptDialogComponent, TextPromptData, TextPromptResult>(TextPromptDialogComponent, {
                data: {
                    title: `Appeal: ${LEVEL_LABEL[s.level].toLowerCase()}`,
                    description: 'Someone other than the person who gave it decides. The step holds until then.',
                    label: 'Why it should be overturned',
                    okText: 'Send the appeal',
                    minLength: 10
                },
                size: 'sm'
            })
            .afterClosed.pipe(
                filter((v): v is TextPromptResult => !!v),
                switchMap(r => this._service.appeal(this.portal(), s.oid, r.text))
            )
            .subscribe(() => this.list.reload());
    }
}
