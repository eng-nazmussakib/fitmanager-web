import { isPlatformBrowser } from '@angular/common';
import { inject, Injectable, PLATFORM_ID } from '@angular/core';

/**
 * Safe localStorage wrapper: storage can throw (Safari private mode, quota, blocked cookies).
 * On the server (prerendering, SSR) there is no storage: reads return `null` and writes do nothing, so a page
 * renders as a first-time guest.
 *
 * Why the values are NOT crypto-js "encrypted":
 * the AES key ships inside the JS bundle, so anyone can decrypt the values.
 * It only obfuscates them. If tokens must be protected from XSS, the backend has to put them
 * in an httpOnly, Secure, SameSite cookie. Everything in JS-readable storage is readable by an attacker's script.
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
    private readonly _browser = isPlatformBrowser(inject(PLATFORM_ID));

    get<T>(key: string): T | null {
        if (!this._browser) return null;
        try {
            const raw = localStorage.getItem(key);
            return raw ? (JSON.parse(raw) as T) : null;
        } catch {
            return null;
        }
    }

    set(key: string, value: unknown): void {
        if (!this._browser) return;
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch {
            /* storage unavailable: keep working in memory */
        }
    }

    remove(key: string): void {
        if (!this._browser) return;
        try {
            localStorage.removeItem(key);
        } catch {
            /* ignore */
        }
    }
}
