import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';
import { FieldComponent } from '@shared/ui/forms/field.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { GovernanceService } from './governance.service';

/**
 * `/console/:branch/feedback` and `/hq/feedback`: the NPS (promoters minus detractors), the answers with names
 * and comments, each trainer's class and PT averages, and the ratings. A trainer sees their own averages only. Trends
 * and comparisons between branches are in the reports.
 */
@Component({
    selector: 'app-feedback-page',
    imports: [
        FormsModule,
        AppDatePipe,
        PageHeaderComponent,
        CardComponent,
        SkeletonComponent,
        EmptyStateComponent,
        FieldComponent,
        SelectComponent,
        IconComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-page-header title="Feedback" [subtitle]="hq ? 'NPS and ratings from every branch' : 'NPS answers and class and PT ratings'" />
        <fm-field class="mb-4 block w-44" label="Over the last">
            <fm-select [ngModel]="days()" [options]="ranges" (ngModelChange)="days.set($event)" />
        </fm-field>
        @if (report.value(); as r) {
            @if (r.trainer !== undefined) {
                <fm-card subtitle="Only your averages are shown to you; names and comments stay with the managers." title="Your ratings">
                    @if (r.trainer; as t) {
                        <div class="grid gap-4 sm:grid-cols-2">
                            <div>
                                <p class="text-sm text-fg-muted">Classes</p>
                                <p class="mt-1 text-3xl font-semibold">
                                    {{ t.class_avg ?? '–' }}
                                    <span class="text-base text-fg-muted">/ 5</span>
                                </p>
                                <p class="text-sm text-fg-muted">{{ t.class_count }} rating{{ t.class_count === 1 ? '' : 's' }}</p>
                            </div>
                            <div>
                                <p class="text-sm text-fg-muted">PT sessions</p>
                                <p class="mt-1 text-3xl font-semibold">
                                    {{ t.pt_avg ?? '–' }}
                                    <span class="text-base text-fg-muted">/ 5</span>
                                </p>
                                <p class="text-sm text-fg-muted">{{ t.pt_count }} rating{{ t.pt_count === 1 ? '' : 's' }}</p>
                            </div>
                        </div>
                    } @else {
                        <p class="text-sm text-fg-muted">You have no trainer profile at this branch.</p>
                    }
                </fm-card>
            } @else {
                @if (r.nps; as n) {
                    <div class="grid gap-4 sm:grid-cols-4">
                        <fm-card>
                            <p class="text-sm text-fg-muted">NPS</p>
                            <p class="mt-1 text-3xl font-semibold">{{ n.score ?? '–' }}</p>
                            <p class="text-xs text-fg-subtle">
                                {{ n.responses }} answer{{ n.responses === 1 ? '' : 's' }}, {{ n.dismissed }} closed without answering
                            </p>
                        </fm-card>
                        <fm-card>
                            <p class="text-sm text-fg-muted">Promoters (9–10)</p>
                            <p class="mt-1 text-2xl font-semibold text-success">{{ n.promoters }}</p>
                        </fm-card>
                        <fm-card>
                            <p class="text-sm text-fg-muted">Passives (7–8)</p>
                            <p class="mt-1 text-2xl font-semibold">{{ n.passives }}</p>
                        </fm-card>
                        <fm-card>
                            <p class="text-sm text-fg-muted">Detractors (0–6)</p>
                            <p class="mt-1 text-2xl font-semibold text-danger">{{ n.detractors }}</p>
                        </fm-card>
                    </div>
                }
                <div class="mt-4 grid gap-4 xl:grid-cols-2">
                    <fm-card flush title="Trainers">
                        @if (r.trainers?.length) {
                            <table class="w-full text-sm">
                                <thead class="text-left text-fg-muted">
                                    <tr>
                                        <th class="px-5 py-2 font-medium">Trainer</th>
                                        <th class="px-3 py-2 font-medium">Classes</th>
                                        <th class="px-3 py-2 font-medium">PT</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-border">
                                    @for (t of r.trainers; track t.trainer_oid) {
                                        <tr>
                                            <td class="px-5 py-2">{{ t.trainer_name }}</td>
                                            <td class="px-3 py-2 tabular-nums">
                                                {{ t.class_avg ?? '–' }}
                                                <span class="text-fg-subtle">({{ t.class_count }})</span>
                                            </td>
                                            <td class="px-3 py-2 tabular-nums">
                                                {{ t.pt_avg ?? '–' }}
                                                <span class="text-fg-subtle">({{ t.pt_count }})</span>
                                            </td>
                                        </tr>
                                    }
                                </tbody>
                            </table>
                        } @else {
                            <fm-empty-state icon="star" title="No ratings yet" />
                        }
                    </fm-card>
                    <fm-card flush title="NPS answers">
                        @if (r.answers?.length) {
                            <ul class="divide-y divide-border">
                                @for (a of r.answers; track a.oid) {
                                    <li class="flex gap-3 px-5 py-3 text-sm">
                                        <span
                                            class="w-8 shrink-0 text-lg font-semibold tabular-nums"
                                            [class.text-danger]="a.score <= 6"
                                            [class.text-success]="a.score >= 9"
                                        >
                                            {{ a.score }}
                                        </span>
                                        <span class="min-w-0 flex-1">
                                            <span class="block">
                                                {{ a.member_name }}
                                                <span class="text-fg-muted">· {{ a.created_at | appDate: 'd MMM' }}{{ hq ? ' · ' + a.branch_name : '' }}</span>
                                            </span>
                                            @if (a.comment) {
                                                <span class="block text-fg-muted">“{{ a.comment }}”</span>
                                            }
                                        </span>
                                    </li>
                                }
                            </ul>
                        } @else {
                            <fm-empty-state icon="message-square" title="No answers yet" />
                        }
                    </fm-card>
                </div>
                <fm-card class="mt-4 block" flush title="Ratings">
                    @if (r.ratings?.length) {
                        <ul class="divide-y divide-border">
                            @for (x of r.ratings; track x.oid) {
                                <li class="flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm">
                                    <span class="flex shrink-0 gap-0.5 text-warning" [attr.aria-label]="x.score + ' out of 5'">
                                        @for (s of stars; track s) {
                                            <fm-icon name="star" size="0.875rem" [class.opacity-25]="s > x.score" />
                                        }
                                    </span>
                                    <span class="min-w-0 flex-1">
                                        {{ x.label }} · {{ x.trainer_name }} · {{ x.member_name }}
                                        <span class="text-fg-muted">· {{ x.session_at | appDate: 'd MMM, h:mm a' }}</span>
                                        @if (x.comment) {
                                            <span class="block text-fg-muted">“{{ x.comment }}”</span>
                                        }
                                    </span>
                                </li>
                            }
                        </ul>
                    } @else {
                        <fm-empty-state icon="star" title="No ratings yet" />
                    }
                </fm-card>
            }
        } @else {
            <fm-skeleton height="16rem" />
        }
    `
})
export class FeedbackPageComponent {
    private readonly _service = inject(GovernanceService);
    protected readonly hq = inject(ActivatedRoute).snapshot.data['hq'] === true;
    protected readonly ranges: SelectOption<number>[] = [
        { value: 30, label: '30 days' },
        { value: 90, label: '90 days' },
        { value: 365, label: '12 months' }
    ];
    protected readonly days = signal(90);
    protected readonly stars = [1, 2, 3, 4, 5];
    protected readonly report = rxResource({ params: () => this.days(), stream: ({ params }) => this._service.feedback(params) });
}
