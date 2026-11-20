import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { type Routine, targetText } from '@core/models/training.model';
import { BadgeComponent } from '@shared/ui/display/display';

/** A routine's days and their exercises with targets; a running copy marks the day to do next (D-087). */
@Component({
    selector: 'app-routine-view',
    imports: [BadgeComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <ol class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            @for (day of routine().days; track $index; let i = $index) {
                <li class="rounded-lg border p-3" [class.border-border]="i !== routine().next_day" [class.border-primary-500]="i === routine().next_day">
                    <p class="mb-2 flex items-center gap-2 font-medium">
                        {{ day.name }}
                        @if (i === routine().next_day) {
                            <fm-badge tone="primary">Next</fm-badge>
                        }
                    </p>
                    <ul class="grid gap-1.5 text-sm">
                        @for (x of day.exercises; track $index) {
                            <li class="flex items-baseline justify-between gap-3">
                                <span class="min-w-0 truncate">{{ x.name }}</span>
                                <span class="shrink-0 text-fg-muted tabular-nums">{{ target(x) }}</span>
                            </li>
                            @if (x.notes) {
                                <li class="-mt-1 text-xs text-fg-subtle">{{ x.notes }}</li>
                            }
                        }
                    </ul>
                </li>
            }
        </ol>
    `
})
export class RoutineViewComponent {
    readonly routine = input.required<Routine>();
    protected readonly target = targetText;
}
