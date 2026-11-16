import { isPlatformBrowser } from '@angular/common';
import {
    booleanAttribute,
    ChangeDetectionStrategy,
    Component,
    Directive,
    ElementRef,
    inject,
    input,
    OnDestroy,
    PLATFORM_ID,
    signal,
    viewChild
} from '@angular/core';

import { anchorPosition, type Placement } from '../a11y/anchor-position';
import { RovingFocusDirective } from '../a11y/roving-focus.directive';

let nextId = 0;

type PopoverElement = HTMLElement & { showPopover?: () => void; hidePopover?: () => void };

/**
 * A dropdown menu (WAI-ARIA menu button pattern), on a `popover="auto"` element in the top layer: light dismiss
 * and Esc for free. Replaces nz-dropdown (D-007).
 *
 *   <button fmButton [fmMenuTrigger]="rowMenu" aria-label="Row actions">…</button>
 *   <fm-menu #rowMenu>
 *     <button fmMenuItem (click)="edit()">Edit</button>
 *     <div class="fm-menu-sep" role="separator"></div>
 *     <button fmMenuItem danger (click)="remove()">Delete</button>
 *   </fm-menu>
 *
 * Keyboard: Enter, Space or ↓ on the trigger opens it on the first item (↑ on the last); arrows, Home/End and
 * typing a letter move; activating an item closes the menu and returns focus to the trigger.
 */
@Component({
    selector: 'fm-menu',
    imports: [RovingFocusDirective],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <!-- eslint-disable-next-line @angular-eslint/template/interactive-supports-focus -- delegated clicks of the menu items, which are focusable -->
        <div
            #panel
            class="fm-popover"
            fmRovingFocus
            itemSelector="[role=menuitem]"
            popover="auto"
            role="menu"
            [attr.aria-label]="label() || null"
            [id]="menuId"
            (click)="onClick($event)"
            (keydown)="onKey($event)"
            (toggle)="onToggle($event)"
        >
            <ng-content />
        </div>
    `
})
export class MenuComponent implements OnDestroy {
    private readonly _panel = viewChild.required<ElementRef<PopoverElement>>('panel');
    private readonly _roving = viewChild.required(RovingFocusDirective);
    private readonly _browser = isPlatformBrowser(inject(PLATFORM_ID));
    private _anchor: HTMLElement | null = null;
    private _unanchor: (() => void) | null = null;

    readonly menuId = `fm-menu-${nextId++}`;
    readonly isOpen = signal(false);

    readonly placement = input<Placement>('bottom-end');
    readonly label = input<string>();

    open(anchor: HTMLElement, focus: 'first' | 'last' = 'first'): void {
        const panel = this._panel().nativeElement;
        if (!this._browser || typeof panel.showPopover !== 'function') return;
        this._anchor = anchor;
        panel.showPopover();
        this._unanchor = anchorPosition(anchor, panel, { placement: this.placement() });
        if (focus === 'last') this._roving().focusLast();
        else this._roving().focusFirst();
    }

    close(refocus = true): void {
        const panel = this._panel().nativeElement;
        if (panel.matches(':popover-open')) panel.hidePopover?.();
        if (refocus) this._anchor?.focus();
    }

    toggle(anchor: HTMLElement): void {
        if (this.isOpen()) this.close();
        else this.open(anchor);
    }

    ngOnDestroy(): void {
        this._unanchor?.();
    }

    protected onClick(event: MouseEvent): void {
        const item = (event.target as HTMLElement).closest('[role=menuitem]');
        if (item && item.getAttribute('aria-disabled') !== 'true') this.close();
    }

    protected onKey(event: KeyboardEvent): void {
        if (event.key === 'Tab') this.close(false);
    }

    protected onToggle(event: Event): void {
        const opened = (event as ToggleEvent).newState === 'open';
        this.isOpen.set(opened);
        if (!opened) {
            this._unanchor?.();
            this._unanchor = null;
            const panel = this._panel().nativeElement;
            if (panel.contains(panel.ownerDocument.activeElement)) this._anchor?.focus();
        }
    }
}

/** Opens a `<fm-menu>` from a button. */
@Directive({
    selector: '[fmMenuTrigger]',
    host: {
        'aria-haspopup': 'menu',
        '[attr.aria-expanded]': 'fmMenuTrigger().isOpen()',
        '[attr.aria-controls]': 'fmMenuTrigger().menuId',
        '(click)': 'fmMenuTrigger().toggle(el.nativeElement)',
        '(keydown)': 'onKey($event)'
    }
})
export class MenuTriggerDirective {
    protected readonly el = inject<ElementRef<HTMLElement>>(ElementRef);

    readonly fmMenuTrigger = input.required<MenuComponent>();

    protected onKey(event: KeyboardEvent): void {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            this.fmMenuTrigger().open(this.el.nativeElement, event.key === 'ArrowUp' ? 'last' : 'first');
        }
    }
}

/** An entry of a `<fm-menu>`: a button or a link. `danger` colours it red. */
@Directive({
    selector: 'button[fmMenuItem], a[fmMenuItem]',
    host: { class: 'fm-menu-item', role: 'menuitem', tabindex: '-1', '[class.fm-danger]': 'danger()', '[attr.type]': 'isButton ? "button" : null' }
})
export class MenuItemDirective {
    protected readonly isButton = (inject(ElementRef).nativeElement as HTMLElement).tagName === 'BUTTON';

    readonly danger = input(false, { transform: booleanAttribute });
}
