import { createClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from '../game/net/config.ts';
import { requestAccountDeletion } from '../game/net/accountDeletion.ts';

// Isolated, memory-only session: visiting this page never uploads or merges the game's local progress.
const client = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const input = (id: string) => document.getElementById(id) as HTMLInputElement;
const result = document.getElementById('result')!;
const buttons = [...document.querySelectorAll<HTMLButtonElement>('button')];
let busy = false;
let recovery: { email: string; user: string } | null = null;
async function action(run: () => Promise<void>): Promise<void> {
  if (busy) return; busy = true; buttons.forEach((b) => b.disabled = true); result.textContent = 'Łączę z serwerem…';
  try { await run(); }
  catch { result.textContent = 'Nie udało się potwierdzić operacji. Sprawdź dane i połączenie. Przy usuwaniu z utraconą odpowiedzią spróbuj ponownie się zalogować.'; }
  finally { busy = false; buttons.forEach((b) => b.disabled = false); }
}
document.getElementById('delete-form')!.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!input('confirm').checked) return;
  void action(async () => {
    const signed = await client.auth.signInWithPassword({ email: input('email').value.trim(), password: input('password').value });
    if (signed.error) throw signed.error;
    try {
      await requestAccountDeletion(client);
      input('password').value = ''; input('confirm').checked = false; recovery = null;
      result.textContent = 'Konto i powiązane dane zostały usunięte.';
    } finally { await client.auth.signOut({ scope: 'local' }); }
  });
});
document.getElementById('send-code')!.addEventListener('click', () => void action(async () => {
  const email = input('email'); if (!email.reportValidity()) { result.textContent = 'Podaj poprawny e-mail.'; return; }
  recovery = null;
  const { error } = await client.auth.resetPasswordForEmail(email.value.trim()); if (error) throw error;
  result.textContent = 'Jeżeli konto istnieje, wysłaliśmy kod. Sprawdź także spam.';
}));
document.getElementById('recovery-form')!.addEventListener('submit', (event) => {
  event.preventDefault();
  void action(async () => {
    const email = input('email').value.trim(), code = input('code').value.trim(), password = input('new-password').value;
    if (!/^[0-9]{6,10}$/.test(code) || password.length < 6) { result.textContent = 'Podaj kod i hasło o długości co najmniej 6 znaków.'; return; }
    const session = (await client.auth.getSession()).data.session;
    if (!recovery || recovery.email !== email || recovery.user !== session?.user.id) {
      const verified = await client.auth.verifyOtp({ email, token: code, type: 'recovery' }); if (verified.error) throw verified.error;
      recovery = { email, user: verified.data.user!.id };
    }
    const { error } = await client.auth.updateUser({ password }); if (error) throw error;
    recovery = null; input('new-password').value = ''; input('code').value = '';
    await client.auth.signOut({ scope: 'local' }); result.textContent = 'Hasło zmienione. Możesz teraz zalogować się i usunąć konto.';
  });
});
