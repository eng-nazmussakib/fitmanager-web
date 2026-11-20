import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';

import type { ClassType } from '@core/models/class.model';
import { SchedulingService } from '@features/console/scheduling.service';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { DialogComponent } from '@shared/ui/dialog/dialog.component';
import { BadgeComponent, CardComponent, SkeletonComponent } from '@shared/ui/display/display';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { NumberInputComponent } from '@shared/ui/forms/number-input.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { SwitchComponent } from '@shared/ui/forms/switch.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

const COLORS: ClassType['color'][] = ['red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet', 'pink'];
const SWATCH: Record<ClassType['color'], string> = {
    red: 'bg-red-500',
    orange: 'bg-orange-500',
    amber: 'bg-amber-500',
    green: 'bg-green-600',
    teal: 'bg-teal-600',
    blue: 'bg-blue-600',
    violet: 'bg-violet-600',
    pink: 'bg-pink-500'
};

/** `/hq/class-types` (D-080): the classes every branch can timetable, HQ master data like the plan templates. */
@Component({
    selector: 'app-hq-class-types-page',
    imports: [
        FormsModule,
        PageHeaderComponent,
        ButtonComponent,
        DialogComponent,
        BadgeComponent,
        CardComponent,
        SkeletonComponent,
        FieldComponent,
        InputDirective,
        NumberInputComponent,
        SelectComponent,
        SwitchComponent,
        IconComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <app-page-header subtitle="Names, colours and lengths that every branch's timetable uses" title="Class types">
            <button fmButton variant="primary" (click)="edit(null)">
                <fm-icon name="plus" />
                Add a class type
            </button>
        </app-page-header>
        @if (types.value(); as list) {
            <fm-card flush>
                <ul class="divide-y divide-border">
                    @for (t of list; track t.oid) {
                        <li class="flex items-center gap-3 px-4 py-3" [class.opacity-60]="t.active === false">
                            <span class="h-8 w-1.5 shrink-0 rounded-full" [class]="swatch[t.color]"></span>
                            <span class="min-w-0 flex-1">
                                <span class="block font-medium">
                                    {{ t.name }}
                                    <span class="text-sm font-normal text-fg-subtle">· {{ t.minutes }} min</span>
                                </span>
                                <span class="block truncate text-sm text-fg-muted">{{ t.description }}</span>
                            </span>
                            @if (t.active === false) {
                                <fm-badge>Not offered</fm-badge>
                            }
                            <button fmButton size="sm" variant="ghost" (click)="edit(t)">Edit</button>
                        </li>
                    }
                </ul>
            </fm-card>
        } @else {
            <fm-skeleton height="16rem" />
        }
        <fm-dialog [title]="editing()?.oid ? 'Edit ' + editing()!.name : 'Add a class type'" [(open)]="open">
            @if (editing(); as e) {
                <div class="grid gap-3">
                    <div class="grid grid-cols-2 gap-3">
                        <fm-field label="Name" required><input fmInput maxlength="60" [ngModel]="e.name" (ngModelChange)="patch({ name: $event })" /></fm-field>
                        <fm-field label="Minutes" required>
                            <fm-number-input [ngModel]="e.minutes" (ngModelChange)="patch({ minutes: $event ?? 45 })" />
                        </fm-field>
                    </div>
                    <fm-field label="Colour">
                        <fm-select ariaLabel="Colour" [ngModel]="e.color" [options]="colorOptions" (ngModelChange)="patch({ color: $event })" />
                    </fm-field>
                    <fm-field label="Description">
                        <textarea fmInput maxlength="500" rows="2" [ngModel]="e.description" (ngModelChange)="patch({ description: $event })"></textarea>
                    </fm-field>
                    @if (e.oid) {
                        <fm-switch [ngModel]="e.active !== false" (ngModelChange)="patch({ active: $event })">
                            Offered (branches can add it to the timetable)
                        </fm-switch>
                    }
                </div>
            }
            <ng-container fmDialogFooter>
                <button fmButton (click)="open.set(false)">Cancel</button>
                <button fmButton variant="primary" [disabled]="(editing()?.name?.trim()?.length ?? 0) < 2" [loading]="saving()" (click)="save()">Save</button>
            </ng-container>
        </fm-dialog>
    `
})
export class HqClassTypesPageComponent {
    private readonly _service = inject(SchedulingService);
    protected readonly types = rxResource({ stream: () => this._service.hqClassTypes() });
    protected readonly swatch = SWATCH;
    protected readonly colorOptions: SelectOption<ClassType['color']>[] = COLORS.map(c => ({ value: c, label: c[0].toUpperCase() + c.slice(1) }));
    protected readonly open = signal(false);
    protected readonly saving = signal(false);
    protected readonly editing = signal<(Partial<ClassType> & { name: string }) | null>(null);

    protected edit(t: ClassType | null): void {
        this.editing.set(t ? { ...t } : { name: '', minutes: 45, color: 'blue', description: '' });
        this.open.set(true);
    }

    protected patch(p: Partial<ClassType>): void {
        this.editing.update(e => (e ? { ...e, ...p } : e));
    }

    protected save(): void {
        const e = this.editing();
        if (!e) return;
        this.saving.set(true);
        const body = {
            name: e.name.trim(),
            minutes: e.minutes,
            color: e.color,
            description: e.description?.trim() ? e.description.trim() : null,
            ...(e.oid ? { active: e.active !== false } : {})
        };
        this._service.saveClassType(e.oid ?? null, body).subscribe({
            next: () => {
                this.saving.set(false);
                this.open.set(false);
                this.types.reload();
            },
            error: () => this.saving.set(false)
        });
    }
}
