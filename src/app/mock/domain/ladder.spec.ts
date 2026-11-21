import { allowedLevels, appealDeadline, banScopes, giverRole, mayDecideAppeal, mayLift, strikes, suggestLevel } from './ladder';

// The API's cases (fitmanager-api src/features/discipline/ladder.test.ts), D-092 to D-094.
describe('the discipline ladder (D-092)', () => {
    it('suggests one step per strike, capped at a ban', () => {
        expect([0, 1, 2, 3, 7].map(suggestLevel)).toEqual(['verbal', 'written', 'suspension', 'ban', 'ban']);
    });

    it('counts sanctions in the last 12 months that were not overturned', () => {
        const rows = [
            { level: 'verbal' as const, starts_on: '2025-11-19', overturned: false },
            { level: 'written' as const, starts_on: '2025-11-20', overturned: false },
            { level: 'written' as const, starts_on: '2026-06-01', overturned: true },
            { level: 'suspension' as const, starts_on: '2026-11-19', overturned: false }
        ];
        expect(strikes(rows, '2026-11-19').map(r => r.starts_on)).toEqual(['2025-11-20', '2026-11-19']);
    });

    it('who gives what: the desk and trainers a verbal warning, managers any step but not on a manager, HQ anything', () => {
        expect(giverRole('FRONT_DESK', false)).toBe('desk');
        expect(giverRole('TRAINER', false)).toBe('trainer');
        expect(giverRole('BRANCH_MANAGER', false)).toBe('manager');
        expect(giverRole('OWNER', false)).toBe('hq');
        expect(giverRole('BRANCH_MANAGER', true)).toBe('hq');
        const plain = { hq_only: false, about_caller: false };
        expect(allowedLevels('desk', plain)).toEqual(['verbal']);
        expect(allowedLevels('trainer', plain)).toEqual(['verbal']);
        expect(allowedLevels('manager', plain)).toEqual(['verbal', 'written', 'suspension', 'ban']);
        expect(allowedLevels('manager', { hq_only: true, about_caller: false })).toEqual([]);
        expect(allowedLevels('hq', { hq_only: true, about_caller: false })).toHaveLength(4);
        expect(allowedLevels('hq', { hq_only: false, about_caller: true })).toEqual([]);
        expect(banScopes('manager')).toEqual(['branch']);
        expect(banScopes('hq')).toEqual(['branch', 'all']);
        expect(banScopes('desk')).toEqual([]);
    });

    it('appeals: never the giver, HQ for a ban; 7 days to file', () => {
        expect(mayDecideAppeal('manager', { level: 'written', given_by: 'a', hq_only: false }, 'b')).toBe(true);
        expect(mayDecideAppeal('manager', { level: 'written', given_by: 'a', hq_only: false }, 'a')).toBe(false);
        expect(mayDecideAppeal('manager', { level: 'ban', given_by: 'a', hq_only: false }, 'b')).toBe(false);
        expect(mayDecideAppeal('hq', { level: 'ban', given_by: 'a', hq_only: false }, 'b')).toBe(true);
        expect(mayDecideAppeal('hq', { level: 'ban', given_by: 'b', hq_only: false }, 'b')).toBe(false);
        expect(appealDeadline('2026-11-19')).toBe('2026-11-26');
    });

    it('lifting a ban: HQ any; a manager the branch bans not given by HQ', () => {
        const ban = { level: 'ban' as const, scope: 'branch' as const, given_role: 'manager' as const, hq_only: false };
        expect(mayLift('manager', ban)).toBe(true);
        expect(mayLift('manager', { ...ban, given_role: 'hq' })).toBe(false);
        expect(mayLift('manager', { ...ban, scope: 'all' })).toBe(false);
        expect(mayLift('hq', { ...ban, scope: 'all', given_role: 'hq' })).toBe(true);
        expect(mayLift('hq', { ...ban, level: 'written' })).toBe(false);
    });
});
