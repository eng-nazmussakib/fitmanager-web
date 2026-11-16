import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';

import type { ClassSession } from '@core/models/class.model';
import { formatDate } from '@core/utils/date.utils';

import { PublicContentService } from '../public-content.service';

/** The week's classes at a branch, a column per day (Saturday first). Loaded in the browser (it changes weekly). */
@Component({
    selector: 'app-class-timetable',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (days(); as days) {
            @if (days.length) {
                <ol class="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
                    @for (d of days; track d.date) {
                        <li class="rounded-lg bg-ink-800 p-3">
                            <p class="text-sm font-semibold text-primary-400">{{ d.label }}</p>
                            <ul class="mt-2 flex flex-col gap-2">
                                @for (s of d.sessions; track s.oid) {
                                    <li class="rounded-md bg-ink-700 px-2.5 py-2 text-sm">
                                        <span class="block font-medium">{{ s.title }}{{ s.ladies_only ? ' (ladies)' : '' }}</span>
                                        <span class="block text-xs text-white/60">{{ time(s.starts_at) }} · {{ s.trainer_name }}</span>
                                    </li>
                                }
                            </ul>
                        </li>
                    }
                </ol>
            } @else {
                <p class="text-white/60">No classes are scheduled this week.</p>
            }
        } @else {
            <p class="text-white/60">Ask the front desk for this week's timetable.</p>
        }
    `
})
export class ClassTimetableComponent {
    private readonly _content = inject(PublicContentService);

    readonly branchSlug = input.required<string>();

    private readonly _week = toSignal(toObservable(this.branchSlug).pipe(switchMap(s => this._content.classes(s))));

    protected readonly days = computed(() => {
        const w = this._week();
        if (w === undefined || w === null) return null;
        const map = new Map<string, ClassSession[]>();
        for (const s of w.sessions) (map.get(s.starts_at.slice(0, 10)) ?? map.set(s.starts_at.slice(0, 10), []).get(s.starts_at.slice(0, 10))!).push(s);
        return [...map].map(([date, sessions]) => ({ date, label: formatDate(`${date}T12:00:00+06:00`, 'EEE d MMM'), sessions }));
    });

    protected time(iso: string): string {
        return formatDate(iso, 'h:mm a');
    }
}
