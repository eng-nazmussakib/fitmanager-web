import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { tap } from 'rxjs';

import type { MemberNotification, MemberNotificationKind } from '@core/models/member.model';
import { BellService } from '@core/notifications/bell.service';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';
import { IconComponent } from '@shared/ui/icon/icon.component';
import type { IconName } from '@shared/ui/icon/icons';

const ICONS: Record<MemberNotificationKind, IconName> = {
    receipt: 'receipt',
    shop_receipt: 'store',
    expiry_7d: 'calendar',
    expiry_1d: 'calendar',
    welcome: 'sparkles',
    class_cancelled: 'calendar-off',
    waitlist_promoted: 'calendar-plus',
    pt_booked: 'users-round',
    pt_cancelled: 'users-round',
    complaint_reply: 'message-square',
    sanction: 'shield-alert',
    appeal_decided: 'shield-check',
    policy_to_accept: 'book-open'
};

/**
 * `/me/messages`: the member's messages, newest first. Opening the page marks them read (the ones
 * new at that moment keep a "New" mark until the next visit).
 */
@Component({
    selector: 'app-portal-messages',
    imports: [AppDatePipe, BadgeComponent, CardComponent, SkeletonComponent, EmptyStateComponent, IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <h1 class="mb-1 text-xl font-semibold">Messages</h1>
        <p class="mb-4 text-sm text-fg-muted">Receipts, reminders and news about your classes, complaints and record.</p>

        @if (list.value(); as rows) {
            <fm-card flush>
                <ul class="divide-y divide-border" aria-label="Messages">
                    @for (n of rows; track n.oid) {
                        <li class="flex items-start gap-3 px-4 py-3">
                            <span class="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-surface-sunken text-fg-muted" aria-hidden="true">
                                <fm-icon size="1.125rem" [name]="icons[n.kind]" />
                            </span>
                            <div class="min-w-0 flex-1">
                                <p class="flex flex-wrap items-center gap-2 text-sm font-medium">
                                    {{ n.subject }}
                                    @if (fresh().has(n.oid)) {
                                        <fm-badge tone="info">New</fm-badge>
                                    }
                                </p>
                                <p class="mt-0.5 text-sm text-fg-muted">{{ n.body }}</p>
                                <p class="mt-1 text-xs text-fg-subtle">{{ n.created_at | appDate: 'd MMM yyyy, h:mm a' }}</p>
                            </div>
                        </li>
                    } @empty {
                        <li class="p-4"><fm-empty-state icon="mail" title="No messages yet" /></li>
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
export class PortalMessagesComponent {
    private readonly _bell = inject(BellService);
    protected readonly icons = ICONS;
    /** The messages that were unread when the page opened. */
    protected readonly fresh = signal(new Set<string>());

    protected readonly list = rxResource({
        stream: () =>
            this._bell.memberMessages().pipe(
                tap((rows: MemberNotification[]) => {
                    const unread = rows.filter(r => !r.read_at).map(r => r.oid);
                    this.fresh.set(new Set(unread));
                    if (unread.length) this._bell.markMemberRead().subscribe();
                })
            )
    });
}
