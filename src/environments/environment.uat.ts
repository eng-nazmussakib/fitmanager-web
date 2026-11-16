import { Environment } from './environment.model';

export const environment: Environment = {
    name: 'uat',
    production: true,
    apiBaseUrl: 'https://uat.example.com/api',
    siteUrl: 'https://uat.example.com',
    demo: false,
    useMockApi: false,
    sentryDsn: '',
    recaptchaSiteKey: '',
    auth: { type: 'password' }
};
