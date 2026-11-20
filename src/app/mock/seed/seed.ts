import type { MockDb } from '../types';
import { seedAttendance } from './attendance.seed';
import { seedClasses, seedFacilities } from './classes.seed';
import { seedEveryCase } from './every-case.seed';
import { SCRIPTED, seedMembers } from './members.seed';
import { seedBranches, seedPromos, seedSettings, seedSiteGroups } from './organisation.seed';
import { seedPlans } from './plans.seed';
import { seedSchedulingCases } from './scheduling-cases.seed';
import { seedAccounts, seedTrainers } from './staff.seed';
import { seedTraining } from './training.seed';

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
        audit: [],
        members: [],
        subscriptions: [],
        invoices: [],
        checkIns: [],
        classTypes: [],
        sessions: [],
        bookings: [],
        exercises: [],
        routines: [],
        workouts: [],
        measurements: [],
        notes: [],
        enquiries: [],
        messages: [],
        rooms: [],
        rules: [],
        availability: [],
        leave: [],
        ptSessions: [],
        lockers: [],
        rentals: [],
        blocks: [],
        counters: {}
    };
    seedMembers(db, today);
    db.accounts = seedAccounts(branches, 'mem-gul-1', SCRIPTED[0].code);
    seedAttendance(db, today, nowMinutes);
    seedEveryCase(db, today);
    seedFacilities(db);
    seedClasses(db, today);
    seedSchedulingCases(db, today);
    seedTraining(db, today);
    return db;
}
