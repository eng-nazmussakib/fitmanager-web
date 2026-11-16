import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';

import { brandInitials, DUMBBELL_PATH, splitWordmark } from '@core/tenant/brand';
import { TenantService } from '@core/tenant/tenant.service';

export { splitWordmark };

/**
 * The brand mark, the same everywhere (landing page, sign-in, console navbar).
 * With `brand.logo` it is that image and the name; otherwise the wordmark: an accent block, then the name with
 * its second part in the theme's main colour. The block holds the brand's initials ("ITF") or a dumbbell (`brand.mark`). Colours follow the active theme.
 */
@Component({
    selector: 'app-logo',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'inline-flex flex-col leading-none' },
    template: `
        <span class="flex items-center font-semibold" [class]="size() === 'lg' ? 'text-2xl' : size() === 'sm' ? 'text-base' : 'text-lg'">
            @if (brand.logo) {
                <img class="mr-2" alt="" [class]="size() === 'lg' ? 'size-9' : 'size-7'" [src]="brand.logo" />
                {{ brand.name }}
            } @else {
                <span
                    class="mr-1.5 flex shrink-0 items-center justify-center rounded-[3px] bg-primary-500 leading-none font-bold tracking-tight text-white"
                    aria-hidden="true"
                    [class]="size() === 'lg' ? 'h-9 w-12 text-lg' : size() === 'sm' ? 'h-5 w-7 text-[0.7rem]' : 'h-6 w-8 text-xs lg:h-8 lg:w-10 lg:text-base'"
                >
                    @if (brand.mark === 'dumbbell') {
                        <svg class="h-[70%]" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2.6" viewBox="0 0 24 24">
                            <path [attr.d]="dumbbell" />
                        </svg>
                    } @else {
                        {{ initials }}
                    }
                </span>
                <!-- Two elements, so no space renders between the parts ("FitManager", not "Fit Manager"). -->
                <span>{{ parts[0] }}</span>
                <span class="text-primary-500">{{ parts[1] }}</span>
            }
        </span>
        @if (tagline() && brand.tagline) {
            <span class="mt-1 font-normal opacity-90" [class]="size() === 'lg' ? 'text-base' : 'text-[0.7rem] lg:text-xs'">{{ brand.tagline }}</span>
        }
    `
})
export class LogoComponent {
    protected readonly brand = inject(TenantService).brand;
    /** A space between the parts ("Iron Tribe ", "Fitness") would be trimmed by the flex layout; keep it as a no-break space. */
    protected readonly parts = splitWordmark(this.brand.name, this.brand.wordmark).map(part => part.replace(/\s+$/, '\u00a0'));
    protected readonly initials = brandInitials(this.brand);
    protected readonly dumbbell = DUMBBELL_PATH;

    readonly size = input<'sm' | 'md' | 'lg'>('md');
    readonly tagline = input(false);
}
