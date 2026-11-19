import { Directive } from '@angular/core';

/**
 * `<input appDigitsOnly>` blocks anything that is not 0-9 (typed or pasted).
 * Uses `beforeinput`, so paste and IME input are covered, not only keypress.
 */
@Directive({
    selector: '[appDigitsOnly]',
    host: { '(beforeinput)': 'onBeforeInput($event)', inputmode: 'numeric' }
})
export class DigitsOnlyDirective {
    onBeforeInput(event: InputEvent): void {
        if (event.data && /\D/.test(event.data)) event.preventDefault();
    }
}
