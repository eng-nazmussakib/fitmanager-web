import { HttpContext, HttpContextToken } from '@angular/common/http';

/**
 * Which toasts a request should produce.
 * - 'all'    → success and error (default for POST/PUT/PATCH/DELETE)
 * - 'errors' → only errors (default for GET)
 * - 'none'   → silent: background polling, refresh token, autocomplete search
 *
 * Replaces the `isNotify: boolean` positional argument on every OMS HttpService method.
 */
export type NotifyMode = 'all' | 'errors' | 'none';
export const NOTIFY = new HttpContextToken<NotifyMode>(() => 'errors');

/** Do not attach the bearer token (login, refresh, public endpoints). */
export const SKIP_AUTH = new HttpContextToken<boolean>(() => false);

export function withNotify(mode: NotifyMode, context = new HttpContext()): HttpContext {
    return context.set(NOTIFY, mode);
}
