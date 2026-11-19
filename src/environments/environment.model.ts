/** Shape every environment file must satisfy, so a missing key fails the build instead of failing at runtime. */
export interface Environment {
    /** Which build this is: local (mock API), proxy (local API), prod (the hosted demo on the real API), demo (mock API, static). */
    name: 'local' | 'proxy' | 'prod' | 'demo';
    production: boolean;
    /** Base URL of the backend gateway. All ApiService calls are prefixed with it. */
    apiBaseUrl: string;
    /**
     * Public origin of the site, without a trailing slash (`https://www.example.com`): canonical URLs, Open Graph and
     * the sitemap. Prerendering runs on a temporary localhost server, so the origin cannot come from the request.
     * Empty → the page's own origin (local development).
     */
    siteUrl: string;
    /** Showcase build (phase 0.5): the `/demo` role picker and the "Demo mode" banner. Needs `useMockApi`. */
    demo: boolean;
    /** true → MockApiInterceptor answers every /api call in memory. Run the app with no backend. */
    useMockApi: boolean;
    /**
     * Guest access on the real API (D-076): `/demo` lists the API's shared guest accounts and signs in as one without
     * a password (`POST /v1/auth/guest`). Off in mock builds, which have their own demo accounts.
     */
    guestAccess: boolean;
}
