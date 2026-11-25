import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';

import { BranchContextService } from '@core/branch/branch-context.service';
import type { StaffMessage, StaffMessageKind } from '@core/models/inbox.model';
import { BellService } from '@core/notifications/bell.service';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';
import { IconComponent } from '@shared/ui/icon/icon.component';
import type { IconName } from '@shared/ui/icon/icons';

const ICONS: Record<StaffMessageKind, IconName> = {
    po_submitted: 'package',
    po_approved: 'package',
    po_rejected: 'package',
    transfer_requested: 'arrow-right-left',
    transfer_sent: 'arrow-right-left',
    transfer_rejected: 'arrow-right-left',
    ticket_urgent: 'wrench',
    complaint_escalated: 'message-square',
    appeal_filed: 'shield-alert'
};

/**
 * `/console/:branch/inbox` and `/hq/inbox` (phase 7b, D-108 b): what needs the reader's action here, newest first.
 * Opening one marks it read and goes to its page; "Mark all read" clears the bell.
 */
@Component({
    selector: 'app-inbox-page',
    imports: [PageHeaderComponent, AppDatePipe, ButtonComponent, CardComponent, SkeletonComponent, EmptyStateComponent, IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-page-header title="Inbox" [subtitle]="subtitle">
            @if (unread()) {
                <button fmButton [loading]="busy()" (click)="readAll()">
                    <fm-icon name="check" />
                    Mark all read
                </button>
            }
        </app-page-header>
        @if (inbox.value(); as box) {
            <fm-card flush>
                <ul class="divide-y divide-border" aria-label="Messages">
                    @for (m of box.items; track m.oid) {
                        <li>
                            <button
                                class="fm-focusable flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-sunken"
                                type="button"
                                (click)="open(m)"
                            >
                                <span
                                    class="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full"
                                    aria-hidden="true"
                                    [class.bg-accent-soft]="!m.read_at"
                                    [class.bg-surface-sunken]="!!m.read_at"
                                    [class.text-accent]="!m.read_at"
                                    [class.text-fg-subtle]="!!m.read_at"
                                >
                                    <fm-icon size="1.125rem" [name]="icons[m.kind]" />
                                </span>
                                <span class="min-w-0 flex-1">
                                    <span class="flex items-center gap-2">
                                        <span class="truncate text-sm" [class.font-medium]="!!m.read_at" [class.font-semibold]="!m.read_at">
                                            @if (!m.read_at) {
                                                <span class="fm-sr-only">Unread:</span>
                                            }
                                            {{ m.subject }}
                                        </span>
                                        @if (!m.read_at) {
                                            <span class="size-2 shrink-0 rounded-full bg-accent" aria-hidden="true"></span>
                                        }
                                    </span>
                                    <span class="mt-0.5 block text-sm text-fg-muted">{{ m.body }}</span>
                                    <span class="mt-1 block text-xs text-fg-subtle">
                                        {{ m.created_at | appDate: 'd MMM yyyy, h:mm a' }}{{ hq ? ' · ' + m.from_branch_name : '' }}
                                    </span>
                                </span>
                                <fm-icon class="mt-2 shrink-0 text-fg-subtle" name="chevron-right" size="1rem" />
                            </button>
                        </li>
                    } @empty {
                        <li class="p-4">
                            <fm-empty-state
                                description="Orders to approve, transfers, urgent tickets, escalated complaints and appeals show here when you can act on them."
                                icon="inbox"
                                title="Nothing waiting"
                            />
                        </li>
                    }
                </ul>
            </fm-card>
            <p class="mt-3 text-xs text-fg-subtle">Read messages are kept for 180 days.</p>
        } @else {
            <fm-card>
                <div class="grid gap-3">
                    @for (i of [1, 2, 3]; track i) {
                        <fm-skeleton height="3rem" />
                    }
                </div>
            </fm-card>
        }
    `
})
export class InboxPageComponent {
    private readonly _bell = inject(BellService);
    private readonly _router = inject(Router);
    private readonly _branch = inject(BranchContextService);

    protected readonly hq = inject(ActivatedRoute).snapshot.data['hq'] === true;
    protected readonly icons = ICONS;
    protected readonly subtitle = this.hq ? 'What the branches send HQ to act on' : 'What needs you at this branch';
    protected readonly busy = signal(false);
    protected readonly inbox = rxResource({ params: () => this._branch.active()?.oid, stream: () => this._bell.inbox() });
    protected readonly unread = computed(() => (this.inbox.hasValue() ? this.inbox.value().unread : 0));

    protected open(m: StaffMessage): void {
        if (!m.read_at) this._bell.markInboxRead([m.oid]).subscribe();
        const base = this.hq ? '/hq' : `/console/${this._branch.active()?.slug ?? ''}`;
        void this._router.navigateByUrl(`${base}/${m.link}`);
    }

    protected readAll(): void {
        this.busy.set(true);
        this._bell.markInboxRead().subscribe({
            next: () => {
                this.busy.set(false);
                this.inbox.reload();
            },
            error: () => this.busy.set(false)
        });
    }
}
