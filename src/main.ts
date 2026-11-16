import { bootstrapApplication } from '@angular/platform-browser';

import { initSentry } from '@core/error/sentry';
import { printSelfXssWarning } from '@core/utils/console-warning';
import { environment } from '@env/environment';

import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

// Sentry must start before Angular so it also catches bootstrap errors.
initSentry();

if (environment.production) printSelfXssWarning();

bootstrapApplication(AppComponent, appConfig).catch(err => console.error(err));
