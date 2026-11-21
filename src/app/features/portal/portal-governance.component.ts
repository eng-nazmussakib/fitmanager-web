import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { filter, switchMap } from 'rxjs';

import { type Complaint, type MemberPolicy, POLICY_STATE, type PolicyDetail, type Rateable } from '@core/models/governance.model';
import { type ComplaintFormData, ComplaintFormDialogComponent } from '@features/governance/complaint-form-dialog.component';
import { ComplaintThreadComponent } from '@features/governance/complaint-thread.component';
import { GovernanceService } from '@features/governance/governance.service';
import { OwnRecordComponent } from '@features/governance/own-record.component';
import { type TextPromptData, TextPromptDialogComponent, type TextPromptResult } from '@features/governance/text-prompt-dialog.component';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogService } from '@shared/ui/dialog/dialog.service';
import { AlertComponent, BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

/**
 * `/me/policies` (D-090, D-091): each policy, its current wording and where the member stands; a tick accepts the version
 * read. A required one not accepted blocks check-in after the grace period.
 */
@Component({
    selector: 'app-portal-policies',
    imports: [AppDatePipe, ButtonComponent, AlertComponent, BadgeComponent, CardComponent, SkeletonComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <h1 class="mb-1 text-xl font-semibold">Policies</h1>
        <p class="mb-4 text-sm text-fg-muted">The gym's rules and terms. Read and accept the ones marked due.</p>
        @if (list.value(); as rows) {
            @if (dueCount(rows); as n) {
                <fm-alert class="mb-4" tone="warning" [title]="n + ' to accept'">
                    Check-in is blocked once the date shown has passed. You can also sign them on paper at the desk.
                </fm-alert>
            }
            <div class="grid gap-3">
                @for (p of rows; track p.policy_oid) {
                    <fm-card>
                        <div class="flex flex-wrap items-center gap-2">
                            <button
                                class="text-left font-semibold hover:underline"
                                type="button"
                                [attr.aria-expanded]="open()?.oid === p.policy_oid"
                                (click)="read(p)"
                            >
                                {{ p.title }}
                            </button>
                            <fm-badge [tone]="state[p.state].tone">{{ state[p.state].label }}</fm-badge>
                            <span class="text-sm text-fg-muted">v{{ p.current_version }}</span>
                        </div>
                        <p class="mt-1 text-sm text-fg-muted">
                            {{ p.summary }}
                            @if (p.accepted_at) {
                                · You accepted v{{ p.accepted_version }} on {{ p.accepted_at | appDate: 'd MMM yyyy'
                                }}{{ p.method === 'paper' ? ' (on paper)' : '' }}.
                            }
                            @if (p.blocks_on) {
                                · Accept by {{ p.blocks_on | appDate: 'd MMM' }}.
                            }
                        </p>
                        @if (p.change_note) {
                            <p class="mt-1 text-sm">What changed: {{ p.change_note }}</p>
                        }
                        @if (open()?.oid === p.policy_oid) {
                            @if (open(); as d) {
                                <ol class="mt-3 grid gap-2">
                                    @for (c of d.shown.clauses; track c.oid) {
                                        <li class="text-sm">
                                            <span class="font-semibold">§{{ c.number }} {{ c.heading }}.</span>
                                            {{ c.body }}
                                        </li>
                                    }
                                </ol>
                                @if (p.accepted_version !== p.current_version) {
                                    <button class="mt-3" fmButton variant="primary" [loading]="busy() === p.policy_oid" (click)="accept(p)">
                                        I have read and accept v{{ p.current_version }}
                                    </button>
                                }
                            }
                        } @else if (p.state === 'due' || p.state === 'overdue') {
                            <button class="mt-3" fmButton size="sm" (click)="read(p)">Read and accept</button>
                        }
                    </fm-card>
                }
            </div>
        } @else {
            <fm-skeleton height="12rem" />
        }
    `
})
export class PortalPoliciesComponent {
    private readonly _service = inject(GovernanceService);
    protected readonly list = rxResource({ stream: () => this._service.memberPolicies('me') });
    protected readonly open = signal<PolicyDetail | null>(null);
    protected readonly busy = signal<string | null>(null);
    protected readonly state = POLICY_STATE;

    protected dueCount(rows: MemberPolicy[]): number {
        return rows.filter(p => p.state === 'due' || p.state === 'overdue').length;
    }

    protected read(p: MemberPolicy): void {
        if (this.open()?.oid === p.policy_oid) return this.open.set(null);
        this._service.memberPolicyText(p.policy_oid).subscribe(d => this.open.set(d));
    }

    protected accept(p: MemberPolicy): void {
        this.busy.set(p.policy_oid);
        this._service.acceptInPortal(p.current_version_oid).subscribe({
            next: rows => {
                this.busy.set(null);
                this.open.set(null);
                this.list.set(rows);
            },
            error: () => this.busy.set(null)
        });
    }
}

/** `/me/record` (D-094): the member's own sanctions, and appeals. */
@Component({
    selector: 'app-portal-record',
    imports: [OwnRecordComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-own-record [portal]="true" />
    `
})
export class PortalRecordComponent {}

/**
 * `/me/complaints` (D-095): the member's complaints and the replies; a resolution can be accepted (closed) or sent on
 * to HQ within 7 days; after that it closes by itself.
 */
@Component({
    selector: 'app-portal-complaints',
    imports: [
        FormsModule,
        ButtonComponent,
        CardComponent,
        SkeletonComponent,
        EmptyStateComponent,
        FieldComponent,
        InputDirective,
        IconComponent,
        ComplaintThreadComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="mb-4 flex flex-wrap items-center gap-3">
            <h1 class="flex-1 text-xl font-semibold">Complaints</h1>
            <button fmButton variant="primary" (click)="file()">
                <fm-icon name="plus" />
                New complaint
            </button>
        </div>
        @if (list.value(); as rows) {
            @if (rows.length) {
                <div class="grid gap-3">
                    @for (c of rows; track c.oid) {
                        <fm-card>
                            <app-complaint-thread [complaint]="c" />
                            @if (c.status !== 'closed') {
                                <fm-field class="mt-3 block" label="Your reply">
                                    <textarea
                                        fmInput
                                        maxlength="2000"
                                        rows="2"
                                        [ngModel]="drafts[c.oid] ?? ''"
                                        (ngModelChange)="drafts[c.oid] = $event"
                                    ></textarea>
                                </fm-field>
                                <div class="mt-2 flex flex-wrap gap-2">
                                    <button fmButton size="sm" [disabled]="(drafts[c.oid] ?? '').trim().length < 2" (click)="act(c, 'reply')">Reply</button>
                                    @if (c.can_respond) {
                                        <button fmButton size="sm" variant="primary" (click)="act(c, 'accept')">Happy with this: close it</button>
                                        @if (c.escalated?.by !== 'member') {
                                            <button fmButton size="sm" variant="ghost" (click)="escalate(c)">Not happy: send to HQ</button>
                                        }
                                    }
                                </div>
                            }
                        </fm-card>
                    }
                </div>
            } @else {
                <fm-empty-state description="Something not right at the gym? Tell us here." icon="message-square" title="No complaints" />
            }
        } @else {
            <fm-skeleton height="10rem" />
        }
    `
})
export class PortalComplaintsComponent {
    private readonly _service = inject(GovernanceService);
    private readonly _dialog = inject(DialogService);
    protected readonly list = rxResource({ stream: () => this._service.myComplaints() });
    protected readonly drafts: Record<string, string> = {};

    protected act(c: Complaint, action: 'reply' | 'accept'): void {
        this._service.memberComplaintAction(c.oid, action, this.drafts[c.oid]?.trim()).subscribe(() => {
            this.drafts[c.oid] = '';
            this.list.reload();
        });
    }

    protected escalate(c: Complaint): void {
        this._dialog
            .open<TextPromptDialogComponent, TextPromptData, TextPromptResult>(TextPromptDialogComponent, {
                data: {
                    title: 'Send to HQ',
                    description: 'Head office reads it with your reason.',
                    label: 'Why you are not happy',
                    okText: 'Send to HQ',
                    minLength: 3
                },
                size: 'sm'
            })
            .afterClosed.pipe(
                filter((v): v is TextPromptResult => !!v),
                switchMap(r => this._service.memberComplaintAction(c.oid, 'escalate', r.text))
            )
            .subscribe(() => this.list.reload());
    }

    protected file(): void {
        this._dialog
            .open<ComplaintFormDialogComponent, ComplaintFormData, Complaint>(ComplaintFormDialogComponent, { data: { portal: true } })
            .afterClosed.pipe(filter(v => !!v))
            .subscribe(() => this.list.reload());
    }
}

/**
 * The portal home's feedback card (D-096): the 0–10 question after 30 days of membership, at most every 90 days, and
 * the classes and PT sessions of the last 7 days to rate 1–5. Shows nothing when there is nothing to ask.
 */
@Component({
    selector: 'app-portal-feedback-card',
    imports: [FormsModule, RouterLink, AppDatePipe, ButtonComponent, CardComponent, FieldComponent, InputDirective, IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (data.value(); as f) {
            @if (f.nps_due) {
                <fm-card class="mt-4 block" title="How likely are you to recommend us to a friend?">
                    <div class="flex flex-wrap gap-1" aria-label="0 is not at all likely, 10 is extremely likely" role="radiogroup">
                        @for (n of scale; track n) {
                            <button
                                class="w-9"
                                type="button"
                                fmButton
                                role="radio"
                                size="sm"
                                [attr.aria-checked]="score() === n"
                                [variant]="score() === n ? 'primary' : 'secondary'"
                                (click)="score.set(n)"
                            >
                                {{ n }}
                            </button>
                        }
                    </div>
                    <p class="mt-1 flex justify-between text-xs text-fg-subtle">
                        <span>Not at all likely</span>
                        <span>Extremely likely</span>
                    </p>
                    @if (score() !== null) {
                        <fm-field class="mt-3 block" label="Anything to add? (optional)">
                            <textarea fmInput maxlength="1000" rows="2" [(ngModel)]="comment"></textarea>
                        </fm-field>
                    }
                    <div class="mt-3 flex gap-2">
                        <button fmButton size="sm" variant="primary" [disabled]="score() === null" (click)="answer(score())">Send</button>
                        <button fmButton size="sm" variant="ghost" (click)="answer(null)">Not now</button>
                    </div>
                </fm-card>
            }
            @if (f.rateable.length) {
                <fm-card class="mt-4 block" subtitle="Your trainer sees the average, not your name." title="Rate your recent sessions">
                    <ul class="divide-y divide-border">
                        @for (r of f.rateable; track r.booking_oid ?? r.pt_session_oid) {
                            <li class="flex flex-wrap items-center gap-3 py-2 text-sm">
                                <span class="min-w-0 flex-1">
                                    {{ r.label }} · {{ r.trainer_name }}
                                    <span class="block text-fg-muted">
                                        {{ r.at | appDate: 'EEE d MMM, h:mm a' }} · rate by {{ r.until | appDate: 'd MMM' }}
                                    </span>
                                </span>
                                <span class="flex gap-0.5" role="group" [attr.aria-label]="'Rate ' + r.label">
                                    @for (s of stars; track s) {
                                        <button type="button" fmButton iconOnly size="sm" variant="ghost" [attr.aria-label]="s + ' of 5'" (click)="rate(r, s)">
                                            <fm-icon class="text-warning" name="star" size="1.125rem" />
                                        </button>
                                    }
                                </span>
                            </li>
                        }
                    </ul>
                </fm-card>
            }
        }
        <p class="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <a routerLink="policies">Policies</a>
            <a routerLink="record">My record</a>
            <a routerLink="complaints">Complaints</a>
        </p>
    `
})
export class PortalFeedbackCardComponent {
    private readonly _service = inject(GovernanceService);
    protected readonly data = rxResource({ stream: () => this._service.myFeedback() });
    protected readonly scale = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    protected readonly stars = [1, 2, 3, 4, 5];
    protected readonly score = signal<number | null>(null);
    protected comment = '';

    protected answer(score: number | null): void {
        this._service.answerNps(score, this.comment.trim() || null).subscribe(() => this.data.reload());
    }

    protected rate(r: Rateable, score: number): void {
        this._service.rate(r, score, null).subscribe(f => this.data.set(f));
    }
}
