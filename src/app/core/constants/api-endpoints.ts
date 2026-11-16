/**
 * Every backend path lives here (OMS `api-endpoint.ts` / per-module `*-endpoint.ts`).
 * Large apps: one `<feature>.endpoints.ts` per feature folder, same shape.
 */
export const API = {
    AUTH: {
        LOGIN: '/v1/auth/login',
        REFRESH: '/v1/auth/refresh',
        LOGOUT: '/v1/auth/logout',
        ME: '/v1/auth/me'
    },
    /** Public: a visitor asks to join a branch (sign-up page). */
    JOIN_REQUESTS: '/v1/public/join-requests',
    DDL: '/v1/ddl',
    FILE: {
        UPLOAD: '/v1/files/upload',
        DOWNLOAD: '/v1/files/download'
    },
    DEMO: {
        RESET: '/v1/demo/reset',
        SETTINGS: '/v1/demo/settings',
        ACCOUNTS: '/v1/demo/accounts'
    }
} as const;
