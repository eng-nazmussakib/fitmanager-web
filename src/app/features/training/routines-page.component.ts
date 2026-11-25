import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { filter, switchMap } from 'rxjs';

import { AuthService } from '@core/auth/auth.service';
import { GOAL_LABEL, LEVEL_LABEL, type Routine, type RoutineInput } from '@core/models/training.model';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogService } from '@shared/ui/dialog/dialog.service';
import { BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';
import { SwitchComponent } from '@shared/ui/forms/switch.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { type RoutineBuilderData, RoutineBuilderDialogComponent } from './routine-builder-dialog.component';
import { RoutineViewComponent } from './routine-view.component';
import { TrainingService } from './training.service';

/**
 * `/routines` (branch) and `/hq/routines` (HQ): routine templates. HQ's are read by every branch (and members
 * may start them in the portal); a branch builds its own. Assigning one gives the member a copy (the member profile).
 */
@Component({
    selector: 'app-routines-page',
    imports: [
        FormsModule,
        PageHeaderComponent,
        ButtonComponent,
        BadgeComponent,
        CardComponent,
        SkeletonComponent,
        EmptyStateComponent,
        SwitchComponent,
        IconComponent,
        RoutineViewComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-page-header
            title="Routines"
            [subtitle]="hq ? 'Templates every branch can assign, and members can start themselves' : 'HQ’s templates and this branch’s own'"
        >
            @if (auth.can('create', 'Routine')) {
                <button fmButton variant="primary" (click)="build(null)">
                    <fm-icon name="plus" />
                    Build a template
                </button>
            }
        </app-page-header>
        @if (auth.can('update', 'Routine')) {
            <fm-switch class="mb-3 block" [ngModel]="showAll()" (ngModelChange)="showAll.set($event)">Show templates not offered</fm-switch>
        }
        @if (list.value(); as rows) {
            @if (rows.length) {
                <div class="grid gap-3">
                    @for (r of rows; track r.oid) {
                        <fm-card>
                            <div class="flex flex-wrap items-center gap-2">
                                <button
                                    class="text-left text-lg font-semibold hover:underline"
                                    type="button"
                                    [attr.aria-expanded]="open() === r.oid"
                                    (click)="toggle(r.oid)"
                                >
                                    {{ r.name }}
                                </button>
                                <fm-badge [tone]="r.scope === 'hq' ? 'neutral' : 'info'">{{ r.scope === 'hq' ? 'HQ' : 'This branch' }}</fm-badge>
                                @if (!r.active) {
                                    <fm-badge tone="warning">Not offered</fm-badge>
                                }
                                <span class="text-sm text-fg-muted">
                                    {{ goal[r.goal] }} · {{ level[r.level] }} · {{ r.days.length }} days · {{ r.exercise_count }} exercises{{
                                        r.trainer_name ? ' · by ' + r.trainer_name : ''
                                    }}
                                </span>
                                <span class="flex-1"></span>
                                @if (r.editable && auth.can('update', 'Routine')) {
                                    <button fmButton size="sm" variant="ghost" (click)="build(r)">
                                        <fm-icon name="pencil" size="1rem" />
                                        Edit
                                    </button>
                                }
                            </div>
                            @if (r.description) {
                                <p class="mt-1 text-sm text-fg-muted">{{ r.description }}</p>
                            }
                            @if (open() === r.oid) {
                                <div class="mt-3"><app-routine-view [routine]="r" /></div>
                            }
                        </fm-card>
                    }
                </div>
            } @else {
                <fm-empty-state description="Build a template to assign it to members." icon="list-checks" title="No templates yet" />
            }
        } @else {
            <fm-skeleton height="16rem" />
        }
    `
})
export class RoutinesPageComponent {
    protected readonly auth = inject(AuthService);
    private readonly _service = inject(TrainingService);
    private readonly _dialog = inject(DialogService);
    protected readonly hq = inject(ActivatedRoute).snapshot.data['hq'] === true;
    protected readonly showAll = signal(false);
    protected readonly list = rxResource({ params: () => this.showAll(), stream: ({ params }) => this._service.templates(params) });
    private readonly _exercises = rxResource({ stream: () => this._service.exercises() });
    protected readonly open = signal<string | null>(null);
    protected readonly goal = GOAL_LABEL;
    protected readonly level = LEVEL_LABEL;

    protected toggle(oid: string): void {
        this.open.update(o => (o === oid ? null : oid));
    }

    protected build(r: Routine | null): void {
        this._dialog
            .open<RoutineBuilderDialogComponent, RoutineBuilderData, RoutineInput>(RoutineBuilderDialogComponent, {
                data: {
                    title: r ? `Edit ${r.name}` : 'Build a template',
                    exercises: this._exercises.value() ?? [],
                    template: true,
                    ...(r ? { routine: r } : {})
                },
                size: 'lg'
            })
            .afterClosed.pipe(
                filter((v): v is RoutineInput => !!v),
                switchMap(input => (r ? this._service.updateRoutine(r.oid, input) : this._service.createTemplate(input)))
            )
            .subscribe(() => this.list.reload());
    }
}
