import { Environment } from './environment.model';

export const environment: Environment = {
    name: 'iat',
    production: false,
    apiBaseUrl: 'https://iat.example.com/api',
    siteUrl: 'https://iat.example.com',
    demo: false,
    useMockApi: false,
    sentryDsn: '',
    recaptchaSiteKey: '',
    auth: { type: 'password' }
};
