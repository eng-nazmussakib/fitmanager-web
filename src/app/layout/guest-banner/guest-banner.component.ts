import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { IconComponent } from '@shared/ui/icon/icon.component';

/**
 * Shown while signed in as one of the hosted demo's shared guest accounts: says the data is shared demo data,
 * and offers Switch role (back to the /demo picker). The demo build has its own banner (DemoBannerComponent).
 */
@Component({
    selector: 'app-guest-banner',
    imports: [RouterLink, IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'do-not-print block' },
    template: `
        <div
            class="relative z-[var(--z-toast)] flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-secondary-500 px-3 py-1.5 text-xs font-medium text-white"
            aria-label="Guest mode"
            role="region"
        >
            <span class="flex items-center gap-1.5">
                <fm-icon name="sparkles" size="0.875rem" />
                You are a guest: the demo data is shared with other visitors and reset from time to time.
            </span>
            <a class="flex items-center gap-1 underline-offset-2 hover:underline" routerLink="/demo">
                <fm-icon name="users" size="0.875rem" />
                Switch role
            </a>
        </div>
    `
})
export class GuestBannerComponent {}
