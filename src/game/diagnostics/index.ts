import { loadSettings } from '../settings.ts';
import { profileSuffix } from '../profile.ts';
import { DiagnosticReporter, type DiagnosticEvent, type DiagnosticKind, type DiagnosticOperation, type DiagnosticScreen } from './reporter.ts';

let reporter: DiagnosticReporter | undefined;
let sender: ((events: DiagnosticEvent[]) => Promise<boolean>) | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
export const APP_RELEASE = import.meta.env?.VITE_APP_RELEASE ?? 'dev';

export function installDiagnostics(): void {
  if (reporter) return;
  let storage: Storage | undefined;
  try { storage = localStorage; } catch { /* Blocked storage. */ }
  const native = (window as Window & { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.();
  const platform = native === 'android' || native === 'ios' ? native : 'web';
  reporter = new DiagnosticReporter({ release: APP_RELEASE, platform, origin: location.origin,
    enabled: loadSettings().diagnostics, storage, key: `sudoku-dragons.diagnostics${profileSuffix}` });
  window.addEventListener('error', (event) => reportDiagnostic('runtime', 'unhandled', event.error));
  window.addEventListener('unhandledrejection', (event) => reportDiagnostic('runtime', 'unhandled', event.reason));
  window.addEventListener('online', () => void flushDiagnostics());
}

export function reportDiagnostic(kind: DiagnosticKind, operation: DiagnosticOperation, error?: unknown): void {
  reporter?.capture(kind, operation, error);
}
export function setDiagnosticScreen(screen: DiagnosticScreen): void { reporter?.setScreen(screen); }
export function setDiagnosticsEnabled(enabled: boolean): void { reporter?.setEnabled(enabled); }
export function clearDiagnosticQueue(): void {
  reporter?.setEnabled(false);
  reporter?.setEnabled(loadSettings().diagnostics);
}
export function reportBootDuration(ms: number): void { reporter?.capture('performance', 'boot', undefined, 'boot-ms', ms); }

/** Configured by the authenticated network module: diagnostics never create an account on their own. */
export function setDiagnosticTransport(send: (events: DiagnosticEvent[]) => Promise<boolean>): void {
  sender = send;
  timer ??= setInterval(() => { if (!document.hidden) void flushDiagnostics(); }, 60_000);
}
export async function flushDiagnostics(): Promise<void> {
  if (sender && reporter) await reporter.flush(sender);
}
