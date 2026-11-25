import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiService } from '@core/http/api.service';
import type {
    Exercise,
    ExerciseInput,
    MeasurementInput,
    MeasurementList,
    MemberRoutine,
    Routine,
    RoutineInput,
    TrainingProgress,
    Workout,
    WorkoutInput
} from '@core/models/training.model';

/** Whose training: a member at the branch (staff), or `'me'` (the member portal). */
export type Who = string;
export const ME: Who = 'me';

/**
 * The training calls, for the console (a member by oid, at the branch in `X-Branch-Id`, or HQ for the
 * library) and the portal (`'me'`). The paths differ only in their prefix.
 */
@Injectable({ providedIn: 'root' })
export class TrainingService {
    private readonly _api = inject(ApiService);

    /* ---------- the library ---------- */

    exercises(opts: { all?: boolean; portal?: boolean } = {}): Observable<Exercise[]> {
        return this._api.get<Exercise[]>(opts.portal ? '/v1/me/exercises' : '/v1/exercises', opts.all ? { all: '1' } : undefined);
    }

    createExercise(body: ExerciseInput): Observable<Exercise> {
        return this._api.post<Exercise>('/v1/exercises', body);
    }

    updateExercise(oid: string, body: ExerciseInput): Observable<Exercise> {
        return this._api.patch<Exercise>(`/v1/exercises/${oid}`, body);
    }

    templates(all = false): Observable<Routine[]> {
        return this._api.get<Routine[]>('/v1/routines', all ? { all: '1' } : undefined);
    }

    createTemplate(body: RoutineInput): Observable<Routine> {
        return this._api.post<Routine>('/v1/routines', body);
    }

    updateRoutine(oid: string, body: RoutineInput): Observable<Routine> {
        return this._api.patch<Routine>(`/v1/routines/${oid}`, body);
    }

    /* ---------- a member's training ---------- */

    routine(who: Who): Observable<MemberRoutine> {
        return this._api.get<MemberRoutine>(`${this._base(who)}/routine`);
    }

    /** Staff: a template's copy, or a routine built for the member. */
    assign(who: Who, body: { template_oid: string } | { routine: RoutineInput }): Observable<MemberRoutine> {
        return this._api.post<MemberRoutine>(`${this._base(who)}/routine`, body);
    }

    /** Portal: the HQ templates a member may start. */
    portalTemplates(): Observable<Routine[]> {
        return this._api.get<Routine[]>('/v1/me/routine/templates');
    }

    /** Portal: start an HQ template. */
    start(templateOid: string): Observable<MemberRoutine> {
        return this._api.post<MemberRoutine>('/v1/me/routine', { template_oid: templateOid });
    }

    endRoutine(who: Who): Observable<MemberRoutine> {
        return this._api.post<MemberRoutine>(`${this._base(who)}/routine/end`, {});
    }

    workouts(who: Who, limit = 30): Observable<Workout[]> {
        return this._api.get<Workout[]>(`${this._base(who)}/workouts`, { limit: String(limit) });
    }

    logWorkout(who: Who, body: WorkoutInput): Observable<Workout> {
        return this._api.post<Workout>(`${this._base(who)}/workouts`, body);
    }

    updateWorkout(who: Who, oid: string, body: WorkoutInput): Observable<Workout> {
        return this._api.patch<Workout>(who === ME ? `/v1/me/workouts/${oid}` : `/v1/workouts/${oid}`, body);
    }

    deleteWorkout(who: Who, oid: string): Observable<null> {
        return this._api.delete<null>(who === ME ? `/v1/me/workouts/${oid}` : `/v1/workouts/${oid}`);
    }

    progress(who: Who): Observable<TrainingProgress> {
        return this._api.get<TrainingProgress>(`${this._base(who)}/progress`);
    }

    measurements(who: Who): Observable<MeasurementList> {
        return this._api.get<MeasurementList>(`${this._base(who)}/measurements`);
    }

    recordMeasurement(who: Who, body: MeasurementInput): Observable<MeasurementList> {
        return this._api.post<MeasurementList>(`${this._base(who)}/measurements`, body);
    }

    deleteMeasurement(who: Who, oid: string): Observable<null> {
        return this._api.delete<null>(who === ME ? `/v1/me/measurements/${oid}` : `/v1/measurements/${oid}`);
    }

    private _base(who: Who): string {
        return who === ME ? '/v1/me' : `/v1/members/${who}`;
    }
}
