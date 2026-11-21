import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { type Complaint, COMPLAINT_CATEGORY_LABEL, COMPLAINT_STATUS } from '@core/models/governance.model';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { BadgeComponent } from '@shared/ui/display/display';

/** A complaint and its replies, for the consoles and the portal (D-095). */
@Component({
    selector: 'app-complaint-thread',
    imports: [AppDatePipe, BadgeComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @let c = complaint();
        <div class="flex flex-wrap items-center gap-2">
            <fm-badge [tone]="status[c.status].tone">{{ status[c.status].label }}</fm-badge>
            @if (c.overdue) {
                <fm-badge tone="danger">Overdue</fm-badge>
            }
            @if (c.escalated) {
                <fm-badge tone="warning">With HQ{{ c.escalated.by === 'member' ? ' (by the member)' : '' }}</fm-badge>
            }
            @if (c.hq_only) {
                <fm-badge tone="info">HQ only</fm-badge>
            }
            <span class="text-sm text-fg-muted">{{ category[c.category] }} · {{ c.code }} · {{ c.created_at | appDate: 'd MMM yyyy, h:mm a' }}</span>
        </div>
        <p class="mt-3 font-medium">{{ c.subject }}</p>
        <p class="mt-1 text-sm whitespace-pre-line">{{ c.body }}</p>
        @if (c.named_staff_name) {
            <p class="mt-1 text-sm text-fg-muted">About {{ c.named_staff_name }}</p>
        }
        @if (c.photo_url) {
            <a class="mt-2 inline-block" target="_blank" [href]="c.photo_url">
                <img class="max-h-48 rounded-lg" alt="The photo sent with the complaint" [src]="c.photo_url" />
            </a>
        }
        <ol class="mt-4 grid gap-2">
            @for (u of c.updates ?? []; track u.oid) {
                <li
                    class="rounded-lg p-3 text-sm"
                    [class.bg-surface-sunken]="u.author === 'staff'"
                    [class.border-border]="u.author === 'member'"
                    [class.border]="u.author === 'member'"
                >
                    <p class="text-xs text-fg-muted">
                        {{ u.author_name }} · {{ u.at | appDate: 'd MMM, h:mm a' }}{{ u.status ? ' · ' + status[u.status].label : '' }}
                    </p>
                    <p class="mt-1 whitespace-pre-line">{{ u.body }}</p>
                </li>
            }
        </ol>
        @if (c.status === 'resolved' && c.closes_at) {
            <p class="mt-3 text-xs text-fg-subtle">Closes by itself on {{ c.closes_at | appDate: 'd MMM' }} unless the member replies.</p>
        }
    `
})
export class ComplaintThreadComponent {
    readonly complaint = input.required<Complaint>();
    protected readonly status = COMPLAINT_STATUS;
    protected readonly category = COMPLAINT_CATEGORY_LABEL;
}
