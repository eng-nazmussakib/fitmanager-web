/**
 * PKCE helpers (RFC 7636) on the Web Crypto API. No library needed (IB vendored a third-party oauth2-pkce.ts).
 *
 * The verifier stays in this tab. Only its SHA-256 hash (the challenge) goes to the identity provider, and the
 * verifier itself is sent once, on the code exchange. A stolen authorization code is useless without it.
 */

/** RFC 7636 §4.1 "unreserved" characters. */
const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

/**
 * Cryptographically random string over CHARSET.
 * Rejection sampling: 256 % 66 ≠ 0, so plain `byte % 66` would make the first characters slightly more likely.
 */
export function randomString(length = 64): string {
    const limit = 256 - (256 % CHARSET.length);
    let out = '';
    while (out.length < length) {
        for (const byte of crypto.getRandomValues(new Uint8Array(length))) {
            if (byte < limit && out.length < length) out += CHARSET[byte % CHARSET.length];
        }
    }
    return out;
}

/** S256 code challenge: BASE64URL(SHA-256(verifier)), no padding. */
export async function codeChallenge(verifier: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return base64Url(new Uint8Array(digest));
}

export async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
    const verifier = randomString(64); // RFC 7636: 43–128 characters
    return { verifier, challenge: await codeChallenge(verifier) };
}

function base64Url(bytes: Uint8Array): string {
    return btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}
