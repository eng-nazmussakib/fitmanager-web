import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { EnvironmentProviders } from '@angular/core';

import { MOCK_INTERCEPTORS } from '@mock/mock.providers';

import { authTokenInterceptor } from './interceptors/auth-token.interceptor';
import { branchHeaderInterceptor } from './interceptors/branch-header.interceptor';
import { notifyInterceptor } from './interceptors/notify.interceptor';
import { serverApiInterceptor } from './interceptors/server-api.interceptor';

/**
 * The app's HttpClient.
 *
 * - withXhr(): Angular 22 uses the fetch backend by default. Fetch cannot report upload progress, and a request
 *   with `reportUploadProgress: true` THROWS on it (NG02824). The spec next to this file guards it.
 * - Interceptor order matters: the first is outermost. The mock (only in builds with `useMockApi`; production
 *   builds swap `mock.providers.ts` for an empty file) must be last, closest to the "network", so the others see
 *   its responses exactly as they would see a real server's. serverApiInterceptor (server only) runs after it.
 */
export function provideAppHttpClient(): EnvironmentProviders {
    return provideHttpClient(
        withXhr(),
        withInterceptors([authTokenInterceptor, branchHeaderInterceptor, notifyInterceptor, ...MOCK_INTERCEPTORS, serverApiInterceptor])
    );
}
