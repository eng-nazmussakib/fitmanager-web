/**
 * DEV ONLY (`npm run start:proxy`). Forwards same-origin /api calls to a real backend, so the browser never
 * makes a cross-origin request and the backend needs no CORS allow-list entry for localhost.
 *
 *   API_TARGET=https://dev.example.com npm run start:proxy
 *
 * environment.proxy.ts sets apiBaseUrl to '/api' and turns the mock off.
 */
const target = process.env.API_TARGET;
if (!target) throw new Error('Set API_TARGET, e.g. API_TARGET=https://dev.example.com npm run start:proxy');

export default {
    '/api': {
        target,
        changeOrigin: true, // send Host: <target>, not localhost
        secure: false // accept self-signed certificates on internal dev servers
    }
};
