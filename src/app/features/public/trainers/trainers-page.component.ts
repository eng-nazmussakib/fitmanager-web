import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMapPin, lucideMoveRight } from '@ng-icons/lucide';

import { SeoService } from '@core/seo/seo.service';
import { RevealDirective } from '@shared/directives/reveal.directive';

import { PublicContentService } from '../public-content.service';
import { PublicSiteService, slug } from '../public-site.service';
import { PageIntroComponent } from '../shared/page-intro.component';

/**
 * `/trainers`: every trainer with photo, branch, specialties and a short bio. Prerendered from the brand config; in
 * the browser the list comes from the API (D-078: every public trainer of every branch), each card linking to the
 * trainer's own page. Each card's id is the trainer's slug, so `/trainers#sam-cole` lands on it.
 */
@Component({
    selector: 'app-trainers-page',
    imports: [RouterLink, NgIcon, RevealDirective, PageIntroComponent],
    viewProviders: [provideIcons({ lucideMapPin, lucideMoveRight })],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'block' },
    template: `
        <app-page-intro [crumb]="c.trainers.accent" [page]="c.trainers.page" />

        @if (live.value(); as list) {
            <ul class="wrap mt-10 grid gap-6 sm:grid-cols-2 lg:mt-14 lg:grid-cols-4 lg:gap-8">
                @for (t of list; track t.oid; let i = $index) {
                    <li class="trainer-card lift group flex scroll-mt-28 flex-col" appReveal [id]="t.slug" [revealDelay]="(i % 4) * 90">
                        <a class="flex flex-1 flex-col no-underline" [routerLink]="['/trainers', t.slug]">
                            <div class="overflow-hidden">
                                <div class="relative aspect-[280/284] bg-white/5 transition duration-700 group-hover:scale-105">
                                    @if (t.photo_url) {
                                        <img class="size-full object-cover" height="284" width="280" [alt]="t.name" [src]="t.photo_url" />
                                    } @else {
                                        <span class="flex size-full items-center justify-center text-5xl font-semibold text-white/40" aria-hidden="true">{{ initials(t.name) }}</span>
                                    }
                                </div>
                            </div>
                            <div class="flex flex-1 flex-col p-4 lg:p-5">
                                <h2 class="text-h1 font-semibold">{{ t.name }}</h2>
                                <p class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/60">
                                    {{ t.headline }}
                                    @if (t.branch_name) {
                                        <span class="flex items-center gap-1">
                                            <ng-icon class="text-primary-400" aria-hidden="true" name="lucideMapPin" />
                                            {{ t.branch_name }}
                                        </span>
                                    }
                                </p>
                                @if (t.specialties.length) {
                                    <ul class="mt-3 flex flex-wrap gap-1.5" aria-label="Specialties">
                                        @for (s of t.specialties; track s) {
                                            <li class="tag">{{ s }}</li>
                                        }
                                    </ul>
                                }
                                <span class="service-link mt-auto pt-4">
                                    Classes and profile
                                    <ng-icon class="text-primary-500" aria-hidden="true" name="lucideMoveRight" />
                                </span>
                            </div>
                        </a>
                    </li>
                }
            </ul>
        } @else {
        <ul class="wrap mt-10 grid gap-6 sm:grid-cols-2 lg:mt-14 lg:grid-cols-4 lg:gap-8">
            @for (t of c.trainers.items; track t.name; let i = $index) {
                <li class="trainer-card lift group flex scroll-mt-28 flex-col" appReveal [id]="slug(t.name)" [revealDelay]="(i % 4) * 90">
                    <div class="overflow-hidden">
                        <div class="relative aspect-[280/284] transition duration-700 group-hover:scale-105">
                            <img class="size-full object-cover" height="284" width="280" [alt]="t.image.alt" [src]="t.image.src" />
                            @if (t.image.tint) {
                                <span class="photo-tint" [style.--tint-mask]="'url(' + t.image.tint + ')'"></span>
                            }
                        </div>
                    </div>
                    <div class="flex flex-1 flex-col p-4 lg:p-5">
                        <h2 class="text-h1 font-semibold">{{ t.name }}</h2>
                        <p class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/60">
                            {{ t.role }}
                            @if (t.branch) {
                                <span class="flex items-center gap-1">
                                    <ng-icon class="text-primary-400" aria-hidden="true" name="lucideMapPin" />
                                    {{ t.branch }}
                                </span>
                            }
                        </p>
                        @if (t.specialties?.length) {
                            <ul class="mt-3 flex flex-wrap gap-1.5" aria-label="Specialties">
                                @for (s of t.specialties; track s) {
                                    <li class="tag">{{ s }}</li>
                                }
                            </ul>
                        }
                        @if (t.bio) {
                            <p class="mt-3 text-sm leading-relaxed text-white/80">{{ t.bio }}</p>
                        }
                        <a class="service-link mt-auto pt-4" routerLink="/" fragment="branches">
                            Book at the front desk
                            <ng-icon class="text-primary-500" aria-hidden="true" name="lucideMoveRight" />
                        </a>
                    </div>
                </li>
            }
        </ul>
        }
    `
})
export class TrainersPageComponent {
    private readonly _site = inject(PublicSiteService);

    protected readonly c = this._site.c;
    protected readonly slug = slug;
    private readonly _content = inject(PublicContentService);
    protected readonly live = rxResource({ stream: () => this._content.trainers() });

    constructor() {
        const page = this.c.trainers.page;
        inject(SeoService).update({
            path: '/trainers',
            title: `${page.seo.title} | ${this._site.brand}`,
            description: page.seo.description,
            jsonLd: {
                '@context': 'https://schema.org',
                '@type': 'ItemList',
                name: page.seo.title,
                itemListElement: this.c.trainers.items.map((t, i) => ({
                    '@type': 'ListItem',
                    position: i + 1,
                    item: {
                        '@type': 'Person',
                        name: t.name,
                        jobTitle: t.role,
                        knowsAbout: t.specialties,
                        worksFor: { '@type': 'ExerciseGym', name: t.branch ? `${this._site.brand} ${t.branch}` : this._site.brand }
                    }
                }))
            }
        });
    }
    protected initials(name: string): string {
        return name
            .split(/\s+/)
            .map(w => w[0] ?? '')
            .join('')
            .slice(0, 2);
    }
}
