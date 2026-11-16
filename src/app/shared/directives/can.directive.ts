import { Directive, effect, inject, input, TemplateRef, ViewContainerRef } from '@angular/core';

import type { Action, Subject } from '@core/auth/ability';
import { AuthService } from '@core/auth/auth.service';

/**
 * `<button *appCan="'create'; on: 'Member'">`  (reads as "can create on Item").
 *
 * Structural: an unauthorised element is never created.
 * OMS AccessControlDirective set `display: none`, which left the button in the DOM, where devtools could re-enable it.
 * It re-renders when the ability changes (sign in as another user) through an effect().
 *
 * `@casl/angular` is not used: its `able` pipe is impure (runs on every change detection),
 * while a signal-based ability + effect is zoneless-friendly and re-runs only when the rules change.
 */
@Directive({ selector: '[appCan]' })
export class CanDirective {
    private readonly _auth = inject(AuthService);
    private readonly _tpl = inject(TemplateRef<unknown>);
    private readonly _vcr = inject(ViewContainerRef);
    private _rendered = false;

    readonly appCan = input.required<Action>();
    readonly appCanOn = input.required<Subject>();

    constructor() {
        effect(() => {
            const allowed = this._auth.can(this.appCan(), this.appCanOn());
            if (allowed && !this._rendered) this._vcr.createEmbeddedView(this._tpl);
            if (!allowed && this._rendered) this._vcr.clear();
            this._rendered = allowed;
        });
    }
}
