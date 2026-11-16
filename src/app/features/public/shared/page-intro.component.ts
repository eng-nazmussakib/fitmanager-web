import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideChevronRight } from '@ng-icons/lucide';

import type { PageConfig } from '@config/tenant.model';

/** Top of a public page: breadcrumb (Home › page), the configured heading as the page's h1, and its lead. */
@Component({
    selector: 'app-page-intro',
    imports: [RouterLink, NgIcon],
    viewProviders: [provideIcons({ lucideChevronRight })],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'block' },
    template: `
        <div class="wrap pt-6 text-center lg:pt-12">
            <nav class="flex items-center justify-center gap-1.5 text-sm text-white/60" aria-label="Breadcrumb">
                <a class="hover:text-white" routerLink="/">Home</a>
                <ng-icon aria-hidden="true" name="lucideChevronRight" />
                <span aria-current="page">{{ crumb() }}</span>
            </nav>
            <h1 class="mt-4 text-[2rem] leading-tight font-extrabold lg:text-title">
                {{ page().title }}
                @if (page().accent) {
                    <span class="text-primary-500">{{ page().accent }}</span>
                }
            </h1>
            @if (page().lead) {
                <p class="section-lead">{{ page().lead }}</p>
            }
        </div>
    `
})
export class PageIntroComponent {
    readonly page = input.required<PageConfig>();
    readonly crumb = input.required<string>();
}
