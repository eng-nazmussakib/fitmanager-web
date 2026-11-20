import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';

import type { Trainer } from '@core/models/class.model';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { CanDirective } from '@shared/directives/can.directive';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogService } from '@shared/ui/dialog/dialog.service';
import { AvatarComponent, BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

import { SchedulingService } from '../scheduling.service';
import { type TrainerEditorData, TrainerEditorDialogComponent } from './trainer-editor-dialog.component';

/** `/console/:branch/trainers` (D-078): the branch's trainers, with their clients and whether they can sign in. */
@Component({
    selector: 'app-trainers-page',
    imports: [
        RouterLink,
        PageHeaderComponent,
        CanDirective,
        ButtonComponent,
        AvatarComponent,
        BadgeComponent,
        CardComponent,
        SkeletonComponent,
        EmptyStateComponent,
        IconComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-page-header subtitle="Profiles, availability for PT, days off and clients" title="Trainers">
            <button *appCan="'create'; on: 'Trainer'" fmButton variant="primary" (click)="add()">
                <fm-icon name="plus" />
                Add a profile
            </button>
        </app-page-header>
        @if (list.isLoading() && !list.value()) {
            <fm-skeleton height="16rem" />
        } @else if (!list.value()?.length) {
            <fm-card>
                <fm-empty-state description="Give a staff member the Trainer role, then add their profile." icon="users-round" title="No trainers yet" />
            </fm-card>
        } @else {
            <ul class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                @for (t of list.value(); track t.oid) {
                    <li>
                        <a
                            class="fm-focusable block h-full rounded-[var(--radius-panel)] border border-border bg-surface p-4 no-underline hover:border-accent"
                            [routerLink]="t.oid"
                        >
                            <div class="flex items-start gap-3">
                                <fm-avatar size="3.5rem" [name]="t.name" [src]="t.photo_url" />
                                <div class="min-w-0 flex-1">
                                    <p class="truncate font-semibold text-fg">{{ t.name }}</p>
                                    <p class="truncate text-sm text-fg-muted">{{ t.headline || t.specialties.join(', ') }}</p>
                                    <div class="mt-2 flex flex-wrap gap-1.5">
                                        <fm-badge>{{ t.clients ?? 0 }} {{ t.clients === 1 ? 'client' : 'clients' }}</fm-badge>
                                        @if (t.branch_oid !== list.value()![0]!.branch_oid && t.branch_name) {
                                            <fm-badge tone="info">From {{ t.branch_name }}</fm-badge>
                                        }
                                        @if (t.active === false) {
                                            <fm-badge tone="warning">Inactive</fm-badge>
                                        } @else if (t.can_sign_in === false) {
                                            <fm-badge>No sign-in yet</fm-badge>
                                        }
                                        @if (t.public === false) {
                                            <fm-badge>Hidden from the website</fm-badge>
                                        }
                                    </div>
                                </div>
                            </div>
                        </a>
                    </li>
                }
            </ul>
        }
    `
})
export class TrainersPageComponent {
    private readonly _service = inject(SchedulingService);
    private readonly _dialog = inject(DialogService);
    protected readonly list = rxResource({ stream: () => this._service.trainers() });

    protected add(): void {
        this._dialog
            .open<TrainerEditorDialogComponent, TrainerEditorData, Trainer>(TrainerEditorDialogComponent, { data: {}, size: 'lg' })
            .afterClosed.subscribe(t => {
                if (t) this.list.reload();
            });
    }
}
