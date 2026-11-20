import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

import { AuthService } from '@core/auth/auth.service';
import {
    CATEGORY_LABEL,
    type Equipment,
    EQUIPMENT_LABEL,
    type Exercise,
    type ExerciseCategory,
    MEASURE_LABEL,
    type Muscle,
    MUSCLE_LABEL
} from '@core/models/training.model';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogComponent } from '@shared/ui/dialog/dialog.component';
import { DialogService } from '@shared/ui/dialog/dialog.service';
import { BadgeComponent, SkeletonComponent } from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { SwitchComponent } from '@shared/ui/forms/switch.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { type ExerciseEditorData, ExerciseEditorDialogComponent } from './exercise-editor-dialog.component';
import { TrainingService } from './training.service';

const all = <T extends string>(labels: Record<T, string>, none: string): SelectOption<T | ''>[] => [
    { value: '', label: none },
    ...Object.entries(labels).map(([value, label]) => ({ value: value as T, label: label as string }))
];

/**
 * `/exercises` (branch) and `/hq/exercises` (HQ): the exercise library (D-084). A branch sees HQ's exercises, read
 * only, and its own; HQ sees and edits HQ's. Each opens with its photos, video and instructions.
 */
@Component({
    selector: 'app-exercises-page',
    imports: [
        FormsModule,
        PageHeaderComponent,
        ButtonComponent,
        DialogComponent,
        BadgeComponent,
        SkeletonComponent,
        EmptyStateComponent,
        SelectComponent,
        SwitchComponent,
        IconComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-page-header title="Exercise library" [subtitle]="hq ? 'Shared with every branch' : 'HQ’s library and this branch’s own exercises'">
            @if (auth.can('create', 'Exercise')) {
                <button fmButton variant="primary" (click)="edit(null)">
                    <fm-icon name="plus" />
                    Add an exercise
                </button>
            }
        </app-page-header>
        <div class="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-center">
            <input class="fm-input" type="search" aria-label="Search exercises" placeholder="Search by name" [(ngModel)]="q" />
            <fm-select ariaLabel="Category" [options]="categories" [(ngModel)]="category" />
            <fm-select ariaLabel="Muscle" [options]="muscles" [(ngModel)]="muscle" />
            <fm-select ariaLabel="Equipment" [options]="equipment" [(ngModel)]="gear" />
            @if (auth.can('update', 'Exercise')) {
                <fm-switch [ngModel]="showAll()" (ngModelChange)="showAll.set($event)">Not in use too</fm-switch>
            }
        </div>
        @if (list.value(); as rows) {
            <p class="mb-2 text-sm text-fg-muted">{{ shown().length }} of {{ rows.length }} exercises</p>
            @if (shown().length) {
                <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    @for (e of shown(); track e.oid) {
                        <li>
                            <button
                                class="flex w-full flex-col overflow-hidden rounded-lg border border-border bg-surface text-left hover:border-primary-500"
                                type="button"
                                [class.opacity-60]="!e.active"
                                (click)="view.set(e)"
                            >
                                @if (e.photos[0]; as p) {
                                    <img
                                        class="aspect-[4/3] w-full bg-surface-sunken object-cover"
                                        alt=""
                                        height="150"
                                        loading="lazy"
                                        width="200"
                                        [src]="p.url"
                                    />
                                } @else {
                                    <span class="flex aspect-[4/3] w-full items-center justify-center bg-surface-sunken text-fg-subtle">
                                        <fm-icon name="dumbbell" size="2rem" />
                                    </span>
                                }
                                <span class="grid gap-1 p-3">
                                    <span class="flex items-center gap-1.5 font-medium">
                                        <span class="min-w-0 flex-1 truncate">{{ e.name }}</span>
                                        @if (e.video) {
                                            <fm-icon class="text-fg-muted" name="circle-play" aria-label="Has a video" size="1rem" />
                                        }
                                    </span>
                                    <span class="truncate text-sm text-fg-muted">{{ muscleText(e.muscles) }} · {{ equipmentLabel[e.equipment] }}</span>
                                    <span class="flex flex-wrap gap-1">
                                        <fm-badge [tone]="e.scope === 'hq' ? 'neutral' : 'info'">{{ e.scope === 'hq' ? 'HQ' : 'This branch' }}</fm-badge>
                                        <fm-badge>{{ categoryLabel[e.category] }}</fm-badge>
                                        @if (!e.active) {
                                            <fm-badge tone="warning">Not in use</fm-badge>
                                        }
                                    </span>
                                </span>
                            </button>
                        </li>
                    }
                </ul>
            } @else {
                <fm-empty-state description="Try another filter." icon="search" title="No exercises match" />
            }
        } @else {
            <fm-skeleton height="20rem" />
        }

        <fm-dialog size="lg" [open]="!!view()" [title]="view()?.name ?? ''" (openChange)="$event || view.set(null)">
            @if (view(); as e) {
                <div class="grid gap-4">
                    @if (e.video) {
                        <video
                            class="w-full rounded-lg bg-black"
                            aria-label="How to do it, video"
                            autoplay
                            controls
                            loop
                            muted
                            playsinline
                            [src]="e.video.url"
                        ></video>
                    }
                    @if (e.photos.length) {
                        <div class="grid grid-cols-3 gap-2">
                            @for (p of e.photos; track p.file_oid; let i = $index) {
                                <a class="block overflow-hidden rounded-md border border-border" rel="noopener" target="_blank" [href]="p.url">
                                    <img
                                        class="aspect-[4/3] w-full object-cover"
                                        height="150"
                                        width="200"
                                        [alt]="e.name + ', photo ' + (i + 1)"
                                        [src]="p.url"
                                    />
                                </a>
                            }
                        </div>
                    }
                    <dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                        <div>
                            <dt class="text-fg-muted">Category</dt>
                            <dd>{{ categoryLabel[e.category] }}</dd>
                        </div>
                        <div>
                            <dt class="text-fg-muted">Measured as</dt>
                            <dd>{{ measureLabel[e.measure] }}</dd>
                        </div>
                        <div>
                            <dt class="text-fg-muted">Equipment</dt>
                            <dd>{{ equipmentLabel[e.equipment] }}</dd>
                        </div>
                        <div>
                            <dt class="text-fg-muted">Muscles</dt>
                            <dd>{{ muscleText(e.muscles) }}</dd>
                        </div>
                    </dl>
                    @if (e.instructions) {
                        <p class="leading-relaxed">{{ e.instructions }}</p>
                    }
                    @if (!e.editable) {
                        <p class="text-sm text-fg-subtle">In the HQ library: only HQ can change it.</p>
                    }
                </div>
            }
            <ng-container fmDialogFooter>
                <button fmButton (click)="view.set(null)">Close</button>
                @if (view()?.editable && auth.can('update', 'Exercise')) {
                    <button fmButton variant="primary" (click)="edit(view())">Edit</button>
                }
            </ng-container>
        </fm-dialog>
    `
})
export class ExercisesPageComponent {
    protected readonly auth = inject(AuthService);
    private readonly _service = inject(TrainingService);
    private readonly _dialog = inject(DialogService);
    protected readonly hq = inject(ActivatedRoute).snapshot.data['hq'] === true;
    protected readonly showAll = signal(false);
    protected readonly list = rxResource({ params: () => this.showAll(), stream: ({ params }) => this._service.exercises({ all: params }) });
    protected readonly q = signal('');
    protected readonly category = signal<ExerciseCategory | ''>('');
    protected readonly muscle = signal<Muscle | ''>('');
    protected readonly gear = signal<Equipment | ''>('');
    protected readonly view = signal<Exercise | null>(null);
    protected readonly categories = all(CATEGORY_LABEL, 'Every category');
    protected readonly muscles = all(MUSCLE_LABEL, 'Every muscle');
    protected readonly equipment = all(EQUIPMENT_LABEL, 'Any equipment');
    protected readonly categoryLabel = CATEGORY_LABEL;
    protected readonly equipmentLabel = EQUIPMENT_LABEL;
    protected readonly measureLabel = MEASURE_LABEL;
    protected readonly shown = computed(() => {
        const q = this.q().trim().toLowerCase();
        return (this.list.value() ?? []).filter(
            e =>
                (!q || e.name.toLowerCase().includes(q)) &&
                (!this.category() || e.category === this.category()) &&
                (!this.muscle() || e.muscles.includes(this.muscle() as Muscle)) &&
                (!this.gear() || e.equipment === this.gear())
        );
    });

    protected muscleText(m: Muscle[]): string {
        return m.map(x => MUSCLE_LABEL[x]).join(', ');
    }

    protected edit(e: Exercise | null): void {
        this.view.set(null);
        this._dialog
            .open<ExerciseEditorDialogComponent, ExerciseEditorData, Exercise>(ExerciseEditorDialogComponent, {
                data: { ...(e ? { exercise: e } : {}), scope: this.hq ? 'hq' : 'branch' },
                size: 'lg'
            })
            .afterClosed.subscribe(saved => {
                if (saved) this.list.reload();
            });
    }
}
