import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCalendarDays, lucideChevronRight, lucideClock, lucideExternalLink, lucideMapPin, lucidePhone, lucideUsers } from '@ng-icons/lucide';
import { switchMap } from 'rxjs';

import { SeoService } from '@core/seo/seo.service';
import { RevealDirective } from '@shared/directives/reveal.directive';
import { TakaPipe } from '@shared/pipes/taka.pipe';

import { PublicContentService, vatNote } from '../public-content.service';
import { openingHoursSpec, PublicSiteService, slug as toSlug } from '../public-site.service';
import { ClassTimetableComponent } from './class-timetable.component';

/**
 * `/branches/:slug`: one branch (H7). Prerendered per branch; the weekly class timetable changes every week, so it
 * loads in the browser when it scrolls into view (`@defer`). JSON-LD: an `ExerciseGym` with its address, opening
 * hours and an `Offer` per plan.
 */
@Component({
    selector: 'app-branch-page',
    imports: [RouterLink, NgIcon, RevealDirective, TakaPipe, ClassTimetableComponent],
    viewProviders: [provideIcons({ lucideCalendarDays, lucideChevronRight, lucideClock, lucideExternalLink, lucideMapPin, lucidePhone, lucideUsers })],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'block' },
    template: `
        @if (branch(); as b) {
            <div class="wrap pt-6 lg:pt-12">
                <nav class="flex items-center gap-1.5 text-sm text-white/60" aria-label="Breadcrumb">
                    <a class="hover:text-white" routerLink="/">Home</a>
                    <ng-icon aria-hidden="true" name="lucideChevronRight" />
                    <a class="hover:text-white" fragment="branches" routerLink="/">Branches</a>
                    <ng-icon aria-hidden="true" name="lucideChevronRight" />
                    <span aria-current="page">{{ b.name }}</span>
                </nav>
                <div class="mt-4 flex flex-wrap items-end justify-between gap-6">
                    <div>
                        <h1 class="text-[2rem] leading-tight font-extrabold lg:text-title">
                            {{ brand }} <span class="text-primary-500">{{ b.name }}</span>
                        </h1>
                        <p class="mt-2 flex items-center gap-2 text-white/75"><ng-icon class="text-primary-400" aria-hidden="true" name="lucideMapPin" />{{ b.address }}</p>
                    </div>
                    <div class="flex flex-wrap gap-3">
                        <a class="btn btn-lg btn-fill-primary" routerLink="/join" [queryParams]="{ branch: b.slug }">Join {{ b.name }}</a>
                        <a class="btn btn-lg btn-outline-secondary" rel="noopener" target="_blank" [href]="b.map_url">Directions <ng-icon aria-hidden="true" name="lucideExternalLink" /></a>
                    </div>
                </div>
            </div>

            @if (photos().length) {
                <ul class="wrap mt-8 grid gap-3 sm:grid-cols-3" aria-label="Photos of the branch">
                    @for (p of photos(); track p.src; let i = $index) {
                        <li class="overflow-hidden rounded-lg" appReveal [revealDelay]="i * 90">
                            <img class="aspect-[3/2] w-full object-cover" [alt]="p.alt" [attr.fetchpriority]="i === 0 ? 'high' : null" [height]="p.height" [src]="p.src" [width]="p.width" />
                        </li>
                    }
                </ul>
            }

            <section class="wrap mt-12 grid gap-6 lg:grid-cols-3" aria-label="Opening hours and contact">
                <div class="rounded-lg bg-ink-800 p-5 shadow-e4 lg:col-span-2">
                    <h2 class="flex items-center gap-2 text-h2 font-semibold"><ng-icon class="text-primary-400" aria-hidden="true" name="lucideClock" />Opening hours</h2>
                    <dl class="mt-4 grid gap-4 sm:grid-cols-3">
                        @for (block of timetable(); track block.title) {
                            <div>
                                <dt class="text-sm font-semibold text-white">{{ block.title }}</dt>
                                @for (row of block.rows; track row.days) {
                                    <dd class="mt-1.5 text-sm text-white/85"><span class="font-medium text-white">{{ row.days }}:</span> {{ row.times }}</dd>
                                }
                            </div>
                        }
                    </dl>
                </div>
                <div class="rounded-lg bg-ink-800 p-5 shadow-e4">
                    <h2 class="text-h2 font-semibold">Facilities</h2>
                    <ul class="mt-4 flex flex-wrap gap-2">
                        @for (f of b.facilities; track f) {
                            <li class="tag">{{ f }}</li>
                        }
                    </ul>
                    @if (b.phone) {
                        <a class="mt-5 flex items-center gap-2 text-white/85 hover:text-white" [href]="'tel:' + b.phone"><ng-icon class="text-primary-400" aria-hidden="true" name="lucidePhone" />{{ b.phone }}</a>
                    }
                </div>
            </section>

            @if (tiers().length) {
                <section class="wrap mt-16" aria-labelledby="plans-title">
                    <h2 id="plans-title" class="text-center text-[1.75rem] font-extrabold lg:text-[2.25rem]">Plans at <span class="text-primary-500">{{ b.name }}</span></h2>
                    <ul class="mt-8 grid gap-6 md:grid-cols-3">
                        @for (t of tiers(); track t.tier) {
                            <li class="lift flex flex-col rounded-lg bg-ink-800 p-6 shadow-e4" [class.ring-2]="t.featured" [class.ring-primary-500]="t.featured">
                                <h3 class="text-h1 font-semibold">{{ t.name }}</h3>
                                <ul class="mt-4 flex flex-col gap-2">
                                    @for (p of t.plans; track p.oid) {
                                        <li class="flex items-baseline justify-between gap-3 border-b border-white/10 pb-2 text-sm">
                                            <span class="text-white/75">{{ p.period_label }}</span>
                                            <span class="text-lg font-semibold">{{ p.price | taka: 0 }}</span>
                                        </li>
                                    }
                                </ul>
                                <a class="btn btn-md btn-fill-primary mt-auto pt-0" routerLink="/join" [queryParams]="{ branch: b.slug, plan: t.tier }" [style.margin-top.rem]="1.25">Choose {{ t.name }}</a>
                            </li>
                        }
                    </ul>
                    <p class="mt-4 text-center text-sm text-white/60">{{ vatText() }} An admission fee applies to new members. @if (plansPage()) {<a class="underline hover:text-white" routerLink="/plans">Compare branches</a>}</p>
                </section>
            }

            <section class="wrap mt-16" aria-labelledby="timetable-title">
                <h2 id="timetable-title" class="flex items-center gap-2 text-h1 font-semibold"><ng-icon class="text-primary-400" aria-hidden="true" name="lucideCalendarDays" />This week's classes</h2>
                @defer (on viewport) {
                    <app-class-timetable class="mt-5 block" [branchSlug]="b.slug" />
                } @placeholder {
                    <p class="mt-5 text-white/60">The timetable loads here.</p>
                }
            </section>

            @if (b.trainers.length) {
                <section class="wrap mt-16" aria-labelledby="trainers-title">
                    <h2 id="trainers-title" class="flex items-center gap-2 text-h1 font-semibold"><ng-icon class="text-primary-400" aria-hidden="true" name="lucideUsers" />Trainers</h2>
                    <ul class="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        @for (t of b.trainers; track t.oid) {
                            <li class="rounded-lg bg-ink-800 p-4">
                                <p class="font-semibold">{{ t.name }}</p>
                                <p class="mt-1 text-sm text-white/60">{{ t.specialties.join(' · ') }}</p>
                            </li>
                        }
                    </ul>
                </section>
            }
        } @else if (loaded()) {
            <div class="wrap py-24 text-center">
                <h1 class="text-h1 font-semibold">Branch not found</h1>
                <a class="btn btn-md btn-fill-primary mt-6" fragment="branches" routerLink="/">See all branches</a>
            </div>
        }
    `
})
export class BranchPageComponent {
    private readonly _site = inject(PublicSiteService);
    private readonly _content = inject(PublicContentService);
    private readonly _seo = inject(SeoService);
    private readonly _title = inject(Title);

    readonly slug = input.required<string>();

    protected readonly brand = this._site.brand;
    /** The plans page can be switched off (D-040); then the "Compare branches" link goes. */
    protected readonly plansPage = computed(() => this._site.pageEnabled('plans'));
    private readonly _branch = toSignal(toObservable(this.slug).pipe(switchMap(s => this._content.branch(s))));
    private readonly _plans = toSignal(toObservable(this.slug).pipe(switchMap(s => this._content.plans(s))), { initialValue: [] });

    protected readonly branch = computed(() => this._branch() ?? null);
    protected readonly loaded = computed(() => this._branch() !== undefined);
    protected readonly photos = computed(() => this._site.c.gallery.items.filter(g => toSlug(g.category) === this.slug()).slice(0, 3));
    /** The branch's entry in the brand config: its opening, ladies-only and combined hours. */
    private readonly _siteBranch = computed(() => this._site.branches.find(b => toSlug(b.name) === this.slug()));
    protected readonly timetable = computed(() => this._siteBranch()?.timetable ?? []);
    protected readonly vatText = computed(() => vatNote(this._plans()[0]?.vat_rate));
    /** The branch's plans grouped by tier (Single, Duo, Group), periods in order. */
    protected readonly tiers = computed(() => {
        const plans = this._plans()[0]?.plans ?? [];
        const tiers = new Map<string, { tier: string; name: string; featured: boolean; plans: typeof plans }>();
        for (const p of plans) {
            const t = tiers.get(p.tier) ?? { tier: p.tier, name: p.tier_name, featured: p.featured, plans: [] };
            t.plans.push(p);
            tiers.set(p.tier, t);
        }
        return [...tiers.values()];
    });

    constructor() {
        effect(() => {
            const b = this.branch();
            if (!b) return;
            const plans = this._plans()[0]?.plans ?? [];
            const title = `${this.brand} ${b.name}: gym in ${b.area}, Dhaka`;
            this._title.setTitle(title);
            this._seo.update({
                path: `/branches/${b.slug}`,
                title,
                description: `${this.brand} ${b.name} at ${b.address}. Opening hours, facilities, membership plans and this week's classes.`,
                jsonLd: {
                    '@context': 'https://schema.org',
                    '@type': 'ExerciseGym',
                    name: `${this.brand} ${b.name}`,
                    address: { '@type': 'PostalAddress', streetAddress: b.address, addressLocality: 'Dhaka', addressCountry: 'BD' },
                    telephone: b.phone || undefined,
                    // The hours the page shows, from the brand config: never a second copy.
                    openingHoursSpecification: openingHoursSpec(this._siteBranch()?.hours ?? []),
                    amenityFeature: b.facilities.map(f => ({ '@type': 'LocationFeatureSpecification', name: f, value: true })),
                    makesOffer: plans.map(p => ({ '@type': 'Offer', name: p.name, price: p.price, priceCurrency: 'BDT' }))
                }
            });
        });
    }
}
