import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideChevronRight } from '@ng-icons/lucide';

import { SeoService } from '@core/seo/seo.service';
import { TakaPipe } from '@shared/pipes/taka.pipe';

import { PublicContentService, vatNote } from '../public-content.service';
import { PublicSiteService } from '../public-site.service';

/**
 * `/plans`: every plan, compared across branches (H7). A period switch picks the column set; each row is a tier,
 * each column a branch. Prerendered; JSON-LD lists each plan at each branch as an `Offer`.
 */
@Component({
    selector: 'app-plans-page',
    imports: [RouterLink, NgIcon, TakaPipe],
    viewProviders: [provideIcons({ lucideCheck, lucideChevronRight })],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'block' },
    template: `
        <div class="wrap pt-6 text-center lg:pt-12">
            <nav class="flex items-center justify-center gap-1.5 text-sm text-white/60" aria-label="Breadcrumb">
                <a class="hover:text-white" routerLink="/">Home</a>
                <ng-icon aria-hidden="true" name="lucideChevronRight" />
                <span aria-current="page">Plans</span>
            </nav>
            <h1 class="mt-4 text-[2rem] leading-tight font-extrabold lg:text-title">Membership <span class="text-primary-500">Plans</span></h1>
            <p class="section-lead">Compare prices at every branch. Pay at the front desk in cash, by card, bKash or Nagad.</p>
            <div class="mt-6 inline-flex flex-wrap justify-center gap-1 rounded-full bg-ink-800 p-1" aria-label="Billing period" role="radiogroup">
                @for (p of periods; track p.id) {
                    <button
                        class="rounded-full px-4 py-2 text-sm font-medium transition"
                        role="radio"
                        type="button"
                        [attr.aria-checked]="p.id === period()"
                        [class.bg-primary-500]="p.id === period()"
                        [class.text-white]="p.id === period()"
                        [class.text-white/70]="p.id !== period()"
                        (click)="period.set(p.id)"
                    >
                        {{ p.label }}
                    </button>
                }
            </div>
        </div>

        <div class="wrap mt-10 overflow-x-auto">
            <table class="w-full min-w-[40rem] border-separate border-spacing-0 overflow-hidden rounded-lg bg-ink-800 text-left">
                <caption class="sr-only">Plan prices by branch, {{ periodLabel() }}</caption>
                <thead>
                    <tr>
                        <th class="border-b border-white/10 p-4 text-sm font-medium text-white/60" scope="col">Plan</th>
                        @for (b of byBranch(); track b.branch.slug) {
                            <th class="border-b border-white/10 p-4 text-sm font-semibold" scope="col">
                                @if (branchPages()) {
                                    <a class="hover:text-primary-400" [routerLink]="['/branches', b.branch.slug]">{{ b.branch.name }}</a>
                                } @else {
                                    {{ b.branch.name }}
                                }
                            </th>
                        }
                    </tr>
                </thead>
                <tbody>
                    @for (tier of tiers; track tier.id) {
                        <tr>
                            <th class="border-b border-white/10 p-4 align-top" scope="row">
                                <span class="block font-semibold">{{ tier.name }}</span>
                                <span class="block text-xs font-normal text-white/60">{{ tier.kicker }}</span>
                            </th>
                            @for (b of byBranch(); track b.branch.slug) {
                                <td class="border-b border-white/10 p-4 align-top">
                                    @if (price(b.plans, tier.id); as amount) {
                                        <span class="text-lg font-semibold">{{ amount | taka: 0 }}</span>
                                    } @else {
                                        <span class="text-white/40">Not offered</span>
                                    }
                                </td>
                            }
                        </tr>
                    }
                </tbody>
            </table>
            <p class="mt-3 text-sm text-white/60">{{ vatText() }} New members pay a one-time admission fee at their branch.</p>
        </div>

        <ul class="wrap mt-12 grid gap-6 md:grid-cols-3">
            @for (tier of tiers; track tier.id) {
                <li class="rounded-lg bg-ink-800 p-6">
                    <h2 class="text-h1 font-semibold">{{ tier.name }}</h2>
                    <p class="mt-2 text-sm text-white/70">{{ tier.description }}</p>
                    <ul class="mt-4 flex flex-col gap-2 text-sm">
                        @for (f of tier.features ?? []; track f) {
                            <li class="flex gap-2"><ng-icon class="mt-0.5 shrink-0 text-primary-400" aria-hidden="true" name="lucideCheck" />{{ f }}</li>
                        }
                    </ul>
                    <a class="btn btn-md btn-fill-primary mt-6 w-full" routerLink="/join" [queryParams]="{ plan: tier.id }">Choose {{ tier.name }}</a>
                </li>
            }
        </ul>
    `
})
export class PlansPageComponent {
    private readonly _site = inject(PublicSiteService);

    protected readonly periods = this._site.c.plans.periods;
    /** Branch pages can be switched off; then branch names are plain text. */
    protected readonly branchPages = computed(() => this._site.pageEnabled('branches'));
    protected readonly tiers = this._site.plans;
    protected readonly period = signal(this.periods[0]?.id ?? 'monthly');
    protected readonly byBranch = toSignal(inject(PublicContentService).plans(), { initialValue: [] });
    protected readonly vatText = computed(() => vatNote(this.byBranch()[0]?.vat_rate, this.byBranch()[0]?.vat_inclusive));
    protected readonly periodLabel = computed(() => this.periods.find(p => p.id === this.period())?.label ?? '');

    constructor() {
        const brand = this._site.brand;
        inject(SeoService).update({
            path: '/plans',
            title: `Membership plans and prices | ${brand}`,
            description: `Compare ${brand} membership prices at every branch: Single, Duo and Group plans, monthly to annual.`,
            jsonLd: {
                '@context': 'https://schema.org',
                '@type': 'OfferCatalog',
                name: `${brand} membership plans`,
                itemListElement: this.tiers.flatMap(t =>
                    this.periods
                        .filter(p => t.prices[p.id] !== undefined)
                        .map(p => ({ '@type': 'Offer', name: `${t.name} · ${p.label}`, price: t.prices[p.id], priceCurrency: 'BDT' }))
                )
            }
        });
    }

    protected price(plans: { tier: string; period: string; price: number }[], tier: string): number | null {
        return plans.find(p => p.tier === tier && p.period === this.period())?.price ?? null;
    }
}
