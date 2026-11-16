import { Injectable, signal } from '@angular/core';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface Toast {
    id: number;
    tone: ToastTone;
    title?: string;
    message: string;
    /** ms before it closes by itself; 0 keeps it until closed. */
    duration: number;
}

export type ToastOptions = Partial<Omit<Toast, 'id' | 'message'>>;

const DEFAULT_DURATION: Record<ToastTone, number> = { info: 4000, success: 3500, warning: 6000, danger: 7000 };
const MAX_TOASTS = 4;

/**
 * Short notifications, shown by `<fm-toast-host>` (rendered once in AppComponent). Replaces ng-zorro's
 * NzNotificationService / NzMessageService (D-007). State only: safe to call on the server, where nothing renders.
 *
 *   inject(ToastService).success('Payment recorded');
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
    private readonly _toasts = signal<Toast[]>([]);
    private _nextId = 1;
    private readonly _timers = new Map<number, ReturnType<typeof setTimeout>>();

    readonly toasts = this._toasts.asReadonly();

    show(message: string, opts: ToastOptions = {}): number {
        const tone = opts.tone ?? 'info';
        const toast: Toast = { id: this._nextId++, tone, title: opts.title, message, duration: opts.duration ?? DEFAULT_DURATION[tone] };
        this._toasts.update(list => [...list, toast].slice(-MAX_TOASTS));
        this._schedule(toast);
        return toast.id;
    }

    success(message: string, title?: string): number {
        return this.show(message, { tone: 'success', title });
    }

    info(message: string, title?: string): number {
        return this.show(message, { tone: 'info', title });
    }

    warning(message: string, title?: string): number {
        return this.show(message, { tone: 'warning', title });
    }

    error(message: string, title = 'Something went wrong'): number {
        return this.show(message, { tone: 'danger', title });
    }

    dismiss(id: number): void {
        clearTimeout(this._timers.get(id));
        this._timers.delete(id);
        this._toasts.update(list => list.filter(t => t.id !== id));
    }

    /** Hover or focus pauses the countdown, so a toast does not vanish while someone reads it. */
    pause(id: number): void {
        clearTimeout(this._timers.get(id));
        this._timers.delete(id);
    }

    resume(id: number): void {
        const toast = this._toasts().find(t => t.id === id);
        if (toast) this._schedule(toast);
    }

    private _schedule(toast: Toast): void {
        if (!toast.duration || typeof setTimeout === 'undefined') return;
        this._timers.set(
            toast.id,
            setTimeout(() => this.dismiss(toast.id), toast.duration)
        );
    }
}
