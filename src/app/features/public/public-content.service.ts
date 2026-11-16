import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';
import { catchError, defer, map, Observable, of, shareReplay, timeout } from 'rxjs';

import { TENANT } from '@config/tenant';
import { NOTIFY, SKIP_AUTH } from '@core/http/http-context.tokens';
import { API_INTERNAL_URL } from '@core/http/interceptors/server-api.interceptor';
import type { ApiResponse } from '@core/models/api-response.model';
import type { Branch, BranchRef } from '@core/models/branch.model';
import type { ClassSession, Trainer } from '@core/models/class.model';
import type { Plan } from '@core/models/plan.model';
import { type SiteGroup, vatPercent } from '@core/models/settings.model';
import { environment } from '@env/environment';

import { slug } from './public-site.service';

export type PublicBranch = Branch & { trainers: Trainer[] };
export interface BranchPlans {
    branch: BranchRef;
    plans: Plan[];
    /** The VAT rate in force (HQ setting). Absent in the config fallback, where the rate is not known. */
    vat_rate?: number;
}

/** The line under public prices: depends on the HQ VAT setting, which a prerendered page may not know. */
export function vatNote(rate: number | undefined): string {
    if (rate === undefined) return 'Prices exclude VAT.';
    return rate > 0 ? `Prices exclude VAT (${vatPercent(rate)} %).` : 'Prices include everything: no VAT is added.';
}

const quiet = (): HttpContext => new HttpContext().set(SKIP_AUTH, true).set(NOTIFY, 'none');

/**
 * Data for the public gym pages from the public API (`/v1/public/*`), with the brand config as the fallback.
 *
 * Pages are prerendered at build time (Cloudflare, D-026). The demo build answers from the mock; a production build
 * before the API exists (phase 2) has nothing to call, so the pages fall back to the config's branches and plan
 * prices and still render complete, indexable HTML. The transfer cache hands prerendered responses to the browser.
 */
@Injectable({ providedIn: 'root' })
export class PublicContentService {
    private readonly _http = inject(HttpClient);
    private readonly _base = `${environment.apiBaseUrl}/v1/public`;
    /**
     * Is there an API to ask? In the browser, yes. On the server only with the mock or an internal API address:
     * a Cloudflare prerender has no API (a relative `/api` call would reach the prerender server itself).
     */
    private readonly _api = isPlatformBrowser(inject(PLATFORM_ID)) || environment.useMockApi || !!inject(API_INTERNAL_URL);

    /**
     * The site groups' section and page switches HQ sets (D-040), or null when there is no API to ask or it does not
     * answer: the site then keeps the brand config's sections and every page. One request per app instance (the
     * public layout and the page guards share it).
     */
    private readonly _groups$ = defer(() =>
        this._api
            ? this._http.get<ApiResponse<SiteGroup[]>>(`${this._base}/site-groups`, { context: quiet() }).pipe(
                  timeout(5000),
                  map(r => r.data),
                  catchError(() => of(null))
              )
            : of(null)
    ).pipe(shareReplay(1));

    branch(slugValue: string): Observable<PublicBranch | null> {
        if (!this._api) return of(configBranch(slugValue));
        return this._http.get<ApiResponse<PublicBranch>>(`${this._base}/branches/${slugValue}`, { context: quiet() }).pipe(
            timeout(5000),
            map(r => r.data),
            catchError(() => of(configBranch(slugValue)))
        );
    }

    plans(branchSlug = ''): Observable<BranchPlans[]> {
        if (!this._api) return of(configPlans(branchSlug));
        return this._http.get<ApiResponse<BranchPlans[]>>(`${this._base}/plans`, { params: branchSlug ? { branch: branchSlug } : {}, context: quiet() }).pipe(
            timeout(5000),
            map(r => r.data),
            catchError(() => of(configPlans(branchSlug)))
        );
    }

    siteGroups(): Observable<SiteGroup[] | null> {
        return this._groups$;
    }

    classes(branchSlug: string): Observable<{ from: string; to: string; sessions: ClassSession[] } | null> {
        return this._http.get<ApiResponse<{ from: string; to: string; sessions: ClassSession[] }>>(`${this._base}/classes`, { params: { branch: branchSlug }, context: quiet() }).pipe(
            map(r => r.data),
            catchError(() => of(null))
        );
    }

    enquire(body: { branch: string; name: string; phone: string; message: string }): Observable<string> {
        return this._http.post<ApiResponse<unknown>>(`${this._base}/enquiries`, body, { context: new HttpContext().set(SKIP_AUTH, true).set(NOTIFY, 'errors') }).pipe(map(r => r.message));
    }
}

/* ---------- fallback: the brand config ---------- */

function configBranch(slugValue: string): PublicBranch | null {
    const items = TENANT.landing?.branches.items ?? [];
    const b = items.find(x => slug(x.name) === slugValue);
    if (!b) return null;
    return {
        oid: slugValue,
        code: b.name.slice(0, 3).toUpperCase(),
        slug: slugValue,
        name: b.name,
        kind: 'BRANCH',
        address: b.address,
        area: b.name,
        phone: '',
        email: '',
        capacity: 0,
        opened_on: '',
        facilities: TENANT.landing?.facilities.items.map(f => f.name) ?? [],
        dues_limit: 0,
        hours: [],
        ladies_hours: [],
        map_url: `https://maps.google.com/?q=${encodeURIComponent(b.address)}`,
        trainers: []
    };
}

function configPlans(branchSlug: string): BranchPlans[] {
    const cfg = TENANT.landing?.plans;
    const items = TENANT.landing?.branches.items ?? [];
    return items
        .filter(b => !branchSlug || slug(b.name) === branchSlug)
        .map(b => ({
            branch: { oid: slug(b.name), code: b.name.slice(0, 3).toUpperCase(), slug: slug(b.name), name: b.name, kind: 'BRANCH' as const },
            plans: (cfg?.items ?? []).flatMap(tier =>
                (cfg?.periods ?? [])
                    .filter(p => tier.prices[p.id] !== undefined)
                    .map(p => ({
                        oid: `${tier.id}-${p.id}`,
                        branch_oid: slug(b.name),
                        template_oid: `${tier.id}-${p.id}`,
                        code: '',
                        name: `${tier.name} · ${p.label}`,
                        tier: tier.id,
                        tier_name: tier.name,
                        period: p.id,
                        period_label: p.label,
                        months: p.months,
                        price: tier.prices[p.id],
                        admission_fee: 0,
                        persons: 1,
                        features: tier.features ?? [],
                        featured: !!tier.featured,
                        active: true
                    }))
            )
        }));
}
