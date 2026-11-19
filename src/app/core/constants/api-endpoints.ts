/**
 * Every backend path lives here.
 * Large apps: one `<feature>.endpoints.ts` per feature folder, same shape.
 */
export const API = {
    AUTH: {
        LOGIN: '/v1/auth/login',
        REFRESH: '/v1/auth/refresh',
        LOGOUT: '/v1/auth/logout',
        ME: '/v1/auth/me',
        CHANGE_PASSWORD: '/v1/auth/change-password',
        SESSIONS: '/v1/auth/sessions',
        /** The demo's shared guest accounts (D-076): `GET` lists them, `POST { username }` signs in as one. */
        GUEST: '/v1/auth/guest'
    },
    /** Staff management (D-055): the HQ console sees every account, a branch the people assigned there. */
    STAFF: {
        HQ: '/v1/hq/staff',
        BRANCH: '/v1/branch/staff'
    },
    AUDIT: {
        HQ: '/v1/hq/audit',
        BRANCH: '/v1/branch/audit'
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
