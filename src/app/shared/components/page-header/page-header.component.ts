import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { BreadcrumbComponent } from '@shared/ui/navigation/breadcrumb.component';

/**
 * Page title + breadcrumb (from the routes' `data.breadcrumb`) + an actions slot, for console and HQ pages.
 *
 *   <app-page-header title="Members" subtitle="250 at Gulshan">
 *     <a fmButton variant="primary" routerLink="new">Add member</a>     ← projected to the right
 *   </app-page-header>
 */
@Component({
    selector: 'app-page-header',
    imports: [BreadcrumbComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'mb-5 flex flex-wrap items-end justify-between gap-3' },
    template: `
        <div class="min-w-0">
            @if (crumbs()) {
                <fm-breadcrumb class="mb-1 block" />
            }
            <h1 class="text-xl font-semibold text-fg sm:text-2xl">{{ title() }}</h1>
            @if (subtitle(); as sub) {
                <p class="mt-0.5 text-sm text-fg-muted">{{ sub }}</p>
            }
        </div>
        <div class="flex flex-wrap items-center gap-2 empty:hidden">
            <ng-content />
        </div>
    `
})
export class PageHeaderComponent {
    readonly title = input.required<string>();
    readonly subtitle = input<string | null>();
    readonly crumbs = input(true);
}
