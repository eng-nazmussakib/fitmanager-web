import { addDaysIso, at } from './clock';
import { seed } from './seed';

const today = '2026-11-19';
const db = seed(today, 12 * 60);
const now = new Date(at(today, 12 * 60)).getTime();

/** Phase 7c (D-109), as seed 109: every case of the website's content is in the demo data. */
describe('the website in the demo data', () => {
    it('posts: five published, a draft, one scheduled and one deleted, each with a category and a cover', () => {
        const live = db.posts.filter(p => !p.deleted_at && p.published_at && new Date(p.published_at).getTime() <= now);
        expect(live).toHaveLength(5);
        expect(db.posts.filter(p => !p.published_at)).toHaveLength(1);
        expect(db.posts.filter(p => p.published_at && new Date(p.published_at).getTime() > now)).toHaveLength(1);
        expect(db.posts.filter(p => p.deleted_at)).toHaveLength(1);
        for (const p of live) {
            expect(db.postCategories.some(c => c.oid === p.category_oid)).toBe(true);
            expect(p.cover_url).toMatch(/^assets\//);
            expect(p.body).toMatch(/^## /m);
        }
    });

    it('photos: four per branch and one removed; every branch has a description', () => {
        for (const b of db.branches.filter(x => x.kind === 'BRANCH')) {
            expect(db.gallery.filter(g => g.branch_oid === b.oid && !g.deleted_at)).toHaveLength(4);
            expect(b.description?.length).toBeGreaterThan(40);
        }
        expect(db.gallery.filter(g => g.deleted_at)).toHaveLength(1);
    });

    it('offers: running (with and without a promo code), ended, not published; the codes exist', () => {
        const running = db.offers.filter(o => o.published && o.starts_on <= today && (!o.ends_on || o.ends_on >= today));
        expect(running.map(o => o.slug)).toEqual(['student-discount', 'refer-a-friend', 'no-admission-fee', 'company-teams']);
        expect(db.offers.find(o => o.slug === 'eid-special')?.ends_on).toBe(addDaysIso(today, -170));
        expect(db.offers.find(o => o.slug === 'new-year-challenge')?.published).toBe(false);
        for (const o of db.offers.filter(x => x.promo_code)) expect(db.promos.some(p => p.code === o.promo_code)).toBe(true);
    });
});
