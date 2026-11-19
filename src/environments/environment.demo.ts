import { Environment } from './environment.model';

/**
 * The showcase build (phase 0.5): `ng build --configuration demo`. No backend: the mock API answers everything,
 * the /demo page signs in as a role, and a banner says it is demo data. A static build like production (D-075):
 * the public pages are prerendered from the mock, so `dist/browser` can be served by any static host for free.
 */
export const environment: Environment = {
    name: 'demo',
    production: true,
    apiBaseUrl: '/api',
    siteUrl: '',
    demo: true,
    useMockApi: true
};
