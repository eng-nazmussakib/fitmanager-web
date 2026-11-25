import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { format, parseISO } from 'date-fns';

import { setText, type Workout } from '@core/models/training.model';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { BadgeComponent } from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

const SOURCE: Record<Workout['source'], string> = { member: 'Logged by the member', trainer: 'Logged by the trainer', desk: 'Logged at the desk' };

/** Logged workouts, newest first: the day, sets, who logged it; edit and delete within 7 days. */
@Component({
    selector: 'app-workout-list',
    imports: [ButtonComponent, BadgeComponent, EmptyStateComponent, IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (workouts().length) {
            <ul class="divide-y divide-border">
                @for (w of workouts(); track w.oid) {
                    <li class="py-3">
                        <div class="flex flex-wrap items-center gap-2">
                            <span class="font-medium">{{ date(w.performed_on) }}</span>
                            @if (w.day_name) {
                                <fm-badge tone="primary">{{ w.day_name }}</fm-badge>
                            } @else {
                                <fm-badge>Free session</fm-badge>
                            }
                            <span class="text-sm text-fg-muted">
                                {{ w.set_count }} sets{{ w.volume_kg ? ' · ' + w.volume_kg.toLocaleString('en-IN') + ' kg lifted' : ''
                                }}{{ w.minutes ? ' · ' + w.minutes + ' min' : '' }}
                            </span>
                            <span class="flex-1"></span>
                            @if (w.editable && canEdit()) {
                                <button fmButton size="sm" variant="ghost" (click)="edit.emit(w)">
                                    <fm-icon name="pencil" size="1rem" />
                                    Edit
                                </button>
                                <button aria-label="Delete workout" fmButton size="sm" variant="ghost" (click)="remove.emit(w)">
                                    <fm-icon name="trash-2" size="1rem" />
                                </button>
                            }
                        </div>
                        <ul class="mt-1.5 grid gap-0.5 text-sm">
                            @for (x of w.exercises; track $index) {
                                <li>
                                    <span class="text-fg">{{ x.name }}</span>
                                    <span class="text-fg-muted tabular-nums">: {{ sets(x) }}</span>
                                </li>
                            }
                        </ul>
                        <p class="mt-1 text-xs text-fg-subtle">
                            {{ source[w.source] }}{{ w.logged_by_name && w.source !== 'member' ? ' (' + w.logged_by_name + ')' : ''
                            }}{{ w.notes ? ' · ' + w.notes : '' }}
                        </p>
                    </li>
                }
            </ul>
        } @else {
            <fm-empty-state description="Workouts appear here once they are logged." icon="dumbbell" title="No workouts yet" />
        }
    `
})
export class WorkoutListComponent {
    readonly workouts = input.required<Workout[]>();
    readonly canEdit = input(false);
    readonly edit = output<Workout>();
    readonly remove = output<Workout>();
    protected readonly source = SOURCE;

    protected date(iso: string): string {
        return format(parseISO(iso), 'EEE d MMM');
    }

    protected sets(x: Workout['exercises'][number]): string {
        return x.sets.map(s => setText(x.measure, s)).join(', ');
    }
}
