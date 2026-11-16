import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideClock } from '@ng-icons/lucide';

import { SeoService } from '@core/seo/seo.service';
import { RevealDirective } from '@shared/directives/reveal.directive';

import { PublicSiteService } from '../public-site.service';
import { PageIntroComponent } from '../shared/page-intro.component';

/**
 * An extra public page from the brand config's `pages` (offers, policies, rules, careers…), at `/<slug>`.
 * The route passes the page's `slug` as route data. `document` pages read like a policy; `cards` pages show a card per block.
 */
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

    /** The page's slug (route data). */
    readonly slug = input.required<string>();
    protected readonly page = computed(() => this._site.c.pages.find(p => p.slug === this.slug()) ?? null);
    /** `2026-11-15` → `15 November 2026`. */
    protected readonly updated = computed(() => {
        const date = this.page()?.updated;
        return date ? new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    });

    constructor() {
        effect(() => {
            const p = this.page();
            if (!p) return;
            this._seo.update({ path: `/${p.slug}`, title: `${p.seo.title} | ${this._site.brand}`, description: p.seo.description });
        });
    }
}
