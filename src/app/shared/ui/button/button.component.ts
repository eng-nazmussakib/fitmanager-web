import { booleanAttribute, ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * `<button fmButton variant="primary">Save</button>`, also on links: `<a fmButton routerLink="…">`.
 * - `iconOnly`: a square button for one icon; give it an `aria-label`.
 * - `loading`: shows a spinner, keeps the width, disables the button and sets `aria-busy`.
 * Bind `[disabled]` to the component (it is an input), so loading and disabled combine.
 */
@Component({
    // An attribute selector on native elements (like Angular Material's buttons): the element stays a <button> or <a>.
    // eslint-disable-next-line @angular-eslint/component-selector
    selector: 'button[fmButton], a[fmButton]',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        '[class]': 'classes()',
        '[attr.disabled]': 'isButton && (disabled() || loading()) ? "" : null',
        '[attr.aria-disabled]': '!isButton && disabled() ? "true" : null',
        '[attr.aria-busy]': 'loading() ? "true" : null',
        '[attr.data-loading]': 'loading() ? "" : null',
        '[attr.type]': 'isButton ? type() : null'
    },
    template: `
        <span class="fm-btn-content"><ng-content /></span>
        @if (loading()) {
            <span class="fm-btn-spinner" aria-hidden="true"><span class="fm-spinner"></span></span>
        }
    `
})
export class ButtonComponent {
    /** Anchors get aria-disabled instead of the disabled attribute, and no `type`. */
    protected readonly isButton = (inject(ElementRef).nativeElement as HTMLElement).tagName === 'BUTTON';

    readonly variant = input<ButtonVariant>('secondary');
    readonly size = input<ButtonSize>('md');
    readonly iconOnly = input(false, { transform: booleanAttribute });
    readonly block = input(false, { transform: booleanAttribute });
    readonly loading = input(false, { transform: booleanAttribute });
    readonly disabled = input(false, { transform: booleanAttribute });
    /** Native button type. Defaults to "button", so a kit button never submits a form by accident. */
    readonly type = input<'button' | 'submit' | 'reset'>('button');

    protected readonly classes = computed(() =>
        [
            'fm-btn',
            `fm-btn-${this.variant()}`,
            this.size() === 'md' ? '' : `fm-btn-${this.size()}`,
            this.iconOnly() ? 'fm-btn-icon' : '',
            this.block() ? 'fm-btn-block' : ''
        ]
            .filter(Boolean)
            .join(' ')
    );
}
