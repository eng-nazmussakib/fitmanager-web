import { Environment } from './environment.model';

export const environment: Environment = {
    name: 'local',
    production: false,
    apiBaseUrl: '/api',
    siteUrl: '',
    demo: false,
    useMockApi: true,
    guestAccess: false
};
