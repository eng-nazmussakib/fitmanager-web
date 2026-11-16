import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { IconComponent } from '../icon/icon.component';
import type { IconName } from '../icon/icons';

/**
 * `<fm-empty-state icon="inbox" title="No members yet" description="…"><button fmButton>Add member</button></fm-empty-state>`
 * For empty lists, failed loads and whole-page results (404, 403: `size="lg"`). Replaces nz-empty and nz-result.
 */
@Component({
    selector: 'fm-empty-state',
    imports: [IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { '[class]': '"fm-empty" + (size() === "lg" ? " fm-empty-lg" : "")' },
    template: `
        <span class="fm-empty-icon"><fm-icon [name]="icon()" [size]="size() === 'lg' ? '2.25rem' : '1.5rem'" /></span>
        @if (size() === 'lg') {
            <h1 class="fm-empty-title">{{ title() }}</h1>
        } @else {
            <p class="fm-empty-title">{{ title() }}</p>
        }
        @if (description()) {
            <p class="max-w-md text-sm">{{ description() }}</p>
        }
        <div class="mt-3 flex flex-wrap justify-center gap-2 empty:hidden"><ng-content /></div>
    `
})
export class EmptyStateComponent {
    readonly icon = input<IconName>('inbox');
    readonly title = input.required<string>();
    readonly description = input<string>();
    readonly size = input<'md' | 'lg'>('md');
}
