import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowLeft, lucideArrowRight, lucideMapPin, lucideX } from '@ng-icons/lucide';

import { absolute, breadcrumbs, SeoService } from '@core/seo/seo.service';
import { environment } from '@env/environment';
import { RevealDirective } from '@shared/directives/reveal.directive';

import { categoriesOf, PublicSiteService } from '../public-site.service';
import { CategoryFilterComponent } from '../shared/category-filter.component';
import { PageIntroComponent } from '../shared/page-intro.component';
import { SiteContentService } from '../site-content.service';

/**
 * `/gallery?category=…`: every photo from the brand config, filtered by category (the branch, for now), in an even
 * grid of 4:3 tiles. A photo opens full size in a native <dialog> (Escape, the close button or a click outside closes
 * it; the arrows and the arrow keys step through the photos of the current filter).
 */
@Component({
    selector: 'app-gallery-page',
    imports: [NgIcon, RevealDirective, PageIntroComponent, CategoryFilterComponent],
    viewProviders: [provideIcons({ lucideArrowLeft, lucideArrowRight, lucideMapPin, lucideX })],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'block' },
    styles: `
        .lightbox {
            width: min(72rem, 100vw - 2rem);
            max-width: none;
            max-height: calc(100dvh - 2rem);
            margin: auto;
            padding: 0;
            border: 0;
            background: transparent;
            color: #fff;
            overflow: visible;
        }
        .lightbox::backdrop {
            background: rgb(0 0 0 / 85%);
            backdrop-filter: blur(4px);
        }
        .lightbox img {
            display: block;
            max-width: 100%;
            max-height: calc(100dvh - 8rem);
            margin-inline: auto;
            border-radius: 0.75rem;
            object-fit: contain;
            box-shadow: var(--shadow-e6);
        }
        .lightbox-btn {
            display: flex;
            width: 2.75rem;
            height: 2.75rem;
            align-items: center;
            justify-content: center;
            border: 1px solid rgb(255 255 255 / 35%);
            border-radius: 9999px;
            background: rgb(0 0 0 / 45%);
            color: #fff;
            cursor: pointer;
            transition:
                background-color 0.15s,
                border-color 0.15s;
        }
        .lightbox-btn:hover {
            border-color: var(--color-primary-400);
            background: var(--color-primary-500);
        }
        @media (prefers-reduced-motion: no-preference) {
            .lightbox[open] img {
                animation: lightbox-in 0.3s ease-out;
            }
        }
        @keyframes lightbox-in {
            from {
                opacity: 0;
                scale: 0.96;
            }
        }
    `,
    template: `
        <app-page-intro [crumb]="c.gallery.page.accent" [page]="c.gallery.page" />
        <app-category-filter class="mt-8 lg:mt-10" label="Gallery categories" [active]="active()" [categories]="categories()" [total]="all().length" />

        @for (key of [active()]; track key) {
            <ul class="swap-in wrap mt-8 grid grid-cols-2 gap-3 lg:mt-10 lg:grid-cols-3 lg:gap-6" aria-live="polite">
                @for (g of photos(); track g.src; let i = $index) {
                    <li appReveal [revealDelay]="(i % 3) * 80">
                        <button class="gallery-tile aspect-[4/3]" type="button" [attr.aria-label]="'Open photo: ' + g.alt + ' (' + g.category + ')'" (click)="open(i)">
                            <img loading="lazy" [alt]="g.alt" [height]="g.height" [src]="g.thumb" [width]="g.width" />
                            <span class="gallery-label">
                                <ng-icon class="text-primary-400" aria-hidden="true" name="lucideMapPin" />
                                {{ g.category }}
                            </span>
                        </button>
                    </li>
                } @empty {
                    <li class="col-span-full py-10 text-center text-white/70">No photos in this category yet.</li>
                }
            </ul>
        }

        <dialog #lightbox class="lightbox" aria-label="Photo" tabindex="-1" (click)="onBackdrop($event)" (close)="current.set(null)" (keydown)="onKey($event)">
            @if (photo(); as g) {
                <figure class="m-0">
                    <img [alt]="g.alt" [src]="g.src" />
                    <figcaption class="mt-3 flex items-center justify-between gap-4 px-1 text-sm text-white/85">
                        <span>
                            {{ g.alt }}
                            <span class="ml-2 inline-flex items-center gap-1 text-white/60">
                                <ng-icon class="text-primary-400" aria-hidden="true" name="lucideMapPin" />
                                {{ g.category }}
                            </span>
                        </span>
                        <span class="shrink-0 text-white/60">{{ (current() ?? 0) + 1 }} / {{ photos().length }}</span>
                    </figcaption>
                </figure>
                <div class="pointer-events-none absolute inset-x-2 top-1/2 flex -translate-y-1/2 justify-between">
                    <button class="lightbox-btn pointer-events-auto" type="button" aria-label="Previous photo" (click)="step(-1)">
                        <ng-icon aria-hidden="true" name="lucideArrowLeft" size="1.25rem" />
                    </button>
                    <button class="lightbox-btn pointer-events-auto" type="button" aria-label="Next photo" (click)="step(1)">
                        <ng-icon aria-hidden="true" name="lucideArrowRight" size="1.25rem" />
                    </button>
                </div>
                <button class="lightbox-btn absolute -top-3 -right-3" type="button" aria-label="Close" (click)="close()">
                    <ng-icon aria-hidden="true" name="lucideX" size="1.25rem" />
                </button>
            }
        </dialog>
    `
})
export class GalleryPageComponent {
    private readonly _site = inject(PublicSiteService);
    private readonly _dialog = viewChild.required<ElementRef<HTMLDialogElement>>('lightbox');

    protected readonly c = this._site.c;
    /** Every photo (the database's; the brand config's without an API). Category = the branch. */
    protected readonly all = inject(SiteContentService).photos;
    protected readonly categories = computed(() => {
        const items = this.all();
        return categoriesOf(items, this.c.gallery.categories).map(name => ({ name, count: items.filter(g => g.category === name).length }));
    });
    /** Index (in the filtered photos) of the photo open in the lightbox, or null. */
    protected readonly current = signal<number | null>(null);

    /** `?category=…` (route query param, bound by the router). */
    readonly category = input<string>();
    /** The active category, or null for all (an unknown one counts as all). */
    protected readonly active = computed(() => this.categories().find(c => c.name === this.category())?.name ?? null);
    protected readonly photos = computed(() => {
        const active = this.active();
        return active ? this.all().filter(g => g.category === active) : this.all();
    });
    protected readonly photo = computed(() => {
        const i = this.current();
        return i === null ? null : (this.photos()[i] ?? null);
    });

    constructor() {
        const page = this.c.gallery.page;
        const seo = inject(SeoService);
        effect(() => {
            seo.update({
                path: '/gallery',
                title: `${page.seo.title} | ${this._site.brand}`,
                description: page.seo.description,
                jsonLd: {
                    '@context': 'https://schema.org',
                    '@graph': [
                        {
                            '@type': 'ImageGallery',
                            name: `${this._site.brand} ${page.seo.title}`,
                            description: page.seo.description,
                            url: `${environment.siteUrl}/gallery`,
                            image: this.all().map(g => ({ '@type': 'ImageObject', contentUrl: absolute(g.src), caption: g.alt, contentLocation: g.category }))
                        },
                        breadcrumbs([
                            ['Home', `${environment.siteUrl}/`],
                            [page.accent, `${environment.siteUrl}/gallery`]
                        ])
                    ]
                }
            });
        });
    }

    protected open(index: number): void {
        this.current.set(index);
        this._dialog().nativeElement.showModal();
    }

    protected close(): void {
        this._dialog().nativeElement.close();
    }

    protected step(by: number): void {
        const n = this.photos().length;
        this.current.update(i => (i === null ? null : (i + by + n) % n));
    }

    protected onKey(event: KeyboardEvent): void {
        if (event.key === 'ArrowRight') this.step(1);
        else if (event.key === 'ArrowLeft') this.step(-1);
    }

    /** A click on the dialog itself (not its content) is a click on the backdrop. */
    protected onBackdrop(event: MouseEvent): void {
        if (event.target === this._dialog().nativeElement) this.close();
    }
}
