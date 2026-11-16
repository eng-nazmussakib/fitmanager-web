import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';

import { ToastService } from '@shared/ui/toast/toast.service';

import { NOTIFY } from '../http-context.tokens';

/**
 * Shows a toast (ToastService) from the response envelope.
 * The OMS `traceRes()` operator did this, but it had to be piped onto every call by hand.
 * As an interceptor it covers every request, and each request opts out with `withNotify('none')`.
 */
export const notifyInterceptor: HttpInterceptorFn = (req, next) => {
    const mode = req.context.get(NOTIFY);
    if (mode === 'none') return next(req);

    const toast = inject(ToastService);

    return next(req).pipe(
        tap({
            next: event => {
                if (!(event instanceof HttpResponse) || !isEnvelope(event.body)) return;
                const { code, message } = event.body;
                if (code >= 400) toast.error(message);
                else if (mode === 'all') toast.success(message);
            },
            error: (err: unknown) => {
                // 401s are handled (refresh / logout) by authTokenInterceptor. Don't toast them.
                if (err instanceof HttpErrorResponse && err.status === 401) return;
                const message = err instanceof HttpErrorResponse ? ((err.error as { message?: string } | null)?.message ?? err.message) : String(err);
                toast.error(message);
            }
        })
    );
};

function isEnvelope(body: unknown): body is { code: number; message: string } {
    return typeof body === 'object' && body !== null && 'code' in body && 'message' in body;
}
