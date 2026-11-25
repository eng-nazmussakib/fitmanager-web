import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideClock } from '@ng-icons/lucide';
import { of, switchMap } from 'rxjs';

import { breadcrumbs, SeoService } from '@core/seo/seo.service';
import { markdownText } from '@core/utils/markdown';
import { environment } from '@env/environment';
import { RevealDirective } from '@shared/directives/reveal.directive';

import { PublicContentService } from '../public-content.service';
import { PublicSiteService } from '../public-site.service';
import { PageIntroComponent } from '../shared/page-intro.component';

/**
 * An extra public page from the brand config's `pages` (offers, policies, rules, careers…), at `/<slug>`.
 * The route passes the page's `slug` as route data. `document` pages read like a policy; `cards` pages show a card per block.
 */
const dayText = (iso: string): string => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

@Component({
    selector: 'app-info-page',
    imports: [NgIcon, RevealDirective, PageIntroComponent],
    viewProviders: [provideIcons({ lucideCheck, lucideClock })],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'block' },
    styles: `
        .info-doc {
            max-width: 48rem;
            margin-inline: auto;
            padding: 1.5rem;
            border-radius: 0.75rem;
            background: var(--color-ink-800);
            box-shadow: var(--shadow-e4);
            line-height: 1.7;
            color: rgb(255 255 255 / 85%);
        }
        .info-doc h2 {
            font-size: 1.25rem;
            font-weight: 600;
            color: #fff;
        }
        .info-doc section + section {
            margin-top: 2rem;
            padding-top: 2rem;
            border-top: 1px solid rgb(255 255 255 / 8%);
        }
        .info-list li {
            display: flex;
            gap: 0.6rem;
            align-items: flex-start;
        }
        .info-list ng-icon {
            flex-shrink: 0;
            margin-top: 0.3rem;
            color: var(--color-primary-400);
        }
        @media (width >= 64rem) {
            .info-doc {
                padding: 2.5rem 3rem;
            }
        }
    `,
    template: `
        @if (page(); as p) {
            <app-page-intro [crumb]="p.crumb ?? p.title" [page]="p" />

            @if (p.layout === 'cards') {
                <ul class="wrap mt-10 grid gap-6 sm:grid-cols-2 lg:mt-14 lg:grid-cols-3 lg:gap-8">
                    @for (b of p.blocks; track $index; let i = $index) {
                        <li class="trainer-card lift flex flex-col p-6" appReveal [revealDelay]="(i % 3) * 80">
                            @if (b.note) {
                                <p class="tag w-fit">
                                    <ng-icon class="mr-1" aria-hidden="true" name="lucideClock" />
                                    {{ b.note }}
                                </p>
                            }
                            @if (b.heading) {
                                <h2 class="mt-4 text-h1 font-semibold">{{ b.heading }}</h2>
                            }
                            @for (t of b.text; track $index) {
                                <p class="mt-3 text-sm leading-relaxed text-white/80">{{ t }}</p>
                            }
                            @if (b.list?.length) {
                                <ul class="info-list mt-4 space-y-2 text-sm text-white/70">
                                    @for (item of b.list; track item) {
                                        <li><ng-icon aria-hidden="true" name="lucideCheck" />{{ item }}</li>
                                    }
                                </ul>
                            }
                        </li>
                    }
                </ul>
            } @else {
                <div class="wrap mt-10 lg:mt-14">
                    <article class="info-doc" appReveal>
                        @if (p.updated) {
                            <p class="mb-6 text-sm text-white/55">Last updated {{ updated() }}</p>
                        }
                        @for (b of p.blocks; track $index) {
                            <section>
                                @if (b.heading) {
                                    <h2>{{ b.heading }}</h2>
                                }
                                @for (t of b.text; track $index) {
                                    <p class="mt-3">{{ t }}</p>
                                }
                                @if (b.list?.length) {
                                    <ul class="info-list mt-3 space-y-2">
                                        @for (item of b.list; track item) {
                                            <li><ng-icon aria-hidden="true" name="lucideCheck" />{{ item }}</li>
                                        }
                                    </ul>
                                }
                                @if (b.note) {
                                    <p class="mt-3 text-sm text-white/55">{{ b.note }}</p>
                                }
                            </section>
                        }
                    </article>
                </div>
            }
        }
    `
})
export class InfoPageComponent {
    private readonly _site = inject(PublicSiteService);
    private readonly _seo = inject(SeoService);
    private readonly _content = inject(PublicContentService);

    /** The page's slug (route data). */
    readonly slug = input.required<string>();
    private readonly _config = computed(() => this._site.c.pages.find(p => p.slug === this.slug()) ?? null);
    /** `/offers` (phase 7c, D-109): the offers running today, from the database; the config's blocks without an API. */
    private readonly _offers = toSignal(toObservable(this.slug).pipe(switchMap(s => (s === 'offers' ? this._content.offers() : of(null)))), { initialValue: null });
    protected readonly page = computed(() => {
        const page = this._config();
        const offers = this._offers();
        if (!page || !offers) return page;
        return {
            ...page,
            blocks: offers.map(o => ({
                heading: o.title,
                text: [o.summary, ...(o.body ? [markdownText(o.body)] : [])],
                list: [...o.conditions, ...(o.promo_code ? [`At the desk, ask for ${o.promo_code}`] : [])],
                note: o.ends_on ? `Until ${dayText(o.ends_on)}` : 'Ongoing'
            }))
        };
    });
    /** `2026-11-15` → `15 November 2026`. */
    protected readonly updated = computed(() => {
        const date = this.page()?.updated;
        return date ? new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    });

    constructor() {
        effect(() => {
            const p = this.page();
            if (!p) return;
            const url = `${environment.siteUrl}/${p.slug}`;
            const offers = this._offers();
            this._seo.update({
                path: `/${p.slug}`,
                title: `${p.seo.title} | ${this._site.brand}`,
                description: p.seo.description,
                jsonLd: {
                    '@context': 'https://schema.org',
                    '@graph': [
                        ...(offers?.length
                            ? [
                                  {
                                      '@type': 'OfferCatalog',
                                      name: p.seo.title,
                                      url,
                                      itemListElement: offers.map(o => ({
                                          '@type': 'Offer',
                                          name: o.title,
                                          description: o.summary,
                                          url,
                                          validFrom: o.starts_on,
                                          ...(o.ends_on ? { validThrough: o.ends_on } : {}),
                                          offeredBy: { '@type': 'ExerciseGym', name: this._site.brand }
                                      }))
                                  }
                              ]
                            : []),
                        breadcrumbs([
                            ['Home', `${environment.siteUrl}/`],
                            [p.crumb ?? p.title, url]
                        ])
                    ]
                }
            });
        });
    }
}
