import type { SupabaseClient } from '@supabase/supabase-js';

/** Shared by the game and the small web deletion page. No owner ID or admin key reaches this API. */
export async function requestAccountDeletion(client: Pick<SupabaseClient, 'functions'>): Promise<void> {
  const { data, error } = await client.functions.invoke('delete-account', { body: { confirm: 'DELETE' }, timeout: 15_000 });
  if (error || data?.deleted !== true) throw new Error('delete-unconfirmed');
}
