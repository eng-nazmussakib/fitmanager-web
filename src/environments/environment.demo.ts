import { Environment } from './environment.model';

/**
 * The showcase build (phase 0.5): `ng build --configuration demo`. No backend: the mock API answers everything,
 * the /demo page signs in as a role, and a banner says it is demo data. An SSR build (Node server, like the VM
 * target), so it runs as its own container and the public pages are server-rendered from the mock.
 */
export const environment: Environment = {
    name: 'demo',
    production: true,
    apiBaseUrl: '/api',
    siteUrl: '',
    demo: true,
    useMockApi: true,
    sentryDsn: '',
    recaptchaSiteKey: '',
    auth: { type: 'password' }
};
