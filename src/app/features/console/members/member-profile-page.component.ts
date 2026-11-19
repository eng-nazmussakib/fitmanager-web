import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { addDays, format, parseISO } from 'date-fns';
import type { ApexAxisChartSeries } from 'ng-apexcharts';

import { AuthService } from '@core/auth/auth.service';
import type { Invoice } from '@core/models/payment.model';
import { METHODS_NEEDING_REFERENCE, PAYMENT_METHOD_LABELS, type PaymentMethod, type Subscription } from '@core/models/subscription.model';
import { FilesService } from '@core/services/files.service';
import { InvoiceViewComponent } from '@features/shared/invoice-view.component';
import { PageHeaderComponent } from '@shared/components/page-header/page-header.component';
import { CanDirective } from '@shared/directives/can.directive';
import { AppDatePipe } from '@shared/pipes/app-date.pipe';
import { TakaPipe } from '@shared/pipes/taka.pipe';
import { ButtonComponent } from '@shared/ui/button/button.component';
import { ChartComponent } from '@shared/ui/chart/chart.component';
import { DialogComponent } from '@shared/ui/dialog/dialog.component';
import { DialogFooterDirective } from '@shared/ui/dialog/dialog-shell.component';
import { AlertComponent, AvatarComponent, BadgeComponent, CardComponent, SkeletonComponent, type Tone } from '@shared/ui/display/display';
import { EmptyStateComponent } from '@shared/ui/feedback/empty-state.component';
import { DatePickerComponent, todayIso } from '@shared/ui/forms/date-picker.component';
import { FieldComponent, InputDirective } from '@shared/ui/forms/field.component';
import { NumberInputComponent } from '@shared/ui/forms/number-input.component';
import { SelectComponent, type SelectOption } from '@shared/ui/forms/select.component';
import { IconComponent } from '@shared/ui/icon/icon.component';
import type { IconName } from '@shared/ui/icon/icons';
import { TabDirective, TabsComponent } from '@shared/ui/tabs/tabs.component';
import { ToastService } from '@shared/ui/toast/toast.service';

import { ConsoleService } from '../console.service';
import { MemberManageComponent } from './member-manage.component';

const STATUS_TONE: Record<string, Tone> = {
    Active: 'success',
    Expired: 'danger',
    Suspended: 'danger',
    Frozen: 'info',
    Pending: 'warning',
    Upcoming: 'info',
    Cancelled: 'neutral'
};
const TIMELINE_ICON: Record<string, IconName> = {
    joined: 'user-plus',
    subscription: 'clipboard-list',
    payment: 'banknote',
    freeze: 'snowflake',
    check_in: 'log-in',
    override: 'shield-alert',
    note: 'pencil',
    status: 'ban'
};

/**
 * H2: a member's profile. The header shows identity, status, plan, days left and dues, with the quick actions the
 * role allows; the tabs (`?tab=`) hold the details. Payments and freezes open in dialogs and every screen updates
 * at once (the API, here the mock, recomputes status and dues).
 */
@Component({
    selector: 'app-member-profile-page',
    imports: [
        FormsModule,
        RouterLink,
        InvoiceViewComponent,
        PageHeaderComponent,
        CanDirective,
        AppDatePipe,
        TakaPipe,
        ButtonComponent,
        ChartComponent,
        AlertComponent,
        AvatarComponent,
        BadgeComponent,
        CardComponent,
        SkeletonComponent,
        DialogComponent,
        DialogFooterDirective,
        EmptyStateComponent,
        DatePickerComponent,
        FieldComponent,
        InputDirective,
        NumberInputComponent,
        SelectComponent,
        IconComponent,
        TabsComponent,
        TabDirective,
        MemberManageComponent
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        @if (member.error()) {
            <fm-empty-state description="This member does not exist at this branch." icon="file-question" size="lg" title="Member not found">
                <a fmButton routerLink=".." variant="primary">Back to members</a>
            </fm-empty-state>
        } @else if (member.value(); as m) {
            <app-page-header [subtitle]="m.code + ' · joined ' + (m.joined_on | appDate)" [title]="m.name" />

            <fm-card class="mb-5">
                <div class="flex flex-col gap-5 lg:flex-row lg:items-center">
                    <div class="flex items-center gap-4">
                        <fm-avatar size="5rem" [name]="m.name" [src]="m.photo_url" />
                        <div>
                            <fm-badge dot [tone]="tone(m.status)">{{ m.status }}</fm-badge>
                            <p class="mt-1.5 font-medium">{{ m.plan_name ?? 'No plan yet' }}</p>
                            <p class="text-sm text-fg-muted">{{ m.phone }}</p>
                        </div>
                    </div>
                    <div class="grid flex-1 grid-cols-2 gap-4 sm:grid-cols-3 lg:border-l lg:border-border lg:pl-6">
                        <div>
                            <p class="text-xs text-fg-subtle">Valid until</p>
                            <p class="font-semibold">{{ m.valid_until ? (m.valid_until | appDate) : '–' }}</p>
                            @if (m.days_left !== null && subscriptionLength()) {
                                <div
                                    class="fm-progress mt-1.5"
                                    aria-valuemin="0"
                                    role="progressbar"
                                    [attr.aria-label]="'Days left: ' + m.days_left"
                                    [attr.aria-valuemax]="subscriptionLength()"
                                    [attr.aria-valuenow]="clamp(m.days_left)"
                                >
                                    <span
                                        [style.--fm-progress-color]="m.days_left <= 7 ? 'var(--color-warning)' : null"
                                        [style.width.%]="(clamp(m.days_left) / subscriptionLength()) * 100"
                                    ></span>
                                </div>
                                <p class="mt-1 text-xs" [class.text-danger-fg]="m.days_left < 0" [class.text-fg-subtle]="m.days_left >= 0">
                                    {{ m.days_left < 0 ? 'Expired ' + -m.days_left + ' days ago' : m.days_left + ' days left' }}
                                </p>
                            }
                        </div>
                        <div>
                            <p class="text-xs text-fg-subtle">Dues</p>
                            <p class="font-semibold" [class.text-danger-fg]="m.dues > 0">{{ m.dues | taka: 0 }}</p>
                        </div>
                        <div>
                            <p class="text-xs text-fg-subtle">Last visit</p>
                            <p class="font-semibold">{{ m.last_visit ? (m.last_visit | appDate: 'dd MMM, h:mm a') : 'Never' }}</p>
                        </div>
                    </div>
                    <div class="flex flex-wrap gap-2">
                        <button *appCan="'create'; on: 'Attendance'" fmButton variant="primary" [loading]="checking()" (click)="quickCheckIn()">
                            <fm-icon name="log-in" />
                            Check in
                        </button>
                        <a *appCan="'create'; on: 'Subscription'" fmButton routerLink="subscribe">
                            <fm-icon name="refresh-cw" />
                            {{ m.status === 'Pending' ? 'Sell first plan' : 'Renew' }}
                        </a>
                        @if (m.dues > 0) {
                            <button *appCan="'create'; on: 'Payment'" fmButton (click)="openPay()">
                                <fm-icon name="banknote" />
                                Record payment
                            </button>
                        }
                        @if (m.current_subscription_oid && m.status === 'Active') {
                            <button *appCan="'update'; on: 'Subscription'" fmButton (click)="freezeOpen.set(true)">
                                <fm-icon name="snowflake" />
                                Freeze
                            </button>
                        }
                    </div>
                </div>
                @if (m.status === 'Suspended') {
                    <fm-alert class="mt-4" title="Suspended" tone="danger">{{ m.notes }}</fm-alert>
                }
                @if (m.health_flags.length) {
                    <fm-alert class="mt-4" title="Health flags" tone="warning">
                        {{ m.health_flags.join(', ') }}. Check with the trainer before heavy sessions.
                    </fm-alert>
                }
            </fm-card>

            <app-member-manage class="mb-5 block" [member]="m" (changed)="reloadAll()" />

            <fm-tabs label="Member details" [active]="tab() ?? 'overview'" (activeChange)="setTab($event)">
                <ng-template fmTab="overview" label="Overview">
                    <div class="grid gap-4 lg:grid-cols-3">
                        <fm-card title="Contact">
                            <dl class="grid gap-3 text-sm">
                                <div>
                                    <dt class="text-fg-subtle">Mobile</dt>
                                    <dd>{{ m.phone }}</dd>
                                </div>
                                <div>
                                    <dt class="text-fg-subtle">E-mail</dt>
                                    <dd>{{ m.email ?? '–' }}</dd>
                                </div>
                                <div>
                                    <dt class="text-fg-subtle">Address</dt>
                                    <dd>{{ m.address ?? '–' }}</dd>
                                </div>
                                <div>
                                    <dt class="text-fg-subtle">Date of birth</dt>
                                    <dd>{{ m.date_of_birth ? (m.date_of_birth | appDate) : '–' }}</dd>
                                </div>
                                <div>
                                    <dt class="text-fg-subtle">Gender</dt>
                                    <dd>{{ m.gender }}</dd>
                                </div>
                            </dl>
                        </fm-card>
                        <fm-card title="Emergency contact">
                            @if (m.emergency_contact; as e) {
                                <dl class="grid gap-3 text-sm">
                                    <div>
                                        <dt class="text-fg-subtle">Name</dt>
                                        <dd>{{ e.name }} ({{ e.relation }})</dd>
                                    </div>
                                    <div>
                                        <dt class="text-fg-subtle">Mobile</dt>
                                        <dd>
                                            <a class="text-accent" [href]="'tel:' + e.phone">{{ e.phone }}</a>
                                        </dd>
                                    </div>
                                </dl>
                            } @else {
                                <p class="text-sm text-fg-muted">None recorded.</p>
                            }
                        </fm-card>
                        <fm-card title="Health and training">
                            <dl class="grid gap-3 text-sm">
                                <div>
                                    <dt class="text-fg-subtle">Health declaration</dt>
                                    <dd>{{ m.health_declared ? 'Signed' : 'Missing' }}</dd>
                                </div>
                                <div>
                                    <dt class="text-fg-subtle">Health flags</dt>
                                    <dd>{{ m.health_flags.length ? m.health_flags.join(', ') : 'None' }}</dd>
                                </div>
                                <div>
                                    <dt class="text-fg-subtle">Trainer</dt>
                                    <dd>{{ m.trainer_name ?? 'None' }}</dd>
                                </div>
                            </dl>
                        </fm-card>
                    </div>
                </ng-template>

                <ng-template fmTab="subscriptions" label="Subscriptions" [count]="subscriptions.value()?.length ?? null">
                    <fm-card flush>
                        <div class="overflow-x-auto">
                            <table class="fm-table">
                                <caption class="fm-sr-only">Subscription history</caption>
                                <thead>
                                    <tr>
                                        <th scope="col">Plan</th>
                                        <th scope="col">From</th>
                                        <th scope="col">To</th>
                                        <th class="fm-num" scope="col">Total</th>
                                        <th class="fm-num" scope="col">Due</th>
                                        <th scope="col">Status</th>
                                        <th scope="col"><span class="fm-sr-only">Actions</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    @for (s of subscriptions.value() ?? []; track s.oid) {
                                        <tr>
                                            <td>
                                                {{ s.plan_name }}
                                                @for (f of s.freezes; track f.from) {
                                                    <span class="block text-xs text-fg-subtle">
                                                        Frozen {{ f.from | appDate }} – {{ f.to | appDate }}: {{ f.reason }}
                                                    </span>
                                                }
                                            </td>
                                            <td>{{ s.start_date | appDate }}</td>
                                            <td>{{ s.end_date | appDate }}</td>
                                            <td class="fm-num">{{ s.total | taka: 0 }}</td>
                                            <td class="fm-num" [class.text-danger-fg]="s.due > 0">{{ s.due | taka: 0 }}</td>
                                            <td>
                                                <fm-badge dot [tone]="tone(s.status)">{{ s.status }}</fm-badge>
                                                @if (s.cancel_reason) {
                                                    <span class="block text-xs text-fg-subtle">{{ s.cancel_reason }}</span>
                                                }
                                            </td>
                                            <td class="fm-num whitespace-nowrap">
                                                @if (s.status === 'Active' || s.status === 'Frozen' || s.status === 'Upcoming') {
                                                    <ng-container *appCan="'update'; on: 'Subscription'">
                                                        @if (s.status === 'Active') {
                                                            <button fmButton size="sm" variant="ghost" (click)="openUpgrade(s)">Upgrade</button>
                                                        }
                                                        <button fmButton size="sm" variant="ghost" (click)="openCancel(s)">End plan</button>
                                                    </ng-container>
                                                }
                                            </td>
                                        </tr>
                                    } @empty {
                                        <tr>
                                            <td colspan="7"><fm-empty-state icon="clipboard-list" title="No subscriptions yet" /></td>
                                        </tr>
                                    }
                                </tbody>
                            </table>
                        </div>
                    </fm-card>
                </ng-template>

                <ng-template fmTab="payments" label="Payments">
                    <fm-card flush>
                        <div class="overflow-x-auto">
                            <table class="fm-table">
                                <caption class="fm-sr-only">Invoices</caption>
                                <thead>
                                    <tr>
                                        <th scope="col">Invoice</th>
                                        <th scope="col">Date</th>
                                        <th class="fm-num" scope="col">Total</th>
                                        <th class="fm-num" scope="col">Paid</th>
                                        <th class="fm-num" scope="col">Due</th>
                                        <th scope="col">Status</th>
                                        <th scope="col"><span class="fm-sr-only">Actions</span></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    @for (inv of invoices.value() ?? []; track inv.oid) {
                                        <tr>
                                            <td class="font-mono text-xs">{{ inv.number }}</td>
                                            <td>{{ inv.issued_at | appDate }}</td>
                                            <td class="fm-num">{{ inv.total | taka: 0 }}</td>
                                            <td class="fm-num">{{ inv.paid | taka: 0 }}</td>
                                            <td class="fm-num" [class.text-danger-fg]="inv.due > 0">{{ inv.due | taka: 0 }}</td>
                                            <td>
                                                <fm-badge dot [tone]="inv.status === 'Paid' ? 'success' : inv.status === 'Refunded' ? 'neutral' : 'warning'">
                                                    {{ inv.status }}
                                                </fm-badge>
                                            </td>
                                            <td class="fm-num whitespace-nowrap">
                                                <button fmButton size="sm" variant="ghost" (click)="receipt.set(inv)">Receipt</button>
                                                @if (inv.due > 0) {
                                                    <button *appCan="'create'; on: 'Payment'" fmButton size="sm" (click)="openPay(inv)">Pay</button>
                                                }
                                                @if (inv.paid > 0) {
                                                    <button *appCan="'create'; on: 'Payment'" fmButton size="sm" variant="ghost" (click)="openRefund(inv)">
                                                        Refund
                                                    </button>
                                                }
                                            </td>
                                        </tr>
                                    } @empty {
                                        <tr>
                                            <td colspan="7"><fm-empty-state icon="receipt" title="No invoices yet" /></td>
                                        </tr>
                                    }
                                </tbody>
                            </table>
                        </div>
                    </fm-card>
                </ng-template>

                <ng-template fmTab="attendance" label="Attendance">
                    <fm-card title="Visits" [subtitle]="visitCount() + ' visits in the last 12 weeks'">
                        @if (calendar(); as weeks) {
                            <div class="overflow-x-auto">
                                <div
                                    class="inline-grid grid-flow-col grid-rows-7 gap-1"
                                    role="img"
                                    [attr.aria-label]="visitCount() + ' visits in the last 12 weeks'"
                                >
                                    @for (week of weeks; track $index) {
                                        @for (day of week; track day.date) {
                                            <span
                                                class="size-4 rounded-[3px] sm:size-5"
                                                [style.background]="day.count ? 'var(--color-primary-500)' : 'var(--color-surface-sunken)'"
                                                [style.visibility]="day.future ? 'hidden' : null"
                                                [title]="(day.date | appDate) + ': ' + (day.count ? 'visited' : 'no visit')"
                                            ></span>
                                        }
                                    }
                                </div>
                            </div>
                            <p class="mt-3 flex items-center gap-3 text-xs text-fg-subtle">
                                <span class="flex items-center gap-1.5">
                                    <span class="size-3 rounded-[3px] bg-surface-sunken"></span>
                                    No visit
                                </span>
                                <span class="flex items-center gap-1.5">
                                    <span class="size-3 rounded-[3px] bg-primary-500"></span>
                                    Visited
                                </span>
                                <span>Columns are weeks (Saturday at the top).</span>
                            </p>
                        } @else {
                            <fm-skeleton height="9rem" />
                        }
                    </fm-card>
                </ng-template>

                <ng-template fmTab="progress" label="Progress">
                    <fm-card subtitle="Measured by the trainer, about every 4 weeks" title="Weight">
                        @if (measurements.value(); as list) {
                            @if (list.length > 1) {
                                @defer (on viewport) {
                                    <fm-chart kind="line" label="Weight over time" [categories]="weightDates()" [series]="weightSeries()" />
                                } @placeholder {
                                    <fm-skeleton height="280px" />
                                }
                                <p class="mt-2 text-sm text-fg-muted">
                                    From {{ list[0].weight_kg }} kg to {{ list[list.length - 1].weight_kg }} kg; waist {{ list[0].waist_cm }} →
                                    {{ list[list.length - 1].waist_cm }} cm.
                                </p>
                            } @else {
                                <fm-empty-state description="Measurements appear once a trainer records them." icon="activity" title="No measurements yet" />
                            }
                        }
                    </fm-card>
                </ng-template>

                <ng-template fmTab="documents" label="Documents" [count]="documents.value()?.length ?? null">
                    <fm-card subtitle="ID, medical notes, signed forms: PDF, JPEG or PNG up to 5 MB, at most 10." title="Documents">
                        <ul class="grid gap-2">
                            @for (d of documents.value() ?? []; track d.oid) {
                                <li class="flex items-center gap-3 text-sm">
                                    <fm-icon name="file-text" size="1rem" />
                                    <a class="fm-link" rel="noopener" target="_blank" [href]="d.url">{{ d.name }}</a>
                                    <span class="text-xs text-fg-subtle">
                                        {{ d.created_at | appDate }}{{ d.created_by_name ? ' · ' + d.created_by_name : '' }}
                                    </span>
                                </li>
                            } @empty {
                                <li><fm-empty-state icon="file-question" title="No documents yet" /></li>
                            }
                        </ul>
                        @if (!m.anonymised) {
                            <label *appCan="'create'; on: 'Member'" class="fm-btn fm-btn-secondary fm-btn-sm mt-4 cursor-pointer">
                                <fm-icon name="upload" size="1rem" />
                                {{ uploading() ? 'Uploading…' : 'Add a document' }}
                                <input #doc class="sr-only" type="file" accept="application/pdf,image/jpeg,image/png" (change)="addDocument(doc)" />
                            </label>
                        }
                    </fm-card>
                </ng-template>

                <ng-template fmTab="messages" label="Messages">
                    <fm-card
                        subtitle="Receipts, welcomes and expiry reminders. The member sees them in the portal; to reach them outside it, send one from your own phone or email."
                        title="Messages"
                    >
                        <ul class="grid gap-3">
                            @for (n of notifications.value() ?? []; track n.oid) {
                                <li class="text-sm">
                                    <p class="font-medium">{{ n.subject }}</p>
                                    <p class="text-fg-muted">{{ n.body }}</p>
                                    <p class="text-xs text-fg-subtle">{{ n.created_at | appDate: 'dd MMM yyyy, h:mm a' }}</p>
                                    <p class="mt-1 flex flex-wrap gap-1">
                                        @if (m.phone) {
                                            <a fmButton size="sm" variant="ghost" [href]="smsLink(m.phone, n.body)">
                                                <fm-icon name="message-square" size="0.875rem" />
                                                SMS
                                            </a>
                                        }
                                        @if (m.email) {
                                            <a fmButton size="sm" variant="ghost" [href]="mailLink(m.email, n.subject, n.body)">
                                                <fm-icon name="mail" size="0.875rem" />
                                                Email
                                            </a>
                                        }
                                        <button fmButton size="sm" variant="ghost" (click)="copyMessage(n.body)">
                                            <fm-icon name="copy" size="0.875rem" />
                                            Copy
                                        </button>
                                    </p>
                                </li>
                            } @empty {
                                <li><fm-empty-state icon="mail" title="No messages yet" /></li>
                            }
                        </ul>
                    </fm-card>
                </ng-template>

                <ng-template fmTab="timeline" label="Timeline">
                    <fm-card>
                        <ol class="relative ml-3 border-l border-border">
                            @for (e of timeline.value() ?? []; track e.oid) {
                                <li class="mb-5 ml-6">
                                    <span
                                        class="absolute -left-3.5 grid size-7 place-items-center rounded-full border border-border bg-surface"
                                        [class.text-warning-fg]="e.kind === 'override'"
                                    >
                                        <fm-icon size="0.875rem" [name]="timelineIcon(e.kind)" />
                                    </span>
                                    <p class="text-sm font-medium">{{ e.title }}</p>
                                    @if (e.detail) {
                                        <p class="text-sm text-fg-muted">{{ e.detail }}</p>
                                    }
                                    <p class="text-xs text-fg-subtle">{{ e.at | appDate: 'dd MMM yyyy, h:mm a' }}{{ e.by ? ' · ' + e.by : '' }}</p>
                                </li>
                            }
                        </ol>
                    </fm-card>
                </ng-template>
            </fm-tabs>

            <!-- Record a payment against an invoice with dues -->
            <fm-dialog size="sm" title="Record payment" [description]="'Dues: ' + (m.dues | taka: 0)" [(open)]="payOpen">
                <div class="grid gap-4">
                    <fm-field label="Invoice">
                        <fm-select [ngModel]="payInvoice()" [options]="dueInvoices()" (ngModelChange)="selectInvoice($event)" />
                    </fm-field>
                    <fm-field label="Method">
                        <fm-select [ngModel]="payMethod()" [options]="methodOptions" (ngModelChange)="payMethod.set($event ?? 'cash')" />
                    </fm-field>
                    @if (needsRef()) {
                        <fm-field hint="Transaction ID from the bKash, Nagad, card or bank slip" label="Reference" required>
                            <input autocomplete="off" fmInput [ngModel]="payRef()" (ngModelChange)="payRef.set($event)" />
                        </fm-field>
                    }
                    <fm-field label="Amount" required>
                        <fm-number-input taka [max]="selectedDue()" [min]="1" [ngModel]="payAmount()" (ngModelChange)="payAmount.set($event)" />
                    </fm-field>
                </div>
                <ng-container fmDialogFooter>
                    <button fmButton (click)="payOpen.set(false)">Cancel</button>
                    <button fmButton variant="primary" [disabled]="!payAmount() || (needsRef() && !payRef().trim())" [loading]="saving()" (click)="pay()">
                        Record {{ payAmount() ?? 0 | taka: 0 }}
                    </button>
                </ng-container>
            </fm-dialog>

            <fm-dialog size="sm" title="Freeze membership" [description]="freezeHelp()" [(open)]="freezeOpen">
                <div class="grid gap-4">
                    <fm-field label="From">
                        <fm-date-picker [min]="today" [ngModel]="freezeFrom()" (ngModelChange)="freezeFrom.set($event ?? today)" />
                    </fm-field>
                    <fm-field label="Days" [hint]="freezeRange()">
                        <fm-number-input
                            [max]="rules.value()?.freeze_max_days ?? 60"
                            [min]="rules.value()?.freeze_min_days ?? 7"
                            [ngModel]="freezeDays()"
                            (ngModelChange)="freezeDays.set($event ?? 14)"
                        />
                    </fm-field>
                    <fm-field label="Reason" required>
                        <input fmInput placeholder="e.g. Travelling abroad" [ngModel]="freezeReason()" (ngModelChange)="freezeReason.set($event)" />
                    </fm-field>
                </div>
                <ng-container fmDialogFooter>
                    <button fmButton (click)="freezeOpen.set(false)">Cancel</button>
                    <button fmButton variant="primary" [disabled]="!freezeReason().trim()" [loading]="saving()" (click)="freeze()">Freeze</button>
                </ng-container>
            </fm-dialog>

            <fm-dialog
                size="sm"
                title="End plan"
                [description]="'From today ' + (endTarget()?.plan_name ?? '') + ' gives no access. No money moves: refund separately if needed.'"
                [open]="!!endTarget()"
                (openChange)="!$event && endTarget.set(null)"
            >
                <fm-field label="Reason" required>
                    <input fmInput placeholder="e.g. Moving abroad" [ngModel]="endReason()" (ngModelChange)="endReason.set($event)" />
                </fm-field>
                <ng-container fmDialogFooter>
                    <button fmButton (click)="endTarget.set(null)">Cancel</button>
                    <button fmButton variant="danger" [disabled]="endReason().trim().length < 3" [loading]="saving()" (click)="endPlan()">End plan</button>
                </ng-container>
            </fm-dialog>

            <fm-dialog
                description="The new plan starts today. The unused days of the current one are credited on what was paid. Same or higher price only."
                size="sm"
                title="Upgrade plan"
                [open]="!!upgradeTarget()"
                (openChange)="!$event && upgradeTarget.set(null)"
            >
                <div class="grid gap-4">
                    <fm-field label="New plan" required>
                        <fm-select
                            ariaLabel="New plan"
                            placeholder="Choose a plan"
                            [ngModel]="upgradePlan()"
                            [options]="upgradeOptions()"
                            (ngModelChange)="upgradePlan.set($event)"
                        />
                    </fm-field>
                    <fm-field label="Method">
                        <fm-select [ngModel]="payMethod()" [options]="methodOptions" (ngModelChange)="payMethod.set($event ?? 'cash')" />
                    </fm-field>
                    @if (needsRef()) {
                        <fm-field label="Reference" required>
                            <input autocomplete="off" fmInput [ngModel]="payRef()" (ngModelChange)="payRef.set($event)" />
                        </fm-field>
                    }
                    <fm-field hint="0 to put it all on dues" label="Paid now">
                        <fm-number-input taka [min]="0" [ngModel]="payAmount()" (ngModelChange)="payAmount.set($event)" />
                    </fm-field>
                </div>
                <ng-container fmDialogFooter>
                    <button fmButton (click)="upgradeTarget.set(null)">Cancel</button>
                    <button
                        fmButton
                        variant="primary"
                        [disabled]="!upgradePlan() || ((payAmount() ?? 0) > 0 && needsRef() && !payRef().trim())"
                        [loading]="saving()"
                        (click)="upgradeNow()"
                    >
                        Upgrade
                    </button>
                </ng-container>
            </fm-dialog>

            <fm-dialog
                description="A full refund within 3 days of the sale, before the member has trained, ends the plan and can be done at the desk. Any other refund needs a branch manager."
                size="sm"
                title="Refund"
                [open]="!!refundTarget()"
                (openChange)="!$event && refundTarget.set(null)"
            >
                <div class="grid gap-4">
                    <fm-field label="Amount" required [hint]="'Paid on ' + (refundTarget()?.number ?? '') + ': ' + (refundTarget()?.paid ?? 0 | taka: 0)">
                        <fm-number-input
                            taka
                            [max]="refundTarget()?.paid ?? 0"
                            [min]="1"
                            [ngModel]="refundAmount()"
                            (ngModelChange)="refundAmount.set($event)"
                        />
                    </fm-field>
                    <fm-field label="Paid back by">
                        <fm-select [ngModel]="payMethod()" [options]="methodOptions" (ngModelChange)="payMethod.set($event ?? 'cash')" />
                    </fm-field>
                    <fm-field label="Reason" required>
                        <input fmInput placeholder="e.g. Changed their mind" [ngModel]="refundReason()" (ngModelChange)="refundReason.set($event)" />
                    </fm-field>
                </div>
                <ng-container fmDialogFooter>
                    <button fmButton (click)="refundTarget.set(null)">Cancel</button>
                    <button
                        fmButton
                        variant="danger"
                        [disabled]="!refundAmount() || refundReason().trim().length < 3"
                        [loading]="saving()"
                        (click)="refundNow()"
                    >
                        Refund {{ refundAmount() ?? 0 | taka: 0 }}
                    </button>
                </ng-container>
            </fm-dialog>

            <fm-dialog size="lg" title="Receipt" [open]="!!receipt()" (openChange)="!$event && receipt.set(null)">
                @if (receipt(); as r) {
                    <app-invoice-view [invoice]="r" />
                }
            </fm-dialog>
        } @else {
            <fm-skeleton height="2rem" width="40%" />
            <fm-card class="mt-5"><fm-skeleton height="5rem" /></fm-card>
        }
    `
})
export class MemberProfilePageComponent {
    private readonly _service = inject(ConsoleService);
    private readonly _toast = inject(ToastService);
    private readonly _files = inject(FilesService);
    private readonly _router = inject(Router);
    private readonly _route = inject(ActivatedRoute);
    protected readonly auth = inject(AuthService);

    readonly id = input.required<string>();
    readonly tab = input<string>();

    protected readonly today = todayIso();
    protected readonly methodOptions: SelectOption<PaymentMethod>[] = (Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map(m => ({
        value: m,
        label: PAYMENT_METHOD_LABELS[m]
    }));

    protected readonly member = rxResource({ params: () => this.id(), stream: ({ params }) => this._service.member(params) });
    protected readonly subscriptions = rxResource({ params: () => this.id(), stream: ({ params }) => this._service.memberSubscriptions(params) });
    protected readonly invoices = rxResource({ params: () => this.id(), stream: ({ params }) => this._service.memberInvoices(params) });
    protected readonly attendance = rxResource({ params: () => this.id(), stream: ({ params }) => this._service.memberAttendance(params, 84) });
    protected readonly measurements = rxResource({ params: () => this.id(), stream: ({ params }) => this._service.measurements(params) });
    protected readonly timeline = rxResource({ params: () => this.id(), stream: ({ params }) => this._service.timeline(params) });

    protected readonly checking = signal(false);
    protected readonly saving = signal(false);
    protected readonly payOpen = signal(false);
    protected readonly payInvoice = signal<string | null>(null);
    protected readonly payMethod = signal<PaymentMethod>('cash');
    protected readonly payRef = signal('');
    protected readonly payAmount = signal<number | null>(null);
    /** HQ's freeze rule (D-063, D-067 e): the dialog shows it and the API enforces it. */
    protected readonly rules = rxResource({ stream: () => this._service.rules() });
    protected readonly freezeRange = computed(() => {
        const r = this.rules.value();
        return r ? `${r.freeze_min_days} to ${r.freeze_max_days} days` : '';
    });
    protected readonly freezeHelp = computed(() => {
        const r = this.rules.value();
        if (!r) return 'The days are added to the end of the plan.';
        const times = r.freeze_max_count === 1 ? 'once' : r.freeze_max_count === 2 ? 'twice' : `${r.freeze_max_count} times`;
        return `The days are added to the end of the plan. A plan can be frozen ${times}, ${r.freeze_min_days} to ${r.freeze_max_days} days each.`;
    });
    protected readonly freezeOpen = signal(false);
    protected readonly freezeFrom = signal(todayIso());
    protected readonly freezeDays = signal(14);
    protected readonly freezeReason = signal('');
    protected readonly receipt = signal<Invoice | null>(null);
    protected readonly documents = rxResource({ params: () => this.id(), stream: ({ params }) => this._service.documents(params) });
    protected readonly notifications = rxResource({ params: () => this.id(), stream: ({ params }) => this._service.notifications(params) });
    protected readonly uploading = signal(false);
    protected readonly endTarget = signal<Subscription | null>(null);
    protected readonly endReason = signal('');
    protected readonly upgradeTarget = signal<Subscription | null>(null);
    protected readonly upgradePlan = signal<string | null>(null);
    private readonly _plans = rxResource({ params: () => this.upgradeTarget()?.oid, stream: () => this._service.plans() });
    protected readonly upgradeOptions = computed<SelectOption<string>[]>(() => {
        const current = this.upgradeTarget();
        return (this._plans.value() ?? [])
            .filter(p => p.oid !== current?.plan_oid)
            .map(p => ({ value: p.oid, label: `${p.name} · ৳${p.price.toLocaleString('en-IN')}` }));
    });
    protected readonly refundTarget = signal<Invoice | null>(null);
    protected readonly refundAmount = signal<number | null>(null);
    protected readonly refundReason = signal('');

    protected readonly needsRef = computed(() => METHODS_NEEDING_REFERENCE.includes(this.payMethod()));
    protected readonly dueInvoices = computed<SelectOption<string>[]>(() =>
        (this.invoices.value() ?? []).filter(i => i.due > 0).map(i => ({ value: i.oid, label: `${i.number} · due ৳${i.due.toLocaleString('en-IN')}` }))
    );
    protected readonly selectedDue = computed(() => this.invoices.value()?.find(i => i.oid === this.payInvoice())?.due ?? 0);
    protected readonly subscriptionLength = computed(() => {
        const current = this.subscriptions.value()?.find(s => s.oid === this.member.value()?.current_subscription_oid) ?? this.subscriptions.value()?.[0];
        return current ? Math.round((parseISO(current.end_date).getTime() - parseISO(current.start_date).getTime()) / 86_400_000) + 1 : 0;
    });
    /** 12 columns of 7 days (Saturday first), ending this week. */
    protected readonly calendar = computed(() => {
        const a = this.attendance.value();
        if (!a) return null;
        const visited = new Map(a.days.map(d => [d.date, d.count]));
        const end = parseISO(a.to);
        // Weeks run Saturday to Friday: start 11 weeks before the Saturday of this week.
        const start = addDays(end, -((end.getDay() + 1) % 7) - 77);
        const weeks: { date: string; count: number; future: boolean }[][] = [];
        for (let w = 0; w < 12; w++) {
            weeks.push(
                Array.from({ length: 7 }, (_, d) => {
                    const date = format(addDays(start, w * 7 + d), 'yyyy-MM-dd');
                    return { date, count: visited.get(date) ?? 0, future: date > a.to };
                })
            );
        }
        return weeks;
    });
    protected readonly visitCount = computed(() => this.attendance.value()?.days.length ?? 0);
    protected readonly weightDates = computed(() => (this.measurements.value() ?? []).map(m => format(parseISO(m.date), 'd MMM')));
    protected readonly weightSeries = computed<ApexAxisChartSeries>(() => [
        { name: 'Weight (kg)', data: (this.measurements.value() ?? []).map(m => m.weight_kg) }
    ]);

    protected tone(status: string): Tone {
        return STATUS_TONE[status] ?? 'neutral';
    }

    /**
     * Sending a message by hand (D-075: no SMS or email provider): open the staff member's own SMS or email app
     * with the text filled in, or copy it for WhatsApp or anything else.
     */
    protected smsLink(phone: string, body: string): string {
        return `sms:${phone}?body=${encodeURIComponent(body)}`;
    }

    protected mailLink(email: string, subject: string, body: string): string {
        return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }

    protected copyMessage(body: string): void {
        navigator.clipboard.writeText(body).then(
            () => this._toast.success('Message copied'),
            () => this._toast.show('Copy failed: select the text and copy it instead.', { tone: 'danger' })
        );
    }

    protected timelineIcon(kind: string): IconName {
        return TIMELINE_ICON[kind] ?? 'info';
    }

    protected clamp(days: number): number {
        return Math.max(0, Math.min(days, this.subscriptionLength()));
    }

    protected setTab(tab: string): void {
        void this._router.navigate([], { relativeTo: this._route, queryParams: { tab: tab === 'overview' ? null : tab }, replaceUrl: true });
    }

    protected quickCheckIn(): void {
        const m = this.member.value();
        if (!m) return;
        this.checking.set(true);
        this._service.evaluate({ member_oid: m.oid }).subscribe({
            next: d => {
                if (!d.allowed) {
                    this.checking.set(false);
                    this._toast.show(d.failures.map(f => f.message).join(' '), { tone: 'danger', title: 'Check-in blocked' });
                    return;
                }
                this._service.checkIn({ member_oid: m.oid }).subscribe({ next: () => this._reload(), error: () => this.checking.set(false) });
            },
            error: () => this.checking.set(false)
        });
    }

    protected openPay(invoice?: Invoice): void {
        const target = invoice ?? this.invoices.value()?.find(i => i.due > 0);
        if (!target) return;
        this.selectInvoice(target.oid);
        this.payOpen.set(true);
    }

    protected selectInvoice(oid: string | null): void {
        this.payInvoice.set(oid);
        this.payAmount.set(this.invoices.value()?.find(i => i.oid === oid)?.due ?? null);
    }

    protected pay(): void {
        const invoiceOid = this.payInvoice();
        const amount = this.payAmount();
        if (!invoiceOid || !amount) return;
        this.saving.set(true);
        this._service.pay({ invoice_oid: invoiceOid, amount, method: this.payMethod(), reference: this.payRef().trim() || null }).subscribe({
            next: () => {
                this.payOpen.set(false);
                this.payRef.set('');
                this._reload();
            },
            error: () => this.saving.set(false)
        });
    }

    protected freeze(): void {
        const sub = this.member.value()?.current_subscription_oid;
        if (!sub) return;
        this.saving.set(true);
        this._service.freeze(sub, { from: this.freezeFrom(), days: this.freezeDays(), reason: this.freezeReason().trim() }).subscribe({
            next: () => {
                this.freezeOpen.set(false);
                this.freezeReason.set('');
                this._reload();
            },
            error: () => this.saving.set(false)
        });
    }

    protected reloadAll(): void {
        this._reload();
        this.documents.reload();
        this.notifications.reload();
    }

    protected addDocument(input: HTMLInputElement): void {
        const file = input.files?.[0];
        const m = this.member.value();
        if (!file || !m) return;
        this.uploading.set(true);
        this._files.upload('member_document', file, file.name, m.oid).subscribe({
            next: () => {
                this.uploading.set(false);
                input.value = '';
                this._toast.success('Document saved');
                this.documents.reload();
            },
            error: () => {
                this.uploading.set(false);
                input.value = '';
            }
        });
    }

    protected openCancel(s: Subscription): void {
        this.endReason.set('');
        this.endTarget.set(s);
    }

    protected endPlan(): void {
        const s = this.endTarget();
        if (!s) return;
        this.saving.set(true);
        this._service.cancelSubscription(s.oid, this.endReason().trim()).subscribe({
            next: () => {
                this.endTarget.set(null);
                this._reload();
            },
            error: () => this.saving.set(false)
        });
    }

    protected openUpgrade(s: Subscription): void {
        this.upgradePlan.set(null);
        this.payAmount.set(0);
        this.payRef.set('');
        this.upgradeTarget.set(s);
    }

    protected upgradeNow(): void {
        const s = this.upgradeTarget();
        const plan = this.upgradePlan();
        if (!s || !plan) return;
        this.saving.set(true);
        this._service
            .upgrade(s.oid, { plan_oid: plan, payment: { method: this.payMethod(), amount: this.payAmount() ?? 0, reference: this.payRef().trim() || null } })
            .subscribe({
                next: out => {
                    this.upgradeTarget.set(null);
                    this._toast.success(out.credit ? `Upgraded. ৳${out.credit.toLocaleString('en-IN')} credited for the unused days.` : 'Upgraded');
                    this.receipt.set(out.invoice);
                    this._reload();
                },
                error: () => this.saving.set(false)
            });
    }

    protected openRefund(inv: Invoice): void {
        this.refundAmount.set(inv.paid);
        this.refundReason.set('');
        this.payMethod.set('cash');
        this.refundTarget.set(inv);
    }

    protected refundNow(): void {
        const inv = this.refundTarget();
        const amount = this.refundAmount();
        if (!inv || !amount) return;
        this.saving.set(true);
        this._service.refund(inv.oid, { amount, method: this.payMethod(), reason: this.refundReason().trim() }).subscribe({
            next: () => {
                this.refundTarget.set(null);
                this._toast.success('Refund recorded');
                this._reload();
            },
            error: () => this.saving.set(false)
        });
    }

    private _reload(): void {
        this.saving.set(false);
        this.checking.set(false);
        this.member.reload();
        this.subscriptions.reload();
        this.invoices.reload();
        this.attendance.reload();
        this.timeline.reload();
    }
}
