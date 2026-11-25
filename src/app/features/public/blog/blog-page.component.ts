import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCalendar } from '@ng-icons/lucide';

import { breadcrumbs, SeoService } from '@core/seo/seo.service';
import { environment } from '@env/environment';
import { RevealDirective } from '@shared/directives/reveal.directive';

import { categoriesOf, PublicSiteService } from '../public-site.service';
import { CategoryFilterComponent } from '../shared/category-filter.component';
import { PageIntroComponent } from '../shared/page-intro.component';
import { SiteContentService } from '../site-content.service';

/** `/blog?category=…`: every published post (the database's; the brand config's without an API), by category. */
@Component({
    selector: 'app-blog-page',
    imports: [NgIcon, RouterLink, RevealDirective, PageIntroComponent, CategoryFilterComponent],
    viewProviders: [provideIcons({ lucideCalendar })],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'block' },
    template: `
        <app-page-intro [crumb]="c.blog.page.accent" [page]="c.blog.page" />
        <app-category-filter class="mt-8 lg:mt-10" label="Blog categories" [active]="active()" [categories]="categories()" [total]="all().length" />

        @for (key of [active()]; track key) {
            <ul class="swap-in wrap mt-8 grid gap-6 sm:grid-cols-2 lg:mt-10 lg:grid-cols-3 lg:gap-8" aria-live="polite">
                @for (p of posts(); track p.slug; let i = $index) {
                    <li class="lift relative flex flex-col overflow-hidden rounded-xl bg-ink-800 shadow-e4" appReveal [revealDelay]="(i % 3) * 90">
                        <img class="aspect-[16/10] w-full object-cover" height="400" loading="lazy" width="640" [alt]="p.image.alt" [src]="p.image.src" />
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
                            <h2 class="mt-3 text-h2 font-semibold">
                                <!-- The whole card is the link (the ::after covers it). -->
                                <a class="after:absolute after:inset-0 hover:text-primary-400" [routerLink]="['/blog', p.slug]">{{ p.title }}</a>
                            </h2>
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
    private readonly _seo = inject(SeoService);

    protected readonly c = this._site.c;
    protected readonly all = inject(SiteContentService).posts;
    protected readonly categories = computed(() => {
        const items = this.all();
        return categoriesOf(items).map(name => ({ name, count: items.filter(p => p.category === name).length }));
    });

    /** `?category=…` (route query param, bound by the router). */
    readonly category = input<string>();
    /** The active category, or null for all (an unknown one counts as all). */
    protected readonly active = computed(() => this.categories().find(c => c.name === this.category())?.name ?? null);
    protected readonly posts = computed(() => {
        const active = this.active();
        return active ? this.all().filter(p => p.category === active) : this.all();
    });

    constructor() {
        const page = this.c.blog.page;
        const site = environment.siteUrl;
        effect(() => {
            this._seo.update({
                path: '/blog',
                title: `${page.seo.title} | ${this._site.brand}`,
                description: page.seo.description,
                jsonLd: {
                    '@context': 'https://schema.org',
                    '@graph': [
                        {
                            '@type': 'Blog',
                            name: `${this._site.brand} ${page.seo.title}`,
                            description: page.seo.description,
                            url: `${site}/blog`,
                            blogPost: this.all().map(p => ({
                                '@type': 'BlogPosting',
                                headline: p.title,
                                url: `${site}/blog/${p.slug}`,
                                articleSection: p.category,
                                abstract: p.excerpt,
                                ...(p.published_at ? { datePublished: p.published_at } : {})
                            }))
                        },
                        breadcrumbs([
                            ['Home', `${site}/`],
                            [page.accent, `${site}/blog`]
                        ])
                    ]
                }
            });
        });
    }
}
