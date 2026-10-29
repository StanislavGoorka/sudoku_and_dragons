import type { AuthError, User } from '@supabase/supabase-js';
import { emptyProgress } from '../progress/progress.ts';
import { replaceProgress } from '../progress/store.ts';
import { forgetCloudBase, syncProgress } from './cloudSave.ts';
import { randomNickname } from './nickname.ts';
import { connect, localNickname, OnlineError, supabase, switchedAccount } from './online.ts';

/**
 * Accounts with an e-mail and a password. Everyone starts as a guest (an anonymous account, see
 * online.ts). Registering gives the guest's own account an e-mail and a password, so nothing moves:
 * the e-mail is confirmed with the code (or the link) Supabase mails, and only then can the
 * password be set. Logging in on another device switches to that account and adds the guest's
 * progress to it (cloudSave.ts); logging out starts a fresh guest.
 */

export const PASSWORD_MIN = 6;

/** A failed account action; `code` picks the message (accountErrorMessage). */
export class AccountError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

function fail(error: AuthError | null): never {
  if (error?.name === 'AuthRetryableFetchError' || error?.status === 0) throw new AccountError('network');
  throw new AccountError(error?.code ?? 'unknown');
}

let user: User | null = null;
const listeners = new Set<() => void>();

supabase.auth.onAuthStateChange((_event, session) => {
  user = session?.user ?? null;
  // Outside the callback: Supabase holds a lock while it runs.
  setTimeout(() => listeners.forEach((listener) => listener()), 0);
});

/** The e-mail of the account signed in on this device, or null for a guest. */
export function accountEmail(): string | null {
  return user && !user.is_anonymous && user.email ? user.email : null;
}

/** Called when someone logs in or out, or the account gets its e-mail; returns a function that stops it. */
export function onAccountChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function checkEmail(email: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AccountError('bad-email');
}

function checkPassword(password: string): void {
  if (password.length < PASSWORD_MIN) throw new AccountError('short-password');
}

function checkCode(code: string): void {
  if (!/^\d{6,10}$/.test(code)) throw new AccountError('bad-code');
}

/** A registration waiting for its e-mail to be confirmed. The password stays in memory only. */
let pending: { email: string; password: string } | null = null;

export function pendingEmail(): string | null {
  return pending?.email ?? null;
}

/** Starts making this guest an account: Supabase mails a code (and a link) to confirm the e-mail. */
export async function register(email: string, password: string): Promise<void> {
  checkEmail(email);
  checkPassword(password);
  try {
    await connect();
  } catch (error) {
    throw new AccountError(error instanceof OnlineError && error.code !== 'network' ? 'unknown' : 'network');
  }
  if (accountEmail()) throw new AccountError('signed-in');
  const { error } = await supabase.auth.updateUser({ email });
  if (error) fail(error);
  pending = { email, password };
}

/** Confirms the e-mail with the code from the mail, then sets the password: the account is ready. */
export async function confirmRegistration(code: string): Promise<void> {
  if (!pending) throw new AccountError('unknown');
  checkCode(code);
  const { error } = await supabase.auth.verifyOtp({ email: pending.email, token: code, type: 'email_change' });
  if (error) fail(error);
  await finishRegistration();
}

/**
 * Whether the e-mail got confirmed outside the game (the link in the mail opens a browser):
 * then it finishes the registration. Asked when the game comes back to the front.
 */
export async function checkRegistration(): Promise<boolean> {
  if (!pending) return false;
  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.user || data.user.is_anonymous || data.user.email !== pending.email) return false;
  await finishRegistration();
  return true;
}

async function finishRegistration(): Promise<void> {
  const password = pending!.password;
  const { error } = await supabase.auth.updateUser({ password });
  if (error) fail(error);
  pending = null;
  void syncProgress().catch(() => {});
}

/** Mails the code again. */
export async function resendCode(): Promise<void> {
  if (!pending) throw new AccountError('unknown');
  const { error } = await supabase.auth.resend({ type: 'email_change', email: pending.email });
  if (error) fail(error);
}

export function cancelRegistration(): void {
  pending = null;
}

/** Logs in to an account; the guest's progress on this device is added to the account's. */
export async function logIn(email: string, password: string): Promise<void> {
  checkEmail(email);
  if (!password) throw new AccountError('short-password');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) fail(error);
  await afterLogIn();
}

/** Mails a code for a new password (nothing is mailed, and nothing said, if there is no such account). */
export async function sendResetCode(email: string): Promise<void> {
  checkEmail(email);
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) fail(error);
}

/** Sets a new password with the code from the mail, and logs in. */
export async function resetPassword(email: string, code: string, password: string): Promise<void> {
  checkCode(code);
  checkPassword(password);
  const verify = await supabase.auth.verifyOtp({ email, token: code, type: 'recovery' });
  if (verify.error) fail(verify.error);
  const { error } = await supabase.auth.updateUser({ password });
  if (error) fail(error);
  await afterLogIn();
}

async function afterLogIn(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id ?? '';
  const profile = await supabase.from('profiles').select('nickname').eq('id', id).maybeSingle<{ nickname: string }>();
  // An account that never played online has no profile yet: it keeps this device's nickname.
  switchedAccount(profile.data?.nickname ?? localNickname());
  await syncProgress().catch(() => {});
  void connect().catch(() => {});
}

/**
 * Logs out: saves the progress in the cloud first (refuses when that fails, so nothing is lost),
 * then starts a fresh guest with no progress.
 */
export async function logOut(): Promise<void> {
  try {
    await syncProgress();
  } catch {
    throw new AccountError('network');
  }
  await supabase.auth.signOut({ scope: 'local' });
  forgetCloudBase();
  switchedAccount(randomNickname());
  replaceProgress(emptyProgress());
}

/** Polish message for an account error. */
export function accountErrorMessage(error: unknown): string {
  const code = error instanceof AccountError ? error.code : 'unknown';
  const messages: Record<string, string> = {
    'bad-email': 'To nie wygląda na adres e-mail.',
    'short-password': `Hasło musi mieć co najmniej ${PASSWORD_MIN} znaków.`,
    'bad-code': 'Kod z maila to same cyfry.',
    'signed-in': 'Jesteś już zalogowany.',
    network: 'Brak połączenia z serwerem.',
    invalid_credentials: 'Zły e-mail albo hasło.',
    email_not_confirmed: 'Ten e-mail nie został jeszcze potwierdzony.',
    email_exists: 'Ten e-mail ma już konto. Zaloguj się.',
    user_already_exists: 'Ten e-mail ma już konto. Zaloguj się.',
    email_address_invalid: 'Na ten adres nie da się wysłać maila.',
    validation_failed: 'To nie wygląda na adres e-mail.',
    email_address_not_authorized: 'Serwer nie może jeszcze wysyłać maili na ten adres.',
    over_email_send_rate_limit: 'Wysłaliśmy już dużo maili. Spróbuj za jakiś czas.',
    over_request_rate_limit: 'Za dużo prób. Spróbuj za kilka minut.',
    otp_expired: 'Kod jest zły albo już wygasł.',
    weak_password: 'To hasło jest za słabe. Wymyśl dłuższe.',
    same_password: 'To jest Twoje obecne hasło.',
  };
  return messages[code] ?? 'Coś poszło nie tak. Spróbuj jeszcze raz.';
}
