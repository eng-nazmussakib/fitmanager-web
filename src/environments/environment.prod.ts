import { Environment } from './environment.model';

export const environment: Environment = {
    name: 'prod',
    production: true,
    apiBaseUrl: '/api',
    // The demo's public domain: canonical URLs, Open Graph, the sitemap. The API is on the same host at /api.
    siteUrl: 'https://fitmanager.nazmussakib.app',
    demo: false,
    useMockApi: false,
    guestAccess: true
};
