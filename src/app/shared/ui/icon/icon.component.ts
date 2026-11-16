import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';

import { FM_ICON_REGISTRY, type IconName, registryName } from './icons';

/**
 * `<fm-icon name="check" />`: a Lucide icon from the kit's registry (icons.ts). Decorative by default
 * (`aria-hidden`); pass `label` when the icon carries meaning on its own. Inherits the text colour.
 */
@Component({
    selector: 'fm-icon',
    imports: [NgIcon],
    viewProviders: [provideIcons(FM_ICON_REGISTRY)],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        class: 'inline-flex shrink-0',
        '[attr.aria-hidden]': 'label() ? null : "true"',
        '[attr.role]': 'label() ? "img" : null',
        '[attr.aria-label]': 'label() || null'
    },
    template: `
        <ng-icon [name]="registryName()" [size]="size()" [strokeWidth]="strokeWidth()" />
    `
})
export class IconComponent {
    readonly name = input.required<IconName>();
    /** CSS size, e.g. '1rem' or '20px'. */
    readonly size = input('1.125rem');
    readonly strokeWidth = input<number | undefined>(undefined);
    readonly label = input<string>();

    protected readonly registryName = computed(() => registryName(this.name()));
}
