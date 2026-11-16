import { createAppAbility } from './ability';

describe('createAppAbility (CASL)', () => {
    it('denies everything when there are no rules (fail-closed)', () => {
        const ability = createAppAbility();
        expect(ability.can('read', 'Member')).toBe(false);
        expect(ability.can('read', 'Payment')).toBe(false);
    });

    it('treats manage/all as a wildcard for every action and subject', () => {
        const ability = createAppAbility([{ action: 'manage', subject: 'all' }]);
        expect(ability.can('delete', 'Member')).toBe(true);
        expect(ability.can('export', 'Payment')).toBe(true);
    });

    it('grants only the listed action on the listed subjects', () => {
        const ability = createAppAbility([{ action: 'read', subject: ['Member', 'Payment'] }]);
        expect(ability.can('read', 'Member')).toBe(true);
        expect(ability.can('read', 'Payment')).toBe(true);
        expect(ability.can('create', 'Member')).toBe(false);
        expect(ability.can('export', 'Member')).toBe(false);
    });

    it('lets an inverted rule take back part of a broader grant', () => {
        const ability = createAppAbility([
            { action: 'manage', subject: 'Member' },
            { action: 'delete', subject: 'Member', inverted: true }
        ]);
        expect(ability.can('update', 'Member')).toBe(true);
        expect(ability.can('delete', 'Member')).toBe(false);
    });
});
