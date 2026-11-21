import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { addDays, format, parseISO } from 'date-fns';

import { CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { todayIso } from '@shared/ui/forms/date-picker.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';

import { ReportViewComponent } from './report-view.component';
import { ReportsService } from './reports.service';

/**
 * A trainer's numbers on their profile (D-106, item 8): PT sessions done, no-shows and cancellations, classes
 * taught and their attendees, and members' ratings, over the last 30 or 90 days. Counts only, no commission. The
 * page shows it to the trainer on their own profile and to managers and HQ on any (the API checks the same).
 */
@Component({
    selector: 'app-trainer-numbers',
    imports: [FormsModule, CardComponent, SkeletonComponent, SelectComponent, ReportViewComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <fm-card subtitle="PT and classes at this branch. Counts only: pay is not worked out here." title="Numbers">
            <div class="mb-4 w-48">
                <fm-select ariaLabel="Period" [ngModel]="days()" [options]="periods" (ngModelChange)="days.set($event)" />
            </div>
            @if (data.hasValue() && !data.isLoading()) {
                <app-report-view [exportable]="false" [report]="data.value()" />
            } @else {
                <fm-skeleton height="10rem" />
            }
        </fm-card>
    `
})
export class TrainerNumbersComponent {
    private readonly _reports = inject(ReportsService);

    readonly trainerOid = input.required<string>();

    protected readonly periods: SelectOption<number>[] = [
        { value: 30, label: 'Last 30 days' },
        { value: 90, label: 'Last 90 days' }
    ];
    protected readonly days = signal(30);
    private readonly _window = computed(() => {
        const today = todayIso();
        return { from: format(addDays(parseISO(today), -(this.days() - 1)), 'yyyy-MM-dd'), to: today };
    });
    protected readonly data = rxResource({
        params: () => ({ oid: this.trainerOid(), ...this._window() }),
        stream: ({ params }) => this._reports.trainerNumbers(params.oid, params.from, params.to)
    });
}
