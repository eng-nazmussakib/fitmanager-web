/**
 * How users sign in.
 * - `password`: the app's own form posts username/password to the backend (most older projects).
 * - `oauth`: OAuth 2.0 authorization-code flow with PKCE against an identity provider (Keycloak, or an in-house
 *   OAuth server), the IB portals' flow. No password ever touches this app.
 */
export type AuthConfig =
    | { type: 'password' }
    | {
          type: 'oauth';
          clientId: string;
          /** FULL URLs, never base + hard-coded suffix: switching servers (in-house OAuth ⇄ Keycloak) is then a config edit (IB). */
          authorizationUrl: string;
          tokenUrl: string;
          /** Resolved against <base href>; must be registered with the identity provider. */
          redirectPath: string;
          scope: string[];
          /**
           * How the client identifies itself on the refresh_token grant, the ONE request where the two servers differ:
           * - 'basic': `Authorization: Basic base64(clientId + ':')`, no client_id in the body (legacy in-house server)
           * - 'body':  `client_id` in the body, no Basic header (Keycloak public client)
           * A wrong value is invisible at login (the code exchange works on both) and only fails at the first refresh,
           * which looks like a random logout an hour later. It is a property of the client registration (IB).
           */
          tokenAuthStyle: 'basic' | 'body';
      };

/** Shape every environment file must satisfy, so a missing key fails the build instead of failing at runtime. */
export interface Environment {
    /** Label shown in Sentry and used to switch off dev-only behaviour. */
    name: 'local' | 'dev' | 'iat' | 'uat' | 'prod' | 'proxy' | 'demo';
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
    /** Empty string → Sentry is not initialised. */
    sentryDsn: string;
    /** Empty string → the reCAPTCHA step is skipped (password sign-in only). */
    recaptchaSiteKey: string;
    auth: AuthConfig;
}
