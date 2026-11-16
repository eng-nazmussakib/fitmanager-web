import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
    lucideArrowLeft,
    lucideArrowRight,
    lucideBike,
    lucideCalendar,
    lucideChevronDown,
    lucideChevronRight,
    lucideCircleCheck,
    lucideClock,
    lucideDumbbell,
    lucideFlame,
    lucideHeartPulse,
    lucideMapPin,
    lucideMoveRight,
    lucideNewspaper,
    lucideQuote,
    lucideShowerHead,
    lucideSmile,
    lucideSquareParking,
    lucideStar,
    lucideTrophy,
    lucideUsers,
    lucideVenus,
    lucideWaves
} from '@ng-icons/lucide';

import type { BadgeIcon, FacilityIcon, PageLink } from '@config/tenant.model';
import { APP } from '@core/constants/app.constants';
import { SeoService } from '@core/seo/seo.service';
import { TenantService } from '@core/tenant/tenant.service';
import { CountUpDirective } from '@shared/directives/count-up.directive';
import { RevealDirective } from '@shared/directives/reveal.directive';
import { ScrollPagerDirective } from '@shared/directives/scroll-pager.directive';
import { TakaPipe } from '@shared/pipes/taka.pipe';

import { LinkTarget, openingHoursSpec, Plan, PlanQuote, planQuote, postalAddress, PublicSiteService, slug } from '../public-site.service';
import { PromoDialogComponent } from '../shared/promo-dialog.component';

/** A plan card: a plan at the selected period, or (single plan) the plan at one period. */
interface PlanCard {
    key: string;
    kicker?: string;
    title: string;
    description?: string;
    features?: string[];
    quote: PlanQuote | null;
    showPerMonth: boolean;
    missing: string;
    featured: boolean;
    badge?: string;
    query: { plan: string; period: string };
}

const BADGE_ICONS: Record<BadgeIcon, string> = {
    trophy: 'lucideTrophy',
    flame: 'lucideFlame',
    smile: 'lucideSmile',
    users: 'lucideUsers',
    dumbbell: 'lucideDumbbell',
    star: 'lucideStar'
};

const FACILITY_ICONS: Record<FacilityIcon, string> = {
    dumbbell: 'lucideDumbbell',
    heartPulse: 'lucideHeartPulse',
    users: 'lucideUsers',
    venus: 'lucideVenus',
    showerHead: 'lucideShowerHead',
    parking: 'lucideSquareParking',
    bike: 'lucideBike',
    waves: 'lucideWaves',
    flame: 'lucideFlame',
    clock: 'lucideClock'
};

/**
 * Public landing page (`/`), inside the public layout (header, footer). Everything on it (text, images, links, which
 * sections show and in what order) comes from the brand config, `src/app/config/tenant.ts`, through PublicSiteService;
 * its colours from the active theme. Sections: hero, stats, services, plans, facilities, reviews, trainers, blog,
 * branches, gallery, FAQ. No browser globals at render time, so it is safe for server-side rendering.
 */
@Component({
    selector: 'app-landing',
    imports: [RouterLink, NgIcon, NgTemplateOutlet, TakaPipe, ScrollPagerDirective, RevealDirective, CountUpDirective, PromoDialogComponent],
    viewProviders: [
        provideIcons({
            lucideArrowLeft,
            lucideArrowRight,
            lucideBike,
            lucideCalendar,
            lucideChevronDown,
            lucideChevronRight,
            lucideCircleCheck,
            lucideClock,
            lucideDumbbell,
            lucideFlame,
            lucideHeartPulse,
            lucideMapPin,
            lucideMoveRight,
            lucideNewspaper,
            lucideQuote,
            lucideShowerHead,
            lucideSmile,
            lucideSquareParking,
            lucideStar,
            lucideTrophy,
            lucideUsers,
            lucideVenus,
            lucideWaves
        })
    ],
    templateUrl: './landing.component.html',
    styleUrl: './landing.component.css',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'block' }
})
export class LandingComponent {
    protected readonly site = inject(PublicSiteService);
    protected readonly c = this.site.c;
    protected readonly brand = this.site.brand;
    protected readonly slug = slug;
    protected readonly badgeIcons = BADGE_ICONS;
    protected readonly loginRoute = APP.LOGIN_ROUTE;

    protected readonly facilities = this.c.facilities.items.map(f => ({ ...f, icon: FACILITY_ICONS[f.icon] }));
    protected readonly branches = this.site.branches;
    protected readonly branchHeading = this.site.branchHeading;
    protected readonly galleryPreview = this.c.gallery.items.slice(0, this.c.gallery.preview ?? 6);

    /** Plans layout: a card per plan (switch: period), or a card per period (switch: plan). */
    protected readonly planMode = this.site.planLayout;
    protected readonly plans = this.site.plans;
    /** The selected billing period (id): the switch in the `plans` layout. */
    protected readonly period = signal(this.c.plans.periods[0]?.id ?? '');
    protected readonly periodConfig = computed(() => this.c.plans.periods.find(p => p.id === this.period()) ?? this.c.plans.periods[0]);
    /** The selected plan (id): the switch in the `periods` layout. */
    protected readonly planId = signal((this.plans.find(p => p.featured) ?? this.plans[0])?.id ?? '');
    protected readonly selectedPlan = computed<Plan | undefined>(() => this.plans.find(p => p.id === this.planId()) ?? this.plans[0]);
    /** The switch above the cards: periods, or plans; none when there is only one option. */
    protected readonly planSwitch = computed(() => {
        const byPlan = this.planMode === 'periods';
        const options = byPlan ? this.plans.map(p => ({ id: p.id, label: p.name })) : this.c.plans.periods.map(p => ({ id: p.id, label: p.label }));
        return options.length > 1 ? { label: byPlan ? 'Plan' : 'Billing period', options, value: byPlan ? this.planId() : this.period() } : null;
    });
    /** The cards, whichever the layout. */
    protected readonly planCards = computed<PlanCard[]>(() => {
        const plans = this.c.plans;
        if (this.planMode === 'plans') {
            const period = this.periodConfig();
            return this.plans.map(p => ({
                key: p.id,
                kicker: p.kicker ?? plans.kicker,
                title: p.name,
                description: p.description,
                features: p.features,
                quote: planQuote(p, period, plans.periods),
                showPerMonth: period.months > 1,
                missing: `Not available ${period.label.toLowerCase()}`,
                featured: !!p.featured,
                query: { plan: p.id, period: period.id }
            }));
        }
        const plan = this.selectedPlan();
        if (!plan) return [];
        const quotes = plans.periods.map(period => ({ period, quote: planQuote(plan, period, plans.periods) }));
        const best = plans.featuredPeriod ?? [...quotes].sort((a, b) => (b.quote?.savePercent ?? 0) - (a.quote?.savePercent ?? 0)).find(q => (q.quote?.savePercent ?? 0) > 0)?.period.id;
        return quotes.map(({ period, quote }) => ({
            key: period.id,
            title: period.label,
            quote,
            showPerMonth: period.months > 1,
            missing: 'Not available',
            featured: period.id === best,
            badge: period.id === best && !plans.featuredPeriod ? 'Best value' : undefined,
            query: { plan: plan.id, period: period.id }
        }));
    });

    protected readonly reviewIndex = signal(0);
    protected readonly activeReview = computed(() => this.c.reviews.items[this.reviewIndex()]);
    /** The other reviews, shown as narrow portraits next to the active one. */
    protected readonly otherReviews = computed(() => this.c.reviews.items.map((r, i) => ({ ...r, index: i })).filter(r => r.index !== this.reviewIndex()));

    constructor() {
        const c = this.c;
        const branches = c.branches.items;
        const seo = inject(SeoService);
        const tagline = inject(TenantService).brand.tagline;
        // Again when the section switches arrive (D-040): the FAQ structured data follows the FAQ section.
        effect(() => {
            const faq = this.site.enabled('faq');
            seo.update({
            path: '',
            title: `${c.seo.title} | ${this.brand}`,
            description: c.seo.description,
            jsonLd: {
                '@context': 'https://schema.org',
                '@graph': [
                    {
                        '@type': 'ExerciseGym',
                        name: this.brand,
                        slogan: tagline,
                        description: c.seo.description,
                        sameAs: c.footer.social.map(s => s.href),
                        makesOffer: this.plans.flatMap(p =>
                            c.plans.periods.flatMap(period =>
                                p.prices[period.id] === undefined
                                    ? []
                                    : [{ '@type': 'Offer', name: `${p.name} (${period.label})`, price: p.prices[period.id], priceCurrency: c.currency.code }]
                            )
                        ),
                        // One branch: its address and hours belong to the gym itself. Several: one department each.
                        ...(branches.length === 1
                            ? { address: postalAddress(branches[0]), openingHoursSpecification: openingHoursSpec(branches[0].hours) }
                            : {
                                  department: branches.map(b => ({
                                      '@type': 'ExerciseGym',
                                      name: `${this.brand} ${b.name}`,
                                      address: postalAddress(b),
                                      openingHoursSpecification: openingHoursSpec(b.hours)
                                  }))
                              })
                    },
                    ...(faq
                        ? [
                              {
                                  '@type': 'FAQPage',
                                  mainEntity: c.faq.items.map(f => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } }))
                              }
                          ]
                        : [])
                ]
            }
            });
        });
    }

    /** The switch above the plan cards: a period, or (periods layout) a plan. */
    protected selectPlanOption(id: string): void {
        if (this.planMode === 'periods') this.planId.set(id);
        else this.period.set(id);
    }

    /** Router path and fragment for a configured link. */
    protected to(link: PageLink): LinkTarget {
        return this.site.target(link);
    }

    protected prevReview(): void {
        const n = this.c.reviews.items.length;
        this.reviewIndex.update(i => (i - 1 + n) % n);
    }

    protected nextReview(): void {
        this.reviewIndex.update(i => (i + 1) % this.c.reviews.items.length);
    }
}
