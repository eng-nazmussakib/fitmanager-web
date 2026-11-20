import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';

import { GOAL_LABEL, LEVEL_LABEL, type Routine } from '@core/models/training.model';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DIALOG_DATA, DialogRef } from '@shared/ui/dialog/dialog-ref';
import { DialogFooterDirective, DialogShellComponent } from '@shared/ui/dialog/dialog-shell.component';
import { BadgeComponent } from '@shared/ui/display/display';

import { RoutineViewComponent } from './routine-view.component';

export interface TemplatePickerData {
    title: string;
    description: string;
    templates: Routine[];
    action: string;
}

/** Picks a routine template (to assign, or to start in the portal), showing each one's days. Closes with its oid. */
@Component({
    selector: 'app-template-picker-dialog',
    imports: [ButtonComponent, DialogShellComponent, DialogFooterDirective, BadgeComponent, RoutineViewComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <fm-dialog-shell [description]="data.description" [title]="data.title">
            <ul class="grid gap-2" role="radiogroup" [attr.aria-label]="data.title">
                @for (t of data.templates; track t.oid) {
                    <li>
                        <button
                            class="w-full rounded-lg border p-3 text-left hover:border-primary-500"
                            type="button"
                            role="radio"
                            [attr.aria-checked]="picked() === t.oid"
                            [class.border-border]="picked() !== t.oid"
                            [class.border-primary-500]="picked() === t.oid"
                            (click)="picked.set(t.oid)"
                        >
                            <span class="flex flex-wrap items-center gap-2 font-medium">
                                {{ t.name }}
                                <fm-badge>{{ t.scope === 'hq' ? 'HQ' : 'This branch' }}</fm-badge>
                                <span class="text-sm font-normal text-fg-muted">
                                    {{ goal[t.goal] }} · {{ level[t.level] }} · {{ t.days.length }} days{{ t.trainer_name ? ' · by ' + t.trainer_name : '' }}
                                </span>
                            </span>
                            @if (t.description) {
                                <span class="mt-1 block text-sm text-fg-muted">{{ t.description }}</span>
                            }
                        </button>
                        @if (picked() === t.oid) {
                            <div class="mt-2"><app-routine-view [routine]="t" /></div>
                        }
                    </li>
                }
            </ul>
            <ng-container fmDialogFooter>
                <button fmButton (click)="ref.close()">Cancel</button>
                <button fmButton variant="primary" [disabled]="!picked()" (click)="ref.close(picked()!)">{{ data.action }}</button>
            </ng-container>
        </fm-dialog-shell>
    `
})
export class TemplatePickerDialogComponent {
    protected readonly data = inject<TemplatePickerData>(DIALOG_DATA);
    protected readonly ref = inject<DialogRef<string>>(DialogRef);
    protected readonly picked = signal<string | null>(null);
    protected readonly goal = GOAL_LABEL;
    protected readonly level = LEVEL_LABEL;
}
