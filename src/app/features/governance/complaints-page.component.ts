import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { filter, type Observable } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { type Complaint, COMPLAINT_CATEGORY_LABEL, COMPLAINT_STATUS } from '@core/models/governance.model';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogService } from '@shared/ui/dialog/dialog.service';
import { BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { SwitchComponent } from '@shared/ui/forms/switch.component';
import { IconComponent } from '@shared/ui/icon/icon.component';
import { ToastService } from '@shared/ui/toast/toast.service';

import { type ComplaintFormData, ComplaintFormDialogComponent } from './complaint-form-dialog.component';
import { ComplaintThreadComponent } from './complaint-thread.component';
import { GovernanceService } from './governance.service';
import { type TextPromptData, TextPromptDialogComponent, type TextPromptResult } from './text-prompt-dialog.component';

/**
 * `/console/:branch/complaints` and `/hq/complaints` (D-095): newest first, with the overdue ones (no reply within the
 * HQ setting) and the escalated ones marked. The desk replies and resolves; a manager escalates to HQ; HQ sees every
 * branch's overdue and escalated complaints and the ones about branch managers. One that names the reader is hidden
 * from them.
 */
@Component({
    selector: 'app-complaints-page',
    imports: [
        FormsModule,
        AppDatePipe,
        PageHeaderComponent,
        ButtonComponent,
        BadgeComponent,
        CardComponent,
        SkeletonComponent,
        EmptyStateComponent,
        FieldComponent,
        InputDirective,
        SelectComponent,
        SwitchComponent,
        IconComponent,
        ComplaintThreadComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-page-header
            title="Complaints"
            [subtitle]="hq ? 'Overdue, escalated and HQ-only complaints from every branch' : 'From members in the portal and at the desk'"
        >
            @if (auth.can('create', 'Complaint') && !hq) {
                <button fmButton variant="primary" (click)="file()">
                    <fm-icon name="plus" />
                    File a complaint
                </button>
            }
        </app-page-header>
        <div class="mb-4 flex flex-wrap items-end gap-4">
            <fm-field class="w-44" label="Status"><fm-select [ngModel]="status()" [options]="statuses" (ngModelChange)="status.set($event)" /></fm-field>
            <fm-switch [ngModel]="overdue()" (ngModelChange)="overdue.set($event)">Overdue only</fm-switch>
            <fm-switch [ngModel]="escalated()" (ngModelChange)="escalated.set($event)">With HQ only</fm-switch>
        </div>
        <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            @if (list.value(); as rows) {
                @if (rows.length) {
                    <fm-card flush>
                        <ul class="divide-y divide-border">
                            @for (c of rows; track c.oid) {
                                <li>
                                    <button
                                        class="flex w-full flex-wrap items-center gap-2 px-5 py-3 text-left hover:bg-surface-sunken"
                                        type="button"
                                        [class.bg-accent-soft]="open()?.oid === c.oid"
                                        (click)="show(c.oid)"
                                    >
                                        <span class="min-w-0 flex-1">
                                            <span class="block truncate font-medium">{{ c.subject }}</span>
                                            <span class="block text-sm text-fg-muted">
                                                {{ c.member_name }} · {{ category[c.category] }} · {{ c.created_at | appDate: 'd MMM, h:mm a'
                                                }}{{ hq ? ' · ' + c.branch.name : '' }}
                                            </span>
                                        </span>
                                        @if (c.overdue) {
                                            <fm-badge tone="danger">Overdue</fm-badge>
                                        }
                                        @if (c.escalated) {
                                            <fm-badge tone="warning">With HQ</fm-badge>
                                        }
                                        <fm-badge [tone]="statusOf[c.status].tone">{{ statusOf[c.status].label }}</fm-badge>
                                    </button>
                                </li>
                            }
                        </ul>
                    </fm-card>
                } @else {
                    <fm-empty-state icon="message-square" title="No complaints" />
                }
            } @else {
                <fm-skeleton height="16rem" />
            }
            @if (open(); as c) {
                <fm-card>
                    <app-complaint-thread [complaint]="c" />
                    @if (c.status !== 'closed' && auth.can('update', 'Complaint')) {
                        <fm-field class="mt-4 block" label="Reply to the member">
                            <textarea fmInput maxlength="2000" rows="3" [(ngModel)]="reply"></textarea>
                        </fm-field>
                        <div class="mt-2 flex flex-wrap gap-2">
                            <button fmButton [disabled]="reply.trim().length < 2" [loading]="busy()" (click)="send(c, null)">Reply</button>
                            <button fmButton variant="primary" [disabled]="reply.trim().length < 2" [loading]="busy()" (click)="send(c, 'resolved')">
                                Reply and mark resolved
                            </button>
                            @if (!hq && !c.escalated && auth.can('manage', 'Complaint')) {
                                <button fmButton variant="ghost" (click)="escalate(c)">Send to HQ</button>
                            }
                        </div>
                    }
                </fm-card>
            }
        </div>
    `
})
export class ComplaintsPageComponent {
    protected readonly auth = inject(AuthService);
    private readonly _service = inject(GovernanceService);
    private readonly _dialog = inject(DialogService);
    private readonly _toast = inject(ToastService);
    private readonly _route = inject(ActivatedRoute);
    protected readonly hq = this._route.snapshot.data['hq'] === true;
    protected readonly category = COMPLAINT_CATEGORY_LABEL;
    protected readonly statusOf = COMPLAINT_STATUS;
    protected readonly statuses: SelectOption<string>[] = [
        { value: 'active', label: 'Not closed' },
        { value: '', label: 'All' },
        { value: 'open', label: 'Open' },
        { value: 'in_progress', label: 'In progress' },
        { value: 'resolved', label: 'Resolved' },
        { value: 'closed', label: 'Closed' }
    ];
    protected readonly status = signal('active');
    protected readonly overdue = signal(this._route.snapshot.queryParamMap.get('overdue') === '1');
    protected readonly escalated = signal(false);
    private readonly _filters = computed(() => ({ status: this.status(), overdue: this.overdue(), escalated: this.escalated() }));
    protected readonly list = rxResource({ params: this._filters, stream: ({ params }) => this._service.complaints(params) });
    protected readonly open = signal<Complaint | null>(null);
    protected reply = '';
    protected readonly busy = signal(false);

    protected show(oid: string): void {
        this.reply = '';
        this._service.complaint(oid).subscribe(c => this.open.set(c));
    }

    protected send(c: Complaint, status: 'resolved' | null): void {
        this._done(this._service.replyComplaint(c.oid, this.reply.trim(), status ?? undefined));
    }

    protected escalate(c: Complaint): void {
        this._dialog
            .open<TextPromptDialogComponent, TextPromptData, TextPromptResult>(TextPromptDialogComponent, {
                data: {
                    title: 'Send to HQ',
                    description: 'HQ sees it with your reason and replies to the member.',
                    label: 'Why',
                    okText: 'Send to HQ',
                    minLength: 3
                },
                size: 'sm'
            })
            .afterClosed.pipe(filter((v): v is TextPromptResult => !!v))
            .subscribe(r => this._done(this._service.escalateComplaint(c.oid, r.text)));
    }

    protected file(): void {
        this._dialog
            .open<ComplaintFormDialogComponent, ComplaintFormData, Complaint | { oid: string; sent_to_hq: true }>(ComplaintFormDialogComponent, {
                data: { portal: false }
            })
            .afterClosed.pipe(filter(v => !!v))
            .subscribe(c => {
                if (c && 'sent_to_hq' in c) this._toast.show('It names the branch manager, so HQ handles it.', { tone: 'info', title: 'Sent to HQ' });
                this.list.reload();
            });
    }

    private _done(o: Observable<Complaint>): void {
        this.busy.set(true);
        o.subscribe({
            next: c => {
                this.busy.set(false);
                this.reply = '';
                this.open.set(c);
                this.list.reload();
            },
            error: () => this.busy.set(false)
        });
    }
}
