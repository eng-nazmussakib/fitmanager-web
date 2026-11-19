import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ApiService } from '@core/http/api.service';
import type { AccessDecision, CheckIn, CheckInRequest, Occupancy } from '@core/models/attendance.model';
import type { BranchRef } from '@core/models/branch.model';
import type { ClassSession, ClassSessionDetail, ClassType, Trainer } from '@core/models/class.model';
import type {
    Measurement,
    Member,
    MemberDocument,
    MemberListItem,
    MemberNotification,
    MemberPayload,
    MemberQuery,
    TimelineEvent
} from '@core/models/member.model';
import type { CashClosing, Invoice, PaymentRecord, PaymentRequest, RefundRequest } from '@core/models/payment.model';
import type { Plan } from '@core/models/plan.model';
import type { OrgRules } from '@core/models/settings.model';
import type { PaymentMethod, Quote, Subscription, SubscriptionRequest } from '@core/models/subscription.model';

export interface MemberPage {
    rows: MemberListItem[];
    count: number;
    page: number;
    size: number;
    counts: Record<string, number>;
}

export interface WeekSchedule {
    from: string;
    to: string;
    sessions: ClassSession[];
    types: ClassType[];
    trainers: Trainer[];
    my_trainer_oid: string | null;
}

export type PaymentRow = PaymentRecord & { invoice_number: string; member_name: string; member_oid: string; member_code: string; branch: BranchRef };

/**
 * Every call of the branch console. The branch is not a parameter: the interceptor sends the active branch from
 * the URL as `X-Branch-Id`, and the API scopes each query to it (D-004, D-014).
 */
@Injectable({ providedIn: 'root' })
export class ConsoleService {
    private readonly _api = inject(ApiService);

    members(q: MemberQuery): Observable<MemberPage> {
        return this._api.get<MemberPage>('/v1/members', { ...q });
    }

    lookup(code: string): Observable<MemberListItem> {
        return this._api.get<MemberListItem>('/v1/members/lookup', { code }, { notify: 'none' });
    }

    member(oid: string): Observable<Member> {
        return this._api.get<Member>(`/v1/members/${oid}`);
    }

    createMember(body: MemberPayload): Observable<Member> {
        return this._api.post<Member>('/v1/members', body);
    }

    updateMember(oid: string, body: Partial<MemberPayload>): Observable<Member> {
        return this._api.patch<Member>(`/v1/members/${oid}`, body);
    }

    timeline(oid: string): Observable<TimelineEvent[]> {
        return this._api.get<TimelineEvent[]>(`/v1/members/${oid}/timeline`);
    }

    memberSubscriptions(oid: string): Observable<Subscription[]> {
        return this._api.get<Subscription[]>(`/v1/members/${oid}/subscriptions`);
    }

    memberInvoices(oid: string): Observable<Invoice[]> {
        return this._api.get<Invoice[]>(`/v1/members/${oid}/invoices`);
    }

    memberAttendance(oid: string, days = 84): Observable<{ from: string; to: string; days: { date: string; count: number }[] }> {
        return this._api.get(`/v1/members/${oid}/attendance`, { days });
    }

    measurements(oid: string): Observable<Measurement[]> {
        return this._api.get<Measurement[]>(`/v1/members/${oid}/measurements`);
    }

    plans(): Observable<Plan[]> {
        return this._api.get<Plan[]>('/v1/plans');
    }

    quote(body: SubscriptionRequest): Observable<Quote & { admission_suggested: boolean }> {
        return this._api.post<Quote & { admission_suggested: boolean }>('/v1/subscriptions/quote', body, { notify: 'none' });
    }

    sell(body: SubscriptionRequest): Observable<{ subscription: Subscription; invoice: Invoice }> {
        return this._api.post('/v1/subscriptions', body);
    }

    /** VAT and the freeze rule, as HQ set them. */
    rules(): Observable<OrgRules> {
        return this._api.get<OrgRules>('/v1/rules');
    }

    suspend(oid: string, reason: string): Observable<Member> {
        return this._api.post<Member>(`/v1/members/${oid}/suspend`, { reason });
    }

    unsuspend(oid: string): Observable<Member> {
        return this._api.post<Member>(`/v1/members/${oid}/unsuspend`, {});
    }

    transfer(oid: string, body: { to_branch_oid: string; reason: string }): Observable<{ oid: string; code: string; branch_oid: string; branch_name: string }> {
        return this._api.post(`/v1/members/${oid}/transfer`, body);
    }

    anonymise(oid: string, confirmCode: string): Observable<{ oid: string; anonymised: boolean }> {
        return this._api.post(`/v1/members/${oid}/anonymise`, { confirm_code: confirmCode });
    }

    /** D-064: a temporary password; the username is the member code. */
    portalAccess(oid: string, password: string): Observable<{ username: string; must_change_password: boolean; reset: boolean }> {
        return this._api.post(`/v1/members/${oid}/portal-access`, { password });
    }

    documents(oid: string): Observable<MemberDocument[]> {
        return this._api.get<MemberDocument[]>(`/v1/members/${oid}/documents`);
    }

    notifications(oid: string): Observable<MemberNotification[]> {
        return this._api.get<MemberNotification[]>(`/v1/members/${oid}/notifications`);
    }

    cancelSubscription(oid: string, reason: string): Observable<Subscription> {
        return this._api.post<Subscription>(`/v1/subscriptions/${oid}/cancel`, { reason });
    }

    upgrade(
        oid: string,
        body: { plan_oid: string; payment: { method: PaymentMethod; amount: number; reference?: string | null } }
    ): Observable<{ subscription: Subscription; invoice: Invoice; credit: number }> {
        return this._api.post(`/v1/subscriptions/${oid}/upgrade`, body);
    }

    refund(invoiceOid: string, body: RefundRequest): Observable<Invoice> {
        return this._api.post<Invoice>(`/v1/invoices/${invoiceOid}/refund`, body);
    }

    closeDay(body: {
        counted_cash: number;
        note?: string | null;
    }): Observable<{ day: string; expected_cash: number; counted_cash: number; difference: number }> {
        return this._api.post('/v1/cash-closing', body);
    }

    /** Every open branch (a transfer's target): the public list, since a manager is assigned to one branch only. */
    branchOptions(): Observable<BranchRef[]> {
        return this._api.get<BranchRef[]>('/v1/public/branches');
    }

    freeze(subscriptionOid: string, body: { from: string; days: number; reason: string }): Observable<Subscription> {
        return this._api.post<Subscription>(`/v1/subscriptions/${subscriptionOid}/freeze`, body);
    }

    pay(body: PaymentRequest): Observable<Invoice> {
        return this._api.post<Invoice>('/v1/payments', body);
    }

    payments(): Observable<{ payments: PaymentRow[]; top_dues: { member_oid: string; member_name: string; member_code: string; dues: number }[] }> {
        return this._api.get('/v1/payments');
    }

    invoice(oid: string): Observable<Invoice> {
        return this._api.get<Invoice>(`/v1/invoices/${oid}`);
    }

    cashClosing(): Observable<CashClosing> {
        return this._api.get<CashClosing>('/v1/cash-closing/today');
    }

    evaluate(key: { member_oid?: string; code?: string }): Observable<AccessDecision> {
        return this._api.post<AccessDecision>('/v1/attendance/evaluate', key, { notify: 'none' });
    }

    checkIn(body: CheckInRequest): Observable<CheckIn> {
        return this._api.post<CheckIn>('/v1/attendance/check-in', body);
    }

    checkOut(oid: string): Observable<CheckIn> {
        return this._api.post<CheckIn>(`/v1/attendance/${oid}/check-out`, {});
    }

    today(): Observable<CheckIn[]> {
        return this._api.get<CheckIn[]>('/v1/attendance/today');
    }

    occupancy(): Observable<Occupancy> {
        return this._api.get<Occupancy>('/v1/attendance/occupancy');
    }

    schedule(week: string, trainer = ''): Observable<WeekSchedule> {
        return this._api.get<WeekSchedule>('/v1/classes/schedule', { week, trainer });
    }

    session(oid: string): Observable<ClassSessionDetail> {
        return this._api.get<ClassSessionDetail>(`/v1/classes/sessions/${oid}`);
    }

    book(sessionOid: string, memberOid: string): Observable<unknown> {
        return this._api.post(`/v1/classes/sessions/${sessionOid}/bookings`, { member_oid: memberOid });
    }

    setBooking(oid: string, status: 'Booked' | 'Attended' | 'NoShow' | 'Cancelled'): Observable<unknown> {
        return this._api.patch(`/v1/classes/bookings/${oid}`, { status });
    }
}
