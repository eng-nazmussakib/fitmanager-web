import { TENANT } from '@config/tenant';
import type { Branch } from '@core/models/branch.model';
import type { Plan, PlanTemplate } from '@core/models/plan.model';

/** Branch prices against the HQ template (Gulshan is the reference). Rounded to ৳50. */
const PRICE_FACTOR: Record<string, number> = { GUL: 1, DHA: 0.9, UTT: 0.85 };
const ADMISSION: Record<string, number> = { GUL: 2500, DHA: 2000, UTT: 2000 };
const PERSONS: Record<string, number> = { single: 1, duo: 2, group: 4 };

/**
 * HQ plan templates come from the public site's plan tiers × periods (src/app/config/tenant.ts), so the prices on
 * the landing page and at the front desk agree. Each branch sells every template at its own price.
 */
export function seedPlans(branches: Branch[]): { templates: PlanTemplate[]; plans: Plan[] } {
    const cfg = TENANT.landing?.plans;
    const tiers = cfg?.items ?? [];
    const periods = cfg?.periods ?? [];
    const templates: PlanTemplate[] = [];
    const plans: Plan[] = [];
    const sellers = branches.filter(b => b.kind === 'BRANCH');
    for (const tier of tiers) {
        for (const period of periods) {
            const base = tier.prices[period.id];
            if (!base) continue;
            const tplOid = `tpl-${tier.id}-${period.id}`;
            templates.push({
                oid: tplOid,
                tier: tier.id,
                tier_name: tier.name,
                period: period.id,
                period_label: period.label,
                months: period.months,
                base_price: base,
                persons: PERSONS[tier.id] ?? 1,
                features: tier.features ?? [],
                featured: !!tier.featured,
                freezable: true,
                kind: 'membership',
                sessions: null,
                sort_order: templates.length * 10,
                active: true,
                branches_using: sellers.length
            });
            for (const b of sellers) {
                plans.push({
                    oid: `pl-${b.code.toLowerCase()}-${tier.id}-${period.id}`,
                    branch_oid: b.oid,
                    template_oid: tplOid,
                    code: `${b.code}-${tier.id.slice(0, 3).toUpperCase()}-${period.months}M`,
                    name: `${tier.name} · ${period.label}`,
                    tier: tier.id,
                    tier_name: tier.name,
                    period: period.id,
                    period_label: period.label,
                    months: period.months,
                    price: Math.round((base * (PRICE_FACTOR[b.code] ?? 1)) / 50) * 50,
                    admission_fee: ADMISSION[b.code] ?? 2000,
                    persons: PERSONS[tier.id] ?? 1,
                    features: tier.features ?? [],
                    featured: !!tier.featured,
                    freezable: true,
                    kind: 'membership',
                    sessions: null,
                    active: true,
                    template_active: true,
                    sellable: true
                });
            }
        }
    }
    // PT packages (D-079), as the API's seed (005_scheduling.sql): sold with a membership, never on the public list.
    const pt: [string, string, number, number, number, string[]][] = [
        ['pt-1', '1 session', 1, 1, 1500, ['One hour with your trainer', 'Book a slot in the member portal']],
        ['pt-8', '8 sessions', 2, 8, 10000, ['Eight hours with your trainer', 'A routine built for you', 'Use within 2 months']],
        [
            'pt-16',
            '16 sessions',
            3,
            16,
            18000,
            ['Sixteen hours with your trainer', 'A routine built for you', 'Monthly body measurements', 'Use within 3 months']
        ]
    ];
    for (const [period, label, months, sessions, base, features] of pt) {
        const tplOid = `tpl-pt-${period}`;
        templates.push({
            oid: tplOid,
            tier: 'pt',
            tier_name: 'Personal training',
            period,
            period_label: label,
            months,
            base_price: base,
            persons: 1,
            features,
            featured: false,
            freezable: false,
            kind: 'pt',
            sessions,
            sort_order: 1000 + sessions,
            active: true,
            branches_using: sellers.length
        });
        for (const b of sellers)
            plans.push({
                oid: `pl-${b.code.toLowerCase()}-${period}`,
                branch_oid: b.oid,
                template_oid: tplOid,
                code: `${b.code}-PT-${sessions}`,
                name: `Personal training · ${label}`,
                tier: 'pt',
                tier_name: 'Personal training',
                period,
                period_label: label,
                months,
                price: Math.round((base * (PRICE_FACTOR[b.code] ?? 1)) / 50) * 50,
                admission_fee: 0,
                persons: 1,
                features,
                featured: false,
                freezable: false,
                kind: 'pt',
                sessions,
                active: true,
                template_active: true,
                sellable: true
            });
    }
    return { templates, plans };
}
