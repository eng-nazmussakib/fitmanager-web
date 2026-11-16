import type { HttpInterceptorFn } from '@angular/common/http';

import { environment } from '@env/environment';

import { mockApiInterceptor } from './mock-api.interceptor';

/**
 * The mock API, for builds with `useMockApi` (local development and the `demo` showcase). Production builds swap
 * this file for `mock.providers.prod.ts` (empty).
 */
export const MOCK_INTERCEPTORS: HttpInterceptorFn[] = environment.useMockApi ? [mockApiInterceptor] : [];
