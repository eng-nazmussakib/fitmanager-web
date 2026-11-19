/** App-wide constants. Use UPPER_CASE (guideline 2.3) and `as const` so values are literal types. */
export const APP = {
    LOGIN_ROUTE: '/auth/sign-in',
    /** Change password and the user's sessions; forced while a temporary password is set (D-054). */
    PASSWORD_ROUTE: '/account/password',
    HOME_ROUTE: '/home',
    PAGE_SIZE: 10,
    PAGE_SIZE_OPTIONS: [10, 20, 50, 100],
    TIME_ZONE: 'Asia/Dhaka',
    MAX_UPLOAD_MB: 2
} as const;

/** Keys for localStorage. Keep them in one place so a logout can clear everything it owns. */
export const STORAGE_KEYS = {
    AUTH_TOKENS: 'app.auth',
    THEME: 'app.theme',
    PALETTE: 'app.palette',
    /** Colours for the start-up loader in index.html (read there before Angular runs). */
    SPLASH: 'app.splash',
    /** The active colour theme's CSS variables, re-applied by index.html before the first paint. */
    PALETTE_VARS: 'app.palette-vars',
    /** The landing offer pop-up a visitor closed: `{ id, until }` (ms). */
    PROMO: 'app.promo'
} as const;
