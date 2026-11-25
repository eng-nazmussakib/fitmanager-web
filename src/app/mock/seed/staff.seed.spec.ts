import { createAppAbility } from '@core/auth/ability';
import type { StaffRole } from '@core/models/branch.model';

import { ROLE_RULES } from './staff.seed';

/** Only HQ changes the plans a branch sells. Mirrors migration 004 in fitmanager-infra/db. */
describe('who may change branch plans', () => {
    it.each<[StaffRole, boolean]>([
        ['OWNER', true],
        ['HQ_ADMIN', true],
        ['BRANCH_MANAGER', false],
        ['FRONT_DESK', false],
        ['TRAINER', false]
    ])('%s: change plans = %s', (role, allowed) => {
        const ability = createAppAbility(ROLE_RULES[role]);
        for (const action of ['create', 'update', 'delete'] as const) expect(ability.can(action, 'Plan')).toBe(allowed);
    });
});
