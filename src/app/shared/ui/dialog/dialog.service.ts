import { isPlatformBrowser } from '@angular/common';
import {
    ApplicationRef,
    ChangeDetectionStrategy,
    Component,
    ComponentRef,
    createComponent,
    DOCUMENT,
    ElementRef,
    EnvironmentInjector,
    inject,
    Injectable,
    Injector,
    PLATFORM_ID,
    signal,
    Type,
    viewChild,
    ViewContainerRef
} from '@angular/core';

import { DIALOG_DATA, DialogRef } from './dialog-ref';

export type DialogSize = 'sm' | 'md' | 'lg' | 'drawer' | 'nav';

export interface DialogOptions<D> {
    data?: D;
    size?: DialogSize;
    /** Esc and a click on the backdrop close the dialog (result `undefined`). Default true. */
    dismissible?: boolean;
    /** Accessible name when the content has no `fm-dialog-shell` title. */
    ariaLabel?: string;
}

/** The native <dialog> that hosts a component opened through DialogService. */
@Component({
    selector: 'fm-dialog-host',
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -- the click is the backdrop; Esc closes natively -->
        <dialog
            #dialog
            [attr.aria-label]="ariaLabel()"
            [class]="'fm-dialog' + (size() === 'md' ? '' : ' fm-dialog-' + size())"
            (cancel)="onCancel($event)"
            (click)="onBackdrop($event)"
            (close)="closed()"
        >
            <ng-container #outlet />
        </dialog>
    `
})
export class DialogHostComponent {
    readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
    readonly outlet = viewChild.required('outlet', { read: ViewContainerRef });
    readonly size = signal<DialogSize>('md');
    readonly ariaLabel = signal<string | null>(null);
    dismissible = true;
    closed: () => void = () => undefined;

    protected onCancel(event: Event): void {
        if (!this.dismissible) event.preventDefault();
    }

    /** A click whose target is the <dialog> itself landed on the backdrop (the content fills the box). */
    protected onBackdrop(event: MouseEvent): void {
        if (!this.dismissible || event.target !== this.dialog().nativeElement) return;
        const r = this.dialog().nativeElement.getBoundingClientRect();
        const inside = event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
        if (!inside) this.dialog().nativeElement.close();
    }
}

/**
 * Opens a component in a modal native `<dialog>` (`showModal()`: focus trap, Esc, inert page and top layer for free).
 * Replaces NzModalService.
 *
 *   const ref = inject(DialogService).open(FreezeDialogComponent, { data: { member }, size: 'sm' });
 *   ref.afterClosed.subscribe(result => …);
 *
 * Inside the component: `inject(DIALOG_DATA)` and `inject(DialogRef)`; wrap the template in `<fm-dialog-shell>`.
 * Focus returns to the element that was focused before opening. Browser-only: on the server `open` returns a ref
 * that never emits.
 */
@Injectable({ providedIn: 'root' })
export class DialogService {
    private readonly _appRef = inject(ApplicationRef);
    private readonly _envInjector = inject(EnvironmentInjector);
    private readonly _document = inject(DOCUMENT);
    private readonly _browser = isPlatformBrowser(inject(PLATFORM_ID));
    private readonly _open = new Set<ComponentRef<DialogHostComponent>>();

    open<C, D = unknown, R = unknown>(component: Type<C>, opts: DialogOptions<D> = {}): DialogRef<R> {
        const ref = new DialogRef<R>();
        if (!this._browser) return ref;

        const previousFocus = this._document.activeElement as HTMLElement | null;
        const host = createComponent(DialogHostComponent, { environmentInjector: this._envInjector });
        host.instance.size.set(opts.size ?? 'md');
        host.instance.ariaLabel.set(opts.ariaLabel ?? null);
        host.instance.dismissible = opts.dismissible ?? true;
        this._appRef.attachView(host.hostView);
        this._document.body.appendChild(host.location.nativeElement as HTMLElement);
        host.changeDetectorRef.detectChanges();

        const injector = Injector.create({
            providers: [
                { provide: DIALOG_DATA, useValue: opts.data },
                { provide: DialogRef, useValue: ref }
            ],
            parent: this._envInjector
        });
        host.instance.outlet().createComponent(component, { injector });
        host.changeDetectorRef.detectChanges();

        let result: R | undefined;
        const dialog = host.instance.dialog().nativeElement;
        ref.closer = (value?: R) => {
            result = value;
            if (dialog.open) dialog.close();
        };
        host.instance.closed = () => {
            this._appRef.detachView(host.hostView);
            host.destroy();
            this._open.delete(host);
            if (previousFocus?.isConnected) previousFocus.focus();
            ref.complete(result);
        };
        this._open.add(host);
        dialog.showModal();
        return ref;
    }

    /** Closes every open dialog (e.g. on sign-out). */
    closeAll(): void {
        for (const host of [...this._open]) host.instance.dialog().nativeElement.close();
    }
}
