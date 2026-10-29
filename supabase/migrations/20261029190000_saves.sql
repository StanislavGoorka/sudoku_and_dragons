-- Each player's progress (stars, records, bought cosmetics) in the cloud, so an account keeps it on
-- a new phone. Written by the game itself: progress is the player's own business, nothing on the
-- server depends on it. `version` goes up with every write; the game writes only over the version it
-- read, and merges when another device got there first (mergeProgress in src/game/progress).
create table public.saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null check (octet_length(data::text) <= 65536),
  version integer not null check (version > 0),
  updated_at timestamptz not null default now()
);
alter table public.saves enable row level security;
create policy "Players read their own save" on public.saves
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Players create their own save" on public.saves
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Players update their own save" on public.saves
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
