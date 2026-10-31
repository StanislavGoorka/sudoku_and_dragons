import { installDiagnostics, reportDiagnostic } from './diagnostics/index.ts';

// Install before evaluating Pixi, account/storage modules or any screen.
installDiagnostics();
void import('./main.ts').catch((error) => reportDiagnostic('runtime', 'boot', error));
