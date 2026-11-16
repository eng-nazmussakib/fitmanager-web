import { codeChallenge, createPkcePair, randomString } from './pkce';

describe('PKCE helpers', () => {
    it('matches the RFC 7636 Appendix B test vector', async () => {
        expect(await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    });

    it('creates verifiers of the requested length from the unreserved character set only', () => {
        for (const length of [43, 64, 128]) {
            expect(randomString(length)).toMatch(new RegExp(`^[A-Za-z0-9\\-._~]{${length}}$`));
        }
    });

    it('never repeats a verifier', () => {
        expect(new Set(Array.from({ length: 50 }, () => randomString())).size).toBe(50);
    });

    it('returns a URL-safe challenge with no padding', async () => {
        const { verifier, challenge } = await createPkcePair();
        expect(verifier).toHaveLength(64);
        expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });
});
