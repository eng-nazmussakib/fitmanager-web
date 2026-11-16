import { InjectionToken } from '@angular/core';
import { Observable, Subject } from 'rxjs';

/** The data passed to `DialogService.open(…, { data })`: `inject(DIALOG_DATA)` in the dialog's component. */
export const DIALOG_DATA = new InjectionToken<unknown>('DIALOG_DATA');

/** Handle to an open dialog: `inject(DialogRef)` inside it to close it with a result. */
export class DialogRef<R = unknown> {
    private readonly _closed = new Subject<R | undefined>();
    private _done = false;

    /** Emits once with the result (undefined when dismissed with Esc, the backdrop or the close button), then completes. */
    readonly afterClosed: Observable<R | undefined> = this._closed.asObservable();

    /** Set by DialogService: closes the native <dialog>, which then calls `complete`. */
    closer: (result?: R) => void = () => undefined;

    close(result?: R): void {
        this.closer(result);
    }

    /** Called by DialogService once the <dialog> has closed. */
    complete(result: R | undefined): void {
        if (this._done) return;
        this._done = true;
        this._closed.next(result);
        this._closed.complete();
    }
}
