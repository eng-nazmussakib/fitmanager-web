import type { HttpInterceptorFn } from '@angular/common/http';

/**
 * Production builds replace `mock.providers.ts` with this file (angular.json `fileReplacements`), so no mock code,
 * seed data or demo account reaches the bundle. `npm run check:no-mock` verifies it.
 */
export const MOCK_INTERCEPTORS: HttpInterceptorFn[] = [];
