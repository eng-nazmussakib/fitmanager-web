import { Environment } from './environment.model';

export const environment: Environment = {
    name: 'dev',
    production: false,
    apiBaseUrl: 'https://dev.example.com/api',
    siteUrl: 'https://dev.example.com',
    demo: false,
    useMockApi: true,
    sentryDsn: '',
    recaptchaSiteKey: '',
    auth: { type: 'password' }
};
