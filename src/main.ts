import { bootstrapApplication } from '@angular/platform-browser';

import { printSelfXssWarning } from '@core/utils/console-warning';
import { environment } from '@env/environment';

import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

if (environment.production) printSelfXssWarning();

bootstrapApplication(AppComponent, appConfig).catch(err => console.error(err));
