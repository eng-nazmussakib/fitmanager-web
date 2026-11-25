import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { filter, type Observable, switchMap } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { GIVER_LABEL, INCIDENT_CATEGORY_LABEL, type IncidentDetail, LEVEL_LABEL, type Sanction, SANCTION_STATE } from '@core/models/governance.model';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogService } from '@shared/ui/dialog/dialog.service';
import { AlertComponent, BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { GovernanceService } from './governance.service';
import { SanctionDialogComponent } from './sanction-dialog.component';
import { type TextPromptData, TextPromptDialogComponent, type TextPromptResult } from './text-prompt-dialog.component';

const ROLE_LABEL: Record<string, string> = { BRANCH_MANAGER: 'Branch manager', FRONT_DESK: 'Front desk', TRAINER: 'Trainer' };

/**
 * One case: what happened, the rule, the evidence and the internal notes; the person's strikes in 12
 * months and the suggested step; each step given, with its appeal (decided by someone else; HQ for a ban) and, for a
 * ban, lifting it. The caller's buttons follow what the API says they may do.
 */
@Component({
    selector: 'app-incident-page',
    imports: [
        FormsModule,
        RouterLink,
        AppDatePipe,
        PageHeaderComponent,
        ButtonComponent,
        AlertComponent,
        BadgeComponent,
        CardComponent,
        SkeletonComponent,
        FieldComponent,
        InputDirective,
        IconComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (data.value(); as c) {
            <app-page-header [subtitle]="c.summary" [title]="c.subject.name">
                @if (c.actions.levels.length) {
                    <button fmButton variant="primary" (click)="step(c)">
                        <fm-icon name="shield-alert" />
                        Give a step
                    </button>
                }
                @if (c.actions.can_edit) {
                    <button fmButton (click)="close(c)">{{ c.closed ? 'Reopen' : 'Close the case' }}</button>
                }
            </app-page-header>
            @if (c.hq_only) {
                <fm-alert class="mb-4" title="A case about a branch manager" tone="info">HQ handles it; the branch does not see it.</fm-alert>
            }
            <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <div class="grid gap-4">
                    <fm-card title="What happened">
                        <dl class="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                            <div>
                                <dt class="text-fg-muted">About</dt>
                                <dd>
                                    @if (c.subject.kind === 'member' && c.subject.member_oid && !hq) {
                                        <a [routerLink]="['../../members', c.subject.member_oid]">{{ c.subject.name }}</a>
                                    } @else {
                                        {{ c.subject.name }}
                                    }
                                    <span class="text-fg-muted">
                                        · {{ c.subject.kind === 'member' ? c.subject.code : (role[c.subject.role ?? ''] ?? 'Staff') }}
                                    </span>
                                </dd>
                            </div>
                            <div>
                                <dt class="text-fg-muted">When and where</dt>
                                <dd>{{ c.occurred_at | appDate: 'EEE d MMM yyyy, h:mm a' }} · {{ c.branch.name }}</dd>
                            </div>
                            <div>
                                <dt class="text-fg-muted">Category</dt>
                                <dd>{{ category[c.category] }}</dd>
                            </div>
                            <div>
                                <dt class="text-fg-muted">Recorded by</dt>
                                <dd>{{ c.reported_by_name }}{{ c.reported_role ? ' (' + giver[c.reported_role] + ')' : '' }}</dd>
                            </div>
                            <div class="sm:col-span-2">
                                <dt class="text-fg-muted">Rule broken</dt>
                                <dd>{{ c.clause_label ?? 'None cited' }}</dd>
                            </div>
                        </dl>
                        <p class="mt-3 text-sm leading-relaxed whitespace-pre-line">{{ c.description }}</p>
                    </fm-card>
                    <fm-card subtitle="Never shown to the person." title="Internal">
                        @if (c.actions.can_edit) {
                            <div class="grid gap-3">
                                <fm-field label="Witnesses"><input fmInput maxlength="500" [(ngModel)]="witnesses" /></fm-field>
                                <fm-field label="Notes"><textarea fmInput maxlength="2000" rows="3" [(ngModel)]="notes"></textarea></fm-field>
                                <div><button fmButton size="sm" [loading]="saving()" (click)="saveNotes(c)">Save notes</button></div>
                            </div>
                        } @else {
                            <p class="text-sm">
                                <span class="text-fg-muted">Witnesses:</span>
                                {{ c.witnesses ?? 'None' }}
                            </p>
                            <p class="mt-1 text-sm whitespace-pre-line">
                                <span class="text-fg-muted">Notes:</span>
                                {{ c.internal_notes ?? 'None' }}
                            </p>
                        }
                        <p class="mt-4 mb-2 text-sm font-medium">Evidence</p>
                        @if (c.evidence.length) {
                            <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                @for (f of c.evidence; track f.oid) {
                                    <li>
                                        <a
                                            class="block overflow-hidden rounded-lg border border-border text-sm no-underline hover:border-fg-subtle"
                                            target="_blank"
                                            [href]="f.url"
                                        >
                                            @if (f.content_type.startsWith('image/')) {
                                                <img class="aspect-[4/3] w-full object-cover" alt="" [src]="f.url" />
                                            } @else {
                                                <span class="flex aspect-[4/3] items-center justify-center bg-surface-sunken text-fg-muted">
                                                    <fm-icon name="file-text" size="2rem" />
                                                </span>
                                            }
                                            <span class="block truncate px-2 py-1">{{ f.name }}</span>
                                        </a>
                                    </li>
                                }
                            </ul>
                        } @else {
                            <p class="text-sm text-fg-muted">None.</p>
                        }
                    </fm-card>
                    <fm-card flush title="Steps">
                        @if (c.sanctions.length) {
                            <ol class="divide-y divide-border">
                                @for (s of c.sanctions; track s.oid) {
                                    <li class="px-5 py-4">
                                        <div class="flex flex-wrap items-center gap-2">
                                            <span class="font-semibold">{{ level[s.level] }}</span>
                                            <fm-badge [tone]="state[s.state].tone">{{ state[s.state].label }}</fm-badge>
                                            @if (s.level === 'ban') {
                                                <fm-badge>{{ s.scope === 'all' ? 'Every branch' : s.branch_name }}</fm-badge>
                                            }
                                            @if (s.membership_cancelled) {
                                                <fm-badge tone="warning">Membership cancelled</fm-badge>
                                            }
                                            <span class="flex-1"></span>
                                            @if (s.can_lift) {
                                                <button fmButton size="sm" (click)="lift(s)">Lift the ban</button>
                                            }
                                        </div>
                                        <p class="mt-1 text-sm text-fg-muted">
                                            {{ s.given_on | appDate: 'd MMM yyyy' }} by {{ s.given_by_name }} ({{ giver[s.given_role] }})
                                            @if (s.level === 'suspension') {
                                                · {{ s.starts_on | appDate: 'd MMM' }} to {{ s.ends_on | appDate: 'd MMM yyyy' }}
                                            }
                                        </p>
                                        <p class="mt-1 text-sm">{{ s.reason }}</p>
                                        @if (s.choice_reason) {
                                            <p class="mt-1 text-sm text-fg-muted">
                                                Suggested: {{ level[s.suggested_level].toLowerCase() }}. Chosen because: {{ s.choice_reason }}
                                            </p>
                                        }
                                        @if (s.lifted; as l) {
                                            <p class="mt-1 text-sm text-success">Lifted {{ l.at | appDate: 'd MMM yyyy' }} by {{ l.by }}: {{ l.reason }}</p>
                                        }
                                        @if (s.appeal; as a) {
                                            <div class="mt-3 rounded-lg bg-surface-sunken p-3 text-sm">
                                                <p class="flex flex-wrap items-center gap-2 font-medium">
                                                    Appeal by {{ a.filed_by_name }}, {{ a.filed_at | appDate: 'd MMM' }}
                                                    <fm-badge [tone]="a.status === 'open' ? 'warning' : a.status === 'upheld' ? 'success' : 'neutral'">
                                                        {{ a.status === 'open' ? 'Waiting' : a.status === 'upheld' ? 'Upheld' : 'Rejected' }}
                                                    </fm-badge>
                                                </p>
                                                <p class="mt-1">{{ a.body }}</p>
                                                @if (a.decided_at) {
                                                    <p class="mt-1 text-fg-muted">
                                                        {{ a.decided_by_name }}, {{ a.decided_at | appDate: 'd MMM' }}: {{ a.decision_note }}
                                                    </p>
                                                }
                                                @if (a.can_decide) {
                                                    <button class="mt-2" fmButton size="sm" variant="primary" (click)="decide(a.oid)">Decide the appeal</button>
                                                } @else if (a.status === 'open') {
                                                    <p class="mt-1 text-fg-subtle">
                                                        {{
                                                            s.level === 'ban'
                                                                ? 'HQ decides appeals against a ban.'
                                                                : 'Someone other than the person who gave the step decides.'
                                                        }}
                                                    </p>
                                                }
                                            </div>
                                        }
                                    </li>
                                }
                            </ol>
                        } @else {
                            <p class="px-5 py-4 text-sm text-fg-muted">No step yet.{{ c.actions.levels.length ? '' : ' A branch manager or HQ decides.' }}</p>
                        }
                    </fm-card>
                </div>
                <div class="grid content-start gap-4">
                    <fm-card subtitle="Steps not overturned, at every branch." title="Strikes in 12 months">
                        <p class="text-3xl font-semibold">{{ c.strikes.length }}</p>
                        <p class="mt-1 text-sm">
                            Suggested next step:
                            <strong>{{ level[c.suggestion] }}</strong>
                        </p>
                        @if (c.strikes.length) {
                            <ul class="mt-3 grid gap-1 text-sm text-fg-muted">
                                @for (s of c.strikes; track $index) {
                                    <li>{{ s.starts_on | appDate: 'd MMM yyyy' }} · {{ level[s.level] }} · {{ s.branch_name }}</li>
                                }
                            </ul>
                        }
                    </fm-card>
                    <fm-card title="The ladder">
                        <ol class="grid gap-1 text-sm">
                            <li>1. Verbal warning: the desk, trainers, managers</li>
                            <li>2. Written warning: managers, HQ</li>
                            <li>3. Suspension: managers, HQ</li>
                            <li>4. Ban: managers (their branch), HQ (any branch)</li>
                        </ol>
                        <p class="mt-2 text-xs text-fg-subtle">The person may appeal within 7 days; the step holds meanwhile.</p>
                    </fm-card>
                </div>
            </div>
        } @else if (data.error()) {
            <fm-alert title="Case not found" tone="danger">It may be about you, or handled by HQ.</fm-alert>
        } @else {
            <fm-skeleton height="24rem" />
        }
    `
})
export class IncidentPageComponent {
    readonly id = input.required<string>();
    protected readonly auth = inject(AuthService);
    private readonly _service = inject(GovernanceService);
    private readonly _dialog = inject(DialogService);
    protected readonly hq = this.auth.activeAssignment()?.branch.kind === 'HQ';
    protected readonly data = rxResource({ params: () => this.id(), stream: ({ params }) => this._service.incident(params) });
    protected readonly level = LEVEL_LABEL;
    protected readonly state = SANCTION_STATE;
    protected readonly category = INCIDENT_CATEGORY_LABEL;
    protected readonly giver = GIVER_LABEL;
    protected readonly role = ROLE_LABEL;
    protected witnesses = '';
    protected notes = '';
    protected readonly saving = signal(false);
    private _filled = '';

    constructor() {
        // The editable notes start from the case, once per case loaded.
        effect(() => {
            const c = this.data.value();
            if (c && this._filled !== c.oid) {
                this._filled = c.oid;
                this.witnesses = c.witnesses ?? '';
                this.notes = c.internal_notes ?? '';
            }
        });
    }

    protected step(c: IncidentDetail): void {
        this._dialog
            .open<SanctionDialogComponent, IncidentDetail, IncidentDetail>(SanctionDialogComponent, { data: c })
            .afterClosed.pipe(filter((v): v is IncidentDetail => !!v))
            .subscribe(d => this.data.set(d));
    }

    protected close(c: IncidentDetail): void {
        this._apply(this._service.updateIncident(c.oid, { closed: !c.closed }));
    }

    protected saveNotes(c: IncidentDetail): void {
        this.saving.set(true);
        this._service.updateIncident(c.oid, { witnesses: this.witnesses.trim() || null, internal_notes: this.notes.trim() || null }).subscribe({
            next: d => {
                this.saving.set(false);
                this.data.set(d);
            },
            error: () => this.saving.set(false)
        });
    }

    protected lift(s: Sanction): void {
        this._apply(
            this._prompt({
                title: 'Lift the ban',
                description: 'They may come back from now. A cancelled membership is not restored: sell a new one.',
                label: 'Reason',
                okText: 'Lift the ban',
                minLength: 3
            }).pipe(switchMap(r => this._service.liftBan(s.oid, r.text)))
        );
    }

    protected decide(appealOid: string): void {
        this._apply(
            this._prompt({
                title: 'Decide the appeal',
                description: 'Upheld overturns the step (a cancelled membership is not restored on its own). The person reads your note.',
                label: 'Your decision, in a sentence',
                okText: 'Decide',
                minLength: 3,
                choices: [
                    { value: 'rejected', label: 'Reject' },
                    { value: 'upheld', label: 'Uphold' }
                ]
            }).pipe(switchMap(r => this._service.decideAppeal(appealOid, r.choice as 'upheld' | 'rejected', r.text)))
        );
    }

    private _apply(o: Observable<IncidentDetail>): void {
        o.subscribe(d => this.data.set(d));
    }

    private _prompt(data: TextPromptData): Observable<TextPromptResult> {
        return this._dialog
            .open<TextPromptDialogComponent, TextPromptData, TextPromptResult>(TextPromptDialogComponent, { data, size: 'sm' })
            .afterClosed.pipe(filter((v): v is TextPromptResult => !!v));
    }
}
