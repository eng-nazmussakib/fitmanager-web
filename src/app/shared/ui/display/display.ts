import { booleanAttribute, ChangeDetectionStrategy, Component, computed, Directive, input } from '@angular/core';

import { IconComponent } from '../icon/icon.component';
import type { IconName } from '../icon/icons';

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

/** `<fm-spinner />`: an indeterminate loading indicator. Give it a `label` when nothing else says what is loading. */
@Component({
    selector: 'fm-spinner',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'inline-flex', role: 'status', '[attr.aria-label]': 'label()' },
    template: `
        <span class="fm-spinner" [style.--fm-spinner-size]="size()"></span>
    `
})
export class SpinnerComponent {
    readonly size = input('1.125rem');
    readonly label = input('Loading');
}

/** `<fm-skeleton width="60%" height="1rem" />`: a placeholder block while content loads (hidden from assistive tech). */
@Component({
    selector: 'fm-skeleton',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: {
        class: 'fm-skeleton',
        'aria-hidden': 'true',
        '[style.width]': 'width()',
        '[style.height]': 'height()',
        '[style.border-radius]': 'circle() ? "9999px" : null'
    },
    template: ''
})
export class SkeletonComponent {
    readonly width = input('100%');
    readonly height = input('1rem');
    readonly circle = input(false, { transform: booleanAttribute });
}

/** `<fm-badge tone="success" dot>Active</fm-badge>`: a short status label. */
@Component({
    selector: 'fm-badge',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { '[class]': 'classes()' },
    template: `
        <ng-content />
    `
})
export class BadgeComponent {
    readonly tone = input<Tone>('neutral');
    readonly dot = input(false, { transform: booleanAttribute });

    protected readonly classes = computed(() => `fm-badge${this.tone() === 'neutral' ? '' : ' fm-badge-' + this.tone()}${this.dot() ? ' fm-badge-dot' : ''}`);
}

/** `<fm-avatar name="Rahim Uddin" [src]="photo" />`: a photo, or the name's initials when there is none. */
@Component({
    selector: 'fm-avatar',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'fm-avatar', '[style.--fm-avatar-size]': 'size()' },
    template: `
        @if (src(); as src) {
            <img loading="lazy" [alt]="decorative() ? '' : name()" [src]="src" />
        } @else {
            <span [attr.aria-hidden]="decorative() ? 'true' : null" [attr.aria-label]="decorative() ? null : name()" [attr.role]="decorative() ? null : 'img'">
                {{ initials() }}
            </span>
        }
    `
})
export class AvatarComponent {
    readonly name = input.required<string>();
    readonly src = input<string | null | undefined>(null);
    /** CSS size. */
    readonly size = input('2.25rem');
    /** The name is already written next to the avatar: hide it from screen readers. */
    readonly decorative = input(true, { transform: booleanAttribute });

    protected readonly initials = computed(() =>
        this.name()
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map(w => w[0]?.toUpperCase() ?? '')
            .join('')
    );
}

/**
 * `<fm-card title="Recent payments">…</fm-card>`. Header actions go in `[fmCardActions]`, a footer in
 * `<footer fmCardFooter>`. `flush` removes the body padding (tables, lists).
 */
@Component({
    selector: 'fm-card',
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { class: 'fm-card' },
    template: `
        @if (title()) {
            <header class="fm-card-header">
                <div class="min-w-0">
                    <h2 class="fm-card-title">{{ title() }}</h2>
                    @if (subtitle()) {
                        <p class="text-sm text-fg-subtle">{{ subtitle() }}</p>
                    }
                </div>
                <ng-content select="[fmCardActions]" />
            </header>
        }
        <div class="fm-card-body" [style.padding]="flush() ? 0 : null"><ng-content /></div>
        <ng-content select="[fmCardFooter]" />
    `
})
export class CardComponent {
    readonly title = input<string>();
    readonly subtitle = input<string>();
    readonly flush = input(false, { transform: booleanAttribute });
}

/** `<footer fmCardFooter>`: a card footer with right-aligned actions. */
@Directive({ selector: '[fmCardFooter]', host: { class: 'fm-card-footer' } })
export class CardFooterDirective {}

/** `<hr fmDivider />` */
@Directive({ selector: 'hr[fmDivider]', host: { class: 'fm-divider' } })
export class DividerDirective {}

const ALERT_ICONS: Record<Exclude<Tone, 'neutral' | 'primary'>, IconName> = {
    info: 'info',
    success: 'circle-check',
    warning: 'triangle-alert',
    danger: 'circle-alert'
};

/**
 * `<fm-alert tone="warning" title="Dues over the limit">…</fm-alert>`: an inline message. Warnings and errors are
 * announced (`role="alert"`); info and success are polite (`role="status"`).
 */
@Component({
    selector: 'fm-alert',
    imports: [IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { '[class]': '"fm-alert fm-alert-" + tone()', '[attr.role]': 'tone() === "danger" || tone() === "warning" ? "alert" : "status"' },
    template: `
        <fm-icon [name]="icon()" />
        <div class="min-w-0 flex-1">
            @if (title()) {
                <p class="fm-alert-title">{{ title() }}</p>
            }
            <div><ng-content /></div>
        </div>
        <ng-content select="[fmAlertActions]" />
    `
})
export class AlertComponent {
    readonly tone = input<'info' | 'success' | 'warning' | 'danger'>('info');
    readonly title = input<string>();

    protected readonly icon = computed(() => ALERT_ICONS[this.tone()]);
}
