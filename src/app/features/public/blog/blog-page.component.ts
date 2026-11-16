import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCalendar } from '@ng-icons/lucide';

import { SeoService } from '@core/seo/seo.service';
import { RevealDirective } from '@shared/directives/reveal.directive';

import { categoriesOf, PublicSiteService } from '../public-site.service';
import { CategoryFilterComponent } from '../shared/category-filter.component';
import { PageIntroComponent } from '../shared/page-intro.component';

/** `/blog?category=…`: every post from the brand config, filtered by category. */
@Component({
    selector: 'app-blog-page',
    imports: [NgIcon, RevealDirective, PageIntroComponent, CategoryFilterComponent],
    viewProviders: [provideIcons({ lucideCalendar })],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'block' },
    template: `
        <app-page-intro [crumb]="c.blog.page.accent" [page]="c.blog.page" />
        <app-category-filter class="mt-8 lg:mt-10" label="Blog categories" [active]="active()" [categories]="categories" [total]="c.blog.items.length" />

        @for (key of [active()]; track key) {
            <ul class="swap-in wrap mt-8 grid gap-6 sm:grid-cols-2 lg:mt-10 lg:grid-cols-3 lg:gap-8" aria-live="polite">
                @for (p of posts(); track p.title; let i = $index) {
                    <li class="lift flex flex-col overflow-hidden rounded-xl bg-ink-800 shadow-e4" appReveal [revealDelay]="(i % 3) * 90">
                        <img class="aspect-[16/10] w-full object-cover" loading="lazy" [alt]="p.image.alt" [src]="p.image.src" />
                        <div class="flex flex-1 flex-col p-4 lg:p-5">
                            <p class="flex flex-wrap items-center gap-3 text-xs text-white/60">
                                <span class="tag">{{ p.category }}</span>
                                @if (p.date) {
                                    <span class="flex items-center gap-1">
                                        <ng-icon aria-hidden="true" name="lucideCalendar" />
                                        {{ p.date }}
                                    </span>
                                }
                            </p>
                            <h2 class="mt-3 text-h2 font-semibold">{{ p.title }}</h2>
                            @if (p.excerpt) {
                                <p class="mt-2 text-sm leading-relaxed text-white/75">{{ p.excerpt }}</p>
                            }
                        </div>
                    </li>
                } @empty {
                    <li class="col-span-full py-10 text-center text-white/70">No posts in this category yet.</li>
                }
            </ul>
        }
    `
})
export class BlogPageComponent {
    private readonly _site = inject(PublicSiteService);

    protected readonly c = this._site.c;
    protected readonly categories = categoriesOf(this.c.blog.items).map(name => ({ name, count: this.c.blog.items.filter(p => p.category === name).length }));

    /** `?category=…` (route query param, bound by the router). */
    readonly category = input<string>();
    /** The active category, or null for all (an unknown one counts as all). */
    protected readonly active = computed(() => this.categories.find(c => c.name === this.category())?.name ?? null);
    protected readonly posts = computed(() => {
        const active = this.active();
        return active ? this.c.blog.items.filter(p => p.category === active) : this.c.blog.items;
    });

    constructor() {
        const page = this.c.blog.page;
        inject(SeoService).update({
            path: '/blog',
            title: `${page.seo.title} | ${this._site.brand}`,
            description: page.seo.description,
            jsonLd: {
                '@context': 'https://schema.org',
                '@type': 'Blog',
                name: `${this._site.brand} ${page.seo.title}`,
                description: page.seo.description,
                blogPost: this.c.blog.items.map(p => ({ '@type': 'BlogPosting', headline: p.title, articleSection: p.category, abstract: p.excerpt }))
            }
        });
    }
}
