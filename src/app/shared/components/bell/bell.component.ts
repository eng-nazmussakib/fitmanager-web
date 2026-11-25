import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { BellService } from '@core/notifications/bell.service';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { IconComponent } from '@shared/ui/icon/icon.component';

/**
 * The bell in the console and portal top bars: a link to the messages page with the unread count.
 * The layout calls `BellService.refresh()` when a page opens; the badge is the service's number.
 */
@Component({
    selector: 'app-bell',
    imports: [RouterLink, ButtonComponent, IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <a class="relative" fmButton iconOnly variant="ghost" [attr.aria-label]="label()" [routerLink]="link()">
            <fm-icon name="bell" />
            @if (bell.badge(); as badge) {
                <span
                    class="absolute -top-0.5 -right-0.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-danger px-1 text-[0.625rem] leading-none font-semibold text-white ring-2 ring-surface"
                    aria-hidden="true"
                    data-testid="bell-badge"
                >
                    {{ badge }}
                </span>
            }
        </a>
    `
})
export class BellComponent {
    protected readonly bell = inject(BellService);
    /** The messages page. */
    readonly link = input.required<string>();
    protected readonly label = computed(() => {
        const n = this.bell.unread();
        return n ? `Messages, ${n} unread` : 'Messages';
    });
}
