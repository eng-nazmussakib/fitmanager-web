import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '@core/http/api.service';
import type { ClassSession, ClassSessionDetail, ClassType, Trainer } from '@core/models/class.model';
import type { Invoice } from '@core/models/payment.model';
import type {
    AvailabilitySlot,
    ClassRule,
    ClassRuleInput,
    Locker,
    LockerList,
    MaintenanceList,
    MemberPt,
    OneOffInput,
    PtInput,
    PtSession,
    PtSlots,
    PtWeek,
    RentInput,
    Room,
    TrainerDetail,
    TrainerInput,
    TrainerLeave
} from '@core/models/scheduling.model';

/** The branch console's scheduling calls: trainers, rules, one-off classes, PT, rooms, lockers, maintenance. */
@Injectable({ providedIn: 'root' })
export class SchedulingService {
    private readonly _api = inject(ApiService);

    /* ---------- trainers ---------- */

    trainers(): Observable<Trainer[]> {
        return this._api.get<Trainer[]>('/v1/trainers');
    }

    trainer(oid: string): Observable<TrainerDetail> {
        return this._api.get<TrainerDetail>(`/v1/trainers/${oid}`);
    }

    candidates(): Observable<{ user_oid: string; username: string; name: string }[]> {
        return this._api.get('/v1/trainers/candidates');
    }

    createTrainer(body: TrainerInput): Observable<Trainer> {
        return this._api.post<Trainer>('/v1/trainers', body);
    }

    updateTrainer(oid: string, body: TrainerInput): Observable<Trainer> {
        return this._api.patch<Trainer>(`/v1/trainers/${oid}`, body);
    }

    setAvailability(oid: string, slots: AvailabilitySlot[]): Observable<AvailabilitySlot[]> {
        return this._api.put<AvailabilitySlot[]>(`/v1/trainers/${oid}/availability`, { slots });
    }

    addLeave(oid: string, body: { from_date: string; to_date: string; reason: string | null }): Observable<TrainerLeave> {
        return this._api.post<TrainerLeave>(`/v1/trainers/${oid}/leave`, body);
    }

    removeLeave(oid: string, leaveOid: string): Observable<null> {
        return this._api.delete<null>(`/v1/trainers/${oid}/leave/${leaveOid}`);
    }

    assignTrainer(memberOid: string, trainerOid: string | null): Observable<{ trainer_oid: string | null; trainer_name: string | null }> {
        return this._api.put(`/v1/members/${memberOid}/trainer`, { trainer_oid: trainerOid });
    }

    /* ---------- class types, rooms ---------- */

    classTypes(): Observable<ClassType[]> {
        return this._api.get<ClassType[]>('/v1/class-types');
    }

    hqClassTypes(): Observable<ClassType[]> {
        return this._api.get<ClassType[]>('/v1/hq/class-types');
    }

    saveClassType(oid: string | null, body: Partial<ClassType>): Observable<ClassType> {
        return oid ? this._api.patch<ClassType>(`/v1/hq/class-types/${oid}`, body) : this._api.post<ClassType>('/v1/hq/class-types', body);
    }

    rooms(): Observable<Room[]> {
        return this._api.get<Room[]>('/v1/rooms');
    }

    saveRoom(oid: string | null, body: Partial<Room>): Observable<Room> {
        return oid ? this._api.patch<Room>(`/v1/rooms/${oid}`, body) : this._api.post<Room>('/v1/rooms', body);
    }

    /* ---------- classes ---------- */

    rules(): Observable<ClassRule[]> {
        return this._api.get<ClassRule[]>('/v1/classes/rules');
    }

    createRule(body: ClassRuleInput): Observable<ClassRule> {
        return this._api.post<ClassRule>('/v1/classes/rules', body);
    }

    updateRule(oid: string, body: Partial<ClassRuleInput> & { active?: boolean }): Observable<ClassRule> {
        return this._api.patch<ClassRule>(`/v1/classes/rules/${oid}`, body);
    }

    addClass(body: OneOffInput): Observable<ClassSession> {
        return this._api.post<ClassSession>('/v1/classes/sessions', body);
    }

    updateSession(
        oid: string,
        body: { trainer_oid?: string; room_oid?: string; start_time?: string; minutes?: number; capacity?: number }
    ): Observable<ClassSessionDetail> {
        return this._api.patch<ClassSessionDetail>(`/v1/classes/sessions/${oid}`, body);
    }

    cancelSession(oid: string, reason: string): Observable<unknown> {
        return this._api.post(`/v1/classes/sessions/${oid}/cancel`, { reason });
    }

    /* ---------- PT ---------- */

    ptWeek(week: string, trainer = ''): Observable<PtWeek> {
        return this._api.get<PtWeek>('/v1/pt/sessions', { week, trainer });
    }

    ptSlots(trainerOid: string, date: string, minutes = 60): Observable<PtSlots> {
        return this._api.get<PtSlots>('/v1/pt/slots', { trainer_oid: trainerOid, date, minutes });
    }

    bookPt(body: PtInput): Observable<PtSession> {
        return this._api.post<PtSession>('/v1/pt/sessions', body);
    }

    cancelPt(oid: string, by: 'member' | 'trainer' | 'staff', reason: string): Observable<null> {
        return this._api.post<null>(`/v1/pt/sessions/${oid}/cancel`, { by, reason });
    }

    completePt(oid: string, notes: string | null): Observable<PtSession> {
        return this._api.post<PtSession>(`/v1/pt/sessions/${oid}/complete`, { notes });
    }

    noShowPt(oid: string): Observable<PtSession> {
        return this._api.post<PtSession>(`/v1/pt/sessions/${oid}/no-show`, {});
    }

    memberPt(memberOid: string): Observable<MemberPt> {
        return this._api.get<MemberPt>(`/v1/members/${memberOid}/pt`);
    }

    /* ---------- facilities ---------- */

    lockers(): Observable<LockerList> {
        return this._api.get<LockerList>('/v1/lockers');
    }

    saveLocker(oid: string | null, body: Partial<Pick<Locker, 'number' | 'size' | 'monthly_fee' | 'active'>>): Observable<Locker> {
        return oid ? this._api.patch<Locker>(`/v1/lockers/${oid}`, body) : this._api.post<Locker>('/v1/lockers', body);
    }

    rent(lockerOid: string, body: RentInput): Observable<{ locker: Locker | null; invoice: Invoice }> {
        return this._api.post(`/v1/lockers/${lockerOid}/rentals`, body);
    }

    endRental(rentalOid: string): Observable<Locker | null> {
        return this._api.post<Locker | null>(`/v1/lockers/rentals/${rentalOid}/end`, {});
    }

    maintenance(): Observable<MaintenanceList> {
        return this._api.get<MaintenanceList>('/v1/maintenance');
    }

    block(body: {
        room_oid?: string;
        locker_oid?: string;
        starts_at: string;
        ends_at: string;
        reason: string;
    }): Observable<{ oid: string; classes_affected: number }> {
        return this._api.post('/v1/maintenance', body);
    }

    unblock(oid: string): Observable<null> {
        return this._api.delete<null>(`/v1/maintenance/${oid}`);
    }
}
