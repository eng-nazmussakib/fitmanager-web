import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '@env/environment';

import { ApiService } from './api.service';
import { ApiError } from './api-error';
import { NOTIFY } from './http-context.tokens';

/** HTTP services: use HttpTestingController. Never call the network from a unit test. */
describe('ApiService', () => {
    let api: ApiService;
    let http: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
        api = TestBed.inject(ApiService);
        http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    it('unwraps the { code, message, data } envelope', () => {
        let result: unknown;
        api.get<{ id: number }>('/v1/thing').subscribe(r => (result = r));
        http.expectOne(`${environment.apiBaseUrl}/v1/thing`).flush({ code: 200, message: 'OK', data: { id: 7 } });
        expect(result).toEqual({ id: 7 });
    });

    it('turns a failure code inside an HTTP 200 into an ApiError', () => {
        let error: unknown;
        api.post('/v1/thing', {}).subscribe({ error: (e: unknown) => (error = e) });
        http.expectOne(`${environment.apiBaseUrl}/v1/thing`).flush({ code: 409, message: 'Duplicate', data: null });
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).code).toBe(409);
    });

    it('drops empty query params and sets notify defaults (GET → errors, POST → all)', () => {
        api.get('/v1/list', { q: '', status: null, page: 2 }).subscribe();
        const get = http.expectOne(r => r.url.endsWith('/v1/list'));
        expect(get.request.params.keys()).toEqual(['page']);
        expect(get.request.context.get(NOTIFY)).toBe('errors');
        get.flush({ code: 200, message: 'OK', data: [] });

        api.post('/v1/list', {}).subscribe();
        const post = http.expectOne(r => r.method === 'POST');
        expect(post.request.context.get(NOTIFY)).toBe('all');
        post.flush({ code: 200, message: 'OK', data: null });
    });
});
