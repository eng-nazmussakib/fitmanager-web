import { HttpBackend, HttpXhrBackend } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { provideAppHttpClient } from './provide-app-http';

describe('provideAppHttpClient', () => {
    it('uses the XHR backend, because the default fetch backend throws on reportUploadProgress (file uploads)', () => {
        TestBed.configureTestingModule({ providers: [provideAppHttpClient()] });
        expect(TestBed.inject(HttpBackend)).toBeInstanceOf(HttpXhrBackend);
    });
});
