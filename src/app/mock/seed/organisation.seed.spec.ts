import { TENANT } from '@config/tenant';

import { openingHours, seedBranches } from './organisation.seed';

/** The check-in rules and the public site read one set of hours: the brand config. */
describe('branch hours', () => {
    const site = TENANT.landing?.branches.items ?? [];

    it.each(site.map(b => [b.name, b]))('%s: check-in hours are the opening hours the site shows', (_name, b) => {
        const shown = b.hours[0].sessions.flatMap(s => s.ranges.map(([open, close]) => `${s.days} ${open}-${close}`));
        const rules = openingHours(b.name);
        expect(rules.map(h => `${h.open}-${h.close}`)).toEqual(shown.map(s => s.split(' ')[1]));
        // Every weekday has exactly one opening range.
        for (let wd = 0; wd < 7; wd++) expect(rules.filter(h => h.days.includes(wd))).toHaveLength(1);
    });

    it('the branch records carry the same hours', () => {
        for (const b of seedBranches().filter(x => x.kind === 'BRANCH')) {
            expect(b.hours.map(h => `${h.open}-${h.close}`)).toEqual(openingHours(b.name).map(h => `${h.open}-${h.close}`));
            expect(b.ladies_hours.length).toBeGreaterThan(0);
        }
    });
});
