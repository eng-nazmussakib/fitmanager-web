import { HttpErrorResponse } from '@angular/common/http';

/**
 * Subscribe-time error handler for user-triggered API calls:
 *   .subscribe({ next: …, error: ignoreHandledApiError })
 * The error was already shown by notifyInterceptor. Handling it here keeps it away from the global ErrorHandler:
 * without an `error` callback, every 400 from a form submit would be logged as a crash.
 */
export const ignoreHandledApiError = (): void => undefined;

/** Normalised error so components never dig through `err.error.message || err.message`. */
export class ApiError extends Error {
    constructor(
        message: string,
        readonly code: number,
        readonly details?: unknown
    ) {
        super(message);
        this.name = 'ApiError';
    }

    static from(err: unknown): ApiError {
        if (err instanceof ApiError) return err;
        if (err instanceof HttpErrorResponse) {
            const body = err.error as { message?: string; code?: number } | null;
            return new ApiError(body?.message ?? err.message, body?.code ?? err.status, body);
        }
        return new ApiError(err instanceof Error ? err.message : 'Unknown error', 0, err);
    }
}
