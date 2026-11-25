import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { environment } from '@env/environment';

import { mockApiInterceptor } from './mock-api.interceptor';
import { resetDemo, setFastMode } from './store';

interface Res<T> {
    code: number;
    message: string;
    data: T;
}

/**
 * The mock enforces what the API will: tokens, branch scoping by X-Branch-Id and the user's
 * assignments, and CASL permissions. The API tests check the same cases.
 */
describe('mock API', () => {
    let http: HttpClient;
    const base = environment.apiBaseUrl;

    async function login(username: string, password: string): Promise<string> {
        const r = await firstValueFrom(http.post<Res<{ access_token: string }>>(`${base}/v1/auth/login`, { username, password }));
        return r.data.access_token;
    }

    function get<T>(path: string, token: string, branch?: string): Promise<Res<T>> {
        const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
        if (branch) headers['X-Branch-Id'] = branch;
        return firstValueFrom(http.get<Res<T>>(`${base}${path}`, { headers }));
    }

    function status(p: Promise<unknown>): Promise<number> {
        return p.then(
            () => 200,
            (e: { status: number }) => e.status
        );
    }

    beforeEach(() => {
        localStorage.clear();
        setFastMode(true);
        resetDemo();
        TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([mockApiInterceptor]))] });
        http = TestBed.inject(HttpClient);
    });

    it('rejects a wrong password and a missing token', async () => {
        expect(await status(login('owner', 'nope'))).toBe(400);
        expect(await status(get('/v1/auth/me', 'bogus'))).toBe(401);
    });

    it('scopes members to the X-Branch-Id branch, and only branches the user works at', async () => {
        const desk = await login('desk.gulshan', 'Desk@123');
        const page = await get<{ rows: { code: string }[]; count: number }>('/v1/members?size=100', desk, 'br-gul');
        expect(page.data.count).toBeGreaterThan(200);
        expect(page.data.rows.every(r => r.code.startsWith('MEM-GUL-'))).toBe(true);
        expect(await status(get('/v1/members', desk, 'br-dha'))).toBe(403);
        expect(await status(get('/v1/members', desk))).toBe(403);
        // Another branch's member by id is not found, not leaked.
        expect(await status(get('/v1/members/mem-dha-1', desk, 'br-gul'))).toBe(404);
    });

    it('applies CASL: front desk cannot open the HQ dashboard or override a block; the owner can see HQ', async () => {
        const desk = await login('desk.gulshan', 'Desk@123');
        expect(await status(get('/v1/hq/dashboard', desk, 'br-hq'))).toBe(403);
        const owner = await login('owner', 'Owner@123');
        const hq = await get<{ kpis: unknown[]; comparison: unknown[] }>('/v1/hq/dashboard', owner, 'br-hq');
        expect(hq.data.kpis.length).toBe(6);
        expect(hq.data.comparison.length).toBe(3);
    });

    it('evaluates the scripted members: allowed, expired, dues over the limit', async () => {
        const manager = await login('manager.gulshan', 'Manager@123');
        const evaluate = (code: string): Promise<Res<{ allowed: boolean; failures: { rule: string }[]; can_override: boolean }>> =>
            firstValueFrom(
                http.post<Res<{ allowed: boolean; failures: { rule: string }[]; can_override: boolean }>>(
                    `${base}/v1/attendance/evaluate`,
                    { code },
                    { headers: { Authorization: `Bearer ${manager}`, 'X-Branch-Id': 'br-gul' } }
                )
            );
        const expired = await evaluate('MEM-GUL-000002');
        expect(expired.data.failures.map(f => f.rule)).toContain('expired');
        expect(expired.data.can_override).toBe(true);
        const dues = await evaluate('MEM-GUL-000003');
        expect(dues.data.failures.map(f => f.rule)).toContain('dues');
    });

    it('VAT is an HQ setting: only HQ changes it, and new quotes use the new rate', async () => {
        const send = <T>(method: 'PATCH' | 'POST', path: string, body: unknown, token: string, branch: string): Promise<Res<T>> =>
            firstValueFrom(http.request<Res<T>>(method, `${base}${path}`, { body, headers: { Authorization: `Bearer ${token}`, 'X-Branch-Id': branch } }));
        const desk = await login('desk.gulshan', 'Desk@123');
        const owner = await login('owner', 'Owner@123');
        expect(await status(send('PATCH', '/v1/hq/settings', { vat_rate: 0 }, desk, 'br-hq'))).toBe(403);
        expect(await status(send('PATCH', '/v1/hq/settings', { vat_rate: 0.9 }, owner, 'br-hq'))).toBe(400);
        expect(await status(send('PATCH', '/v1/hq/settings', { vat_bin: 'abc' }, owner, 'br-hq'))).toBe(400);

        const saved = await send<{ vat_rate: number; updated_by: string }>('PATCH', '/v1/hq/settings', { vat_rate: 0.075 }, owner, 'br-hq');
        expect(saved.data.vat_rate).toBe(0.075);
        expect(saved.data.updated_by).toBe('Kamrul Chowdhury');

        const plan = (await get<{ oid: string; price: number }[]>('/v1/plans', desk, 'br-gul')).data[0];
        const member = (await get<{ rows: { oid: string }[] }>('/v1/members?size=1', desk, 'br-gul')).data.rows[0];
        const quote = await send<{ vat_rate: number; vat: number; subtotal: number }>(
            'POST',
            '/v1/subscriptions/quote',
            { member_oid: member.oid, plan_oid: plan.oid, charge_admission: false, discount: { kind: 'none', value: 0 } },
            desk,
            'br-gul'
        );
        expect(quote.data.vat_rate).toBe(0.075);
        expect(quote.data.vat).toBe(Math.round(quote.data.subtotal * 0.075));

        const pub = await firstValueFrom(http.get<Res<{ vat_rate: number }[]>>(`${base}/v1/public/plans`));
        expect(pub.data[0].vat_rate).toBe(0.075);
    });

    it('site groups: section and page switch separately; required groups stay on', async () => {
        interface Group {
            key: string;
            required: boolean;
            section: boolean | null;
            page: boolean | null;
        }
        const patch = (key: string, body: object, token: string, branch: string): Promise<Res<Group>> =>
            firstValueFrom(
                http.patch<Res<Group>>(`${base}/v1/hq/site-groups/${key}`, body, { headers: { Authorization: `Bearer ${token}`, 'X-Branch-Id': branch } })
            );
        const owner = await login('owner', 'Owner@123');
        const desk = await login('desk.gulshan', 'Desk@123');
        expect(await status(patch('blog', { section: false }, desk, 'br-hq'))).toBe(403);
        expect(await status(patch('plans', { page: false }, owner, 'br-hq'))).toBe(409);
        expect(await status(patch('reviews', { page: true }, owner, 'br-hq'))).toBe(400);
        const blog = await patch('blog', { section: false }, owner, 'br-hq');
        expect(blog.data).toMatchObject({ section: false, page: true });
        expect(blog.message).toBe('Blog: section hidden, page shown');
        const pub = await firstValueFrom(http.get<Res<Group[]>>(`${base}/v1/public/site-groups`));
        expect(pub.data.find(r => r.key === 'blog')).toMatchObject({ section: false, page: true });
        expect(pub.data.filter(r => r.required).map(r => r.key)).toEqual(['hero', 'services', 'plans', 'facilities']);
    });

    it('a visitor trains anywhere; refunds and suspensions follow the API’s rules', async () => {
        const send = <T>(method: 'POST', path: string, body: unknown, token: string, branch: string): Promise<Res<T>> =>
            firstValueFrom(http.request<Res<T>>(method, `${base}${path}`, { body, headers: { Authorization: `Bearer ${token}`, 'X-Branch-Id': branch } }));
        const deskDha = await login('desk.dhanmondi', 'Desk@123');
        const visitor = await send<{ failures: { rule: string }[]; member: { visitor: boolean } }>(
            'POST',
            '/v1/attendance/evaluate',
            { code: 'MEM-GUL-000001' },
            deskDha,
            'br-dha'
        );
        expect(visitor.data.failures.map(f => f.rule)).not.toContain('branch');
        expect(visitor.data.member.visitor).toBe(true);

        const desk = await login('desk.gulshan', 'Desk@123');
        const manager = await login('manager.gulshan', 'Manager@123');
        const page = await get<{ rows: { oid: string; code: string; status: string }[] }>('/v1/members?size=100&status=Active', desk, 'br-gul');
        const member = page.data.rows[0]?.oid ?? '';
        // A suspension is a step on a discipline case: the desk warns, a manager suspends.
        const at = new Date(Date.now() - 60_000).toISOString();
        const body = {
            subject_kind: 'member',
            member_code: page.data.rows[0]?.code,
            occurred_at: at,
            category: 'conduct',
            summary: 'Shouting',
            description: 'Shouted at the desk.'
        };
        const c = await send<{ oid: string; suggestion: string }>('POST', '/v1/incidents', body, desk, 'br-gul');
        const suspend = {
            level: 'suspension',
            reason: 'Behaviour',
            choice_reason: 'Serious',
            ends_on: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10)
        };
        expect(await status(send('POST', `/v1/incidents/${c.data.oid}/sanctions`, suspend, desk, 'br-gul'))).toBe(403);
        expect(await status(send('POST', `/v1/incidents/${c.data.oid}/sanctions`, suspend, manager, 'br-gul'))).toBe(200);
        const after = await get<{ status: string; sanction: { level: string } | null }>(`/v1/members/${member}`, desk, 'br-gul');
        expect(after.data).toMatchObject({ status: 'Suspended', sanction: { level: 'suspension' } });

        const invoices = await get<{ oid: string; paid: number; issued_at: string }[]>(`/v1/members/${member}/invoices`, desk, 'br-gul');
        const old = invoices.data.find(i => i.paid > 0);
        if (old) {
            // An old, used invoice: the desk cannot refund it; a manager can refund part of it.
            const paidBefore = old.paid; // the mock answers with live rows: read the number first
            expect(await status(send('POST', `/v1/invoices/${old.oid}/refund`, { reason: 'Goodwill' }, desk, 'br-gul'))).toBe(403);
            const r = await send<{ paid: number }>('POST', `/v1/invoices/${old.oid}/refund`, { amount: 100, reason: 'Goodwill' }, manager, 'br-gul');
            expect(r.data.paid).toBe(paidBefore - 100);
        }
        const closing = await send<{ expected_cash: number }>('POST', '/v1/cash-closing', { counted_cash: 0 }, desk, 'br-gul');
        expect(typeof closing.data.expected_cash).toBe('number');
        expect(await status(send('POST', '/v1/cash-closing', { counted_cash: 0 }, desk, 'br-gul'))).toBe(409);
    });
});
