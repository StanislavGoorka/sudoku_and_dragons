import { beforeEach, expect, it, vi } from 'vitest';

const t = vi.hoisted(() => ({ updateUser: vi.fn(), verifyOtp: vi.fn(), getSession: vi.fn(), signOut: vi.fn(),
  request: vi.fn(), replace: vi.fn(), clear: vi.fn(), connect: vi.fn(), switched: vi.fn(), clearDaily: vi.fn(), clearDiagnostics: vi.fn(), sync: vi.fn() }));
vi.mock('./online.ts', () => ({ supabase: { auth: { onAuthStateChange: vi.fn(), updateUser: t.updateUser, verifyOtp: t.verifyOtp,
  getSession: t.getSession, signOut: t.signOut }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) },
  connect: t.connect, localNickname: () => 'Test', switchedAccount: t.switched, OnlineError: class extends Error {} }));
vi.mock('./accountDeletion.ts', () => ({ requestAccountDeletion: t.request }));
vi.mock('../progress/store.ts', () => ({ replaceProgress: t.replace, clearLocalProgress: t.clear, saveActiveBattle: vi.fn() }));
vi.mock('./cloudSave.ts', () => ({ forgetCloudBase: vi.fn(), syncProgress: t.sync }));
vi.mock('./duelRecovery.ts', () => ({ forgetDuel: vi.fn() }));
vi.mock('./daily.ts', () => ({ clearDailyResults: t.clearDaily }));
vi.mock('../diagnostics/index.ts', () => ({ clearDiagnosticQueue: t.clearDiagnostics }));

beforeEach(() => {
  vi.resetModules(); vi.resetAllMocks();
  t.updateUser.mockResolvedValue({ error: null }); t.verifyOtp.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null });
  t.getSession.mockResolvedValue({ data: { session: { user: { id: 'owner' } } } });
  t.signOut.mockResolvedValue({ error: null }); t.sync.mockResolvedValue(undefined); t.connect.mockResolvedValue({ id: 'owner' });
});
it('registration can retry setting the password after the OTP was already consumed', async () => {
  const a = await import('./account.ts');
  await a.register('test@example.test', 'password1');
  t.updateUser.mockResolvedValueOnce({ error: { code: 'network' } });
  await expect(a.confirmRegistration('123456')).rejects.toThrow();
  await a.confirmRegistration('123456');
  expect(t.verifyOtp).toHaveBeenCalledTimes(1); expect(a.pendingEmail()).toBeNull();
  expect(t.updateUser).toHaveBeenLastCalledWith({ password: 'password1' });
});
it('recovery can retry a failed password update without consuming the OTP twice', async () => {
  const a = await import('./account.ts'); t.updateUser.mockResolvedValueOnce({ error: { code: 'network' } });
  await expect(a.resetPassword('test@example.test', '123456', 'newpassword')).rejects.toThrow();
  await a.resetPassword('test@example.test', '123456', 'newpassword');
  expect(t.verifyOtp).toHaveBeenCalledTimes(1);
});
it('a registration retry cannot set another signed-in account\'s password', async () => {
  const a = await import('./account.ts'); await a.register('test@example.test', 'password1');
  t.updateUser.mockResolvedValueOnce({ error: { code: 'network' } });
  await expect(a.confirmRegistration('123456')).rejects.toThrow();
  t.getSession.mockResolvedValue({ data: { session: { user: { id: 'other' } } } });
  t.updateUser.mockClear();
  await expect(a.confirmRegistration('123456')).rejects.toThrow('account-changed');
  expect(t.updateUser).not.toHaveBeenCalled();
});
it('invalid or expired codes never update the password', async () => {
  const a = await import('./account.ts'); t.verifyOtp.mockResolvedValue({ error: { code: 'otp_expired' } });
  await expect(a.resetPassword('test@example.test', '123456', 'newpassword')).rejects.toThrow('otp_expired');
  expect(t.updateUser).not.toHaveBeenCalled();
});
it('a failed deletion preserves local progress and session', async () => {
  const a = await import('./account.ts'); t.request.mockRejectedValue(new Error('offline'));
  await expect(a.deleteAccount()).rejects.toThrow('delete-unconfirmed');
  expect(t.clear).not.toHaveBeenCalled(); expect(t.signOut).not.toHaveBeenCalled();
});
it('a successful deletion clears progress, pending results, diagnostics and the session', async () => {
  const a = await import('./account.ts'); await a.deleteAccount();
  expect(t.request).toHaveBeenCalledTimes(1); expect(t.clear).toHaveBeenCalledTimes(1);
  expect(t.clearDaily).toHaveBeenCalledTimes(1); expect(t.clearDiagnostics).toHaveBeenCalledTimes(1);
  expect(t.signOut).toHaveBeenCalledWith({ scope: 'local' });
});
it('a late deletion response cannot erase the next account', async () => {
  const a = await import('./account.ts'); t.request.mockImplementation(async () => {
    t.getSession.mockResolvedValue({ data: { session: { user: { id: 'other' } } } });
  });
  await expect(a.deleteAccount()).rejects.toThrow('account-changed'); expect(t.clear).not.toHaveBeenCalled();
});
