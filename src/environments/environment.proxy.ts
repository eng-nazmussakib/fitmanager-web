import { Environment } from './environment.model';

/**
 * `npm run start:proxy`: a real backend with no CORS allow-list for localhost.
 * The browser calls same-origin `/api`, and the dev server forwards it (proxy.conf.mjs, target from $API_TARGET).
 * Dev only; never used by a build.
 */
export const environment: Environment = {
    name: 'proxy',
    production: false,
    apiBaseUrl: '/api',
    siteUrl: '',
    demo: false,
    useMockApi: false,
    guestAccess: true
};
