import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import type { AuditPage, StaffList, StaffMember } from '@core/models/staff.model';
import { environment } from '@env/environment';

import { mockApiInterceptor } from '../mock-api.interceptor';
import { resetDemo, setFastMode } from '../store';

interface Res<T> {
    code: number;
    message: string;
    data: T;
}

/** The mock follows the API's staff rules (D-054, D-055), so demo mode behaves like the real thing. */
describe('mock API: staff, audit log, temporary passwords', () => {
    let http: HttpClient;
    const base = environment.apiBaseUrl;

    const headers = (token: string, branch?: string): Record<string, string> => ({
        Authorization: `Bearer ${token}`,
        ...(branch ? { 'X-Branch-Id': branch } : {})
    });
    const login = async (username: string, password: string): Promise<string> =>
        (await firstValueFrom(http.post<Res<{ access_token: string }>>(`${base}/v1/auth/login`, { username, password }))).data.access_token;
    const get = async <T>(path: string, token: string, branch?: string): Promise<T> =>
        (await firstValueFrom(http.get<Res<T>>(`${base}${path}`, { headers: headers(token, branch) }))).data;
    const send = async <T>(
        method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        path: string,
        token: string,
        branch: string | undefined,
        body: unknown = {}
    ): Promise<T> => (await firstValueFrom(http.request<Res<T>>(method, `${base}${path}`, { body, headers: headers(token, branch) }))).data;
    const status = (p: Promise<unknown>): Promise<number> =>
        p.then(
            () => 200,
            (e: HttpErrorResponse) => e.status
        );

    beforeEach(() => {
        localStorage.clear();
        setFastMode(true);
        resetDemo();
        TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([mockApiInterceptor]))] });
        http = TestBed.inject(HttpClient);
    });

    it('HQ lists every staff account; the owner lists only its HQ row and may hand out every role', async () => {
        const owner = await login('owner', 'Owner@123');
        const list = await get<StaffList>('/v1/hq/staff', owner, 'br-hq');
        expect(list.rows.map(r => r.username)).toContain('desk.uttara');
        expect(list.rows.find(r => r.username === 'owner')).toMatchObject({
            all_branches: true,
            manageable: false,
            assignments: [{ branch_kind: 'HQ', role: 'OWNER' }]
        });
        expect(list.assignable_roles.hq).toEqual(['OWNER', 'HQ_ADMIN']);
        expect(list.branches[0]?.kind).toBe('HQ');
    });

    it('a manager adds front desk staff with a temporary password; the new account must change it first', async () => {
        const manager = await login('manager.gulshan', 'Manager@123');
        expect(
            await status(
                send('POST', '/v1/branch/staff', manager, 'br-gul', { username: 'desk.new', name: 'New Desk', password: 'Temp1234', role: 'BRANCH_MANAGER' })
            )
        ).toBe(403);
        const created = await send<StaffMember>('POST', '/v1/branch/staff', manager, 'br-gul', {
            username: 'desk.new',
            name: 'New Desk',
            password: 'Temp1234',
            role: 'FRONT_DESK'
        });
        expect(created.must_change_password).toBe(true);

        const fresh = await login('desk.new', 'Temp1234');
        expect(await status(get('/v1/members', fresh, 'br-gul'))).toBe(403);
        const tokens = await send<{ access_token: string }>('POST', '/v1/auth/change-password', fresh, undefined, {
            current_password: 'Temp1234',
            new_password: 'Mine12345'
        });
        expect(await status(get('/v1/members', tokens.access_token, 'br-gul'))).toBe(200);
    });

    it('a manager cannot touch another manager or someone who also works elsewhere; deactivation blocks sign-in', async () => {
        const managerUtt = await login('manager.uttara', 'Manager@123');
        const list = await get<StaffList>('/v1/branch/staff', managerUtt, 'br-utt');
        const deskUtt = list.rows.find(r => r.username === 'desk.uttara')!;
        expect(deskUtt.manageable).toBe(false);
        expect(await status(send('POST', `/v1/branch/staff/${deskUtt.oid}/deactivate`, managerUtt, 'br-utt'))).toBe(403);

        const managerGul = await login('manager.gulshan', 'Manager@123');
        const desk = (await get<StaffList>('/v1/branch/staff', managerGul, 'br-gul')).rows.find(r => r.username === 'desk.gulshan')!;
        await send('POST', `/v1/branch/staff/${desk.oid}/deactivate`, managerGul, 'br-gul');
        expect(await status(login('desk.gulshan', 'Desk@123'))).toBe(403);
    });

    it('every staff change is in the branch audit log, newest first', async () => {
        const manager = await login('manager.gulshan', 'Manager@123');
        const m = await send<StaffMember>('POST', '/v1/branch/staff', manager, 'br-gul', {
            username: 'audited',
            name: 'Audited',
            password: 'Temp1234',
            role: 'TRAINER'
        });
        await send('PUT', `/v1/branch/staff/${m.oid}/role`, manager, 'br-gul', { role: 'FRONT_DESK' });
        const log = await get<AuditPage>(`/v1/branch/audit?entity=staff&entity_key=${m.oid}`, manager, 'br-gul');
        expect(log.rows.map(r => r.action)).toEqual(['assign', 'create']);
        expect(log.rows.every(r => r.branch_oid === 'br-gul' && r.actor_name === 'Ashraf Siddique')).toBe(true);
        const desk = await login('desk.gulshan', 'Desk@123');
        expect(await status(get('/v1/branch/audit', desk, 'br-gul'))).toBe(403);
    });
});
