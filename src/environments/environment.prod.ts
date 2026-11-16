import { Environment } from './environment.model';

export const environment: Environment = {
    name: 'prod',
    production: true,
    apiBaseUrl: '/api',
    // The client's public domain (Q-006): canonical URLs, Open Graph, the sitemap. Set it before go-live.
    siteUrl: 'https://www.example.com',
    demo: false,
    useMockApi: false,
    sentryDsn: '',
    recaptchaSiteKey: '',
    auth: { type: 'password' }
};
