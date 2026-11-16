import type { MockDb } from '../types';
import { seedAttendance } from './attendance.seed';
import { seedClasses } from './classes.seed';
import { SCRIPTED, seedMeasurements, seedMembers } from './members.seed';
import { seedBranches, seedPromos, seedSettings, seedSiteGroups } from './organisation.seed';
import { seedPlans } from './plans.seed';
import { seedRoutines } from './routines.seed';
import { seedAccounts, seedTrainers } from './staff.seed';

/**
 * Builds the whole demo world for `today` (Dhaka date). Deterministic: the same day and the same code give the
 * same data on every machine. `nowMinutes` cuts today's check-ins at the current time.
 */
export function seed(today: string, nowMinutes: number): MockDb {
    const branches = seedBranches();
    const { templates, plans } = seedPlans(branches);
    const db: MockDb = {
        seedDay: today,
        branches,
        accounts: [],
        trainers: seedTrainers(),
        templates,
        plans,
        promos: seedPromos(today),
        settings: seedSettings(),
        siteGroups: seedSiteGroups(),
        members: [],
        subscriptions: [],
        invoices: [],
        checkIns: [],
        classTypes: [],
        sessions: [],
        bookings: [],
        measurements: {},
        routines: {},
        workoutLog: {},
        notes: [],
        enquiries: [],
        counters: {}
    };
    seedMembers(db, today);
    db.accounts = seedAccounts(branches, 'mem-gul-1', SCRIPTED[0].code);
    seedMeasurements(db, today);
    seedAttendance(db, today, nowMinutes);
    seedClasses(db, today);
    seedRoutines(db);
    return db;
}
