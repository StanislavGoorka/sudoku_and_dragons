-- Online duels. Clients only read; every write goes through the `duel` Edge Function
-- (service role), which checks each move against the secret solution with src/core.

-- Players' public names.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 24),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "Signed-in players can read profiles" on public.profiles
  for select to authenticated using (true);

create table public.duels (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('room', 'random')),
  -- Four digits 1-9 for room duels; null for random matchmaking.
  code text check (code ~ '^[1-9]{4}$'),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'finished', 'cancelled')),
  player0 uuid not null references auth.users (id) on delete cascade,
  player1 uuid references auth.users (id) on delete cascade,
  -- DuelState from src/core/duel/duel.ts: board, hp, turn... never the solution.
  state jsonb not null,
  -- The DuelEvent that produced `state`, for clients to animate.
  last_event jsonb,
  -- Bumped on every change; the function updates only the version it read.
  version integer not null default 0,
  turn_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index duels_waiting_code on public.duels (code) where status = 'waiting';
create index duels_waiting_random on public.duels (difficulty, created_at) where status = 'waiting' and mode = 'random';
create index duels_player0 on public.duels (player0);
create index duels_player1 on public.duels (player1);
alter table public.duels enable row level security;
create policy "Players can read their own duels" on public.duels
  for select to authenticated using ((select auth.uid()) in (player0, player1));

-- The solution of each duel's board. No policies: only the service role can read it.
create table public.duel_secrets (
  duel_id uuid primary key references public.duels (id) on delete cascade,
  seed bigint not null,
  solution smallint[] not null
);
alter table public.duel_secrets enable row level security;

-- Both players follow their duel live.
alter publication supabase_realtime add table public.duels;

-- Matchmaking: atomically claims the oldest waiting random duel of another player.
create function public.claim_random_duel(p_player uuid, p_difficulty text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.duels
  where status = 'waiting'
    and mode = 'random'
    and difficulty = p_difficulty
    and player0 <> p_player
    and created_at > now() - interval '10 minutes'
  order by created_at
  for update skip locked
  limit 1;

  if v_id is null then
    return null;
  end if;

  update public.duels
  set player1 = p_player,
      status = 'playing',
      turn_started_at = now(),
      version = version + 1,
      updated_at = now()
  where id = v_id;
  return v_id;
end;
$$;
revoke execute on function public.claim_random_duel(uuid, text) from public, anon, authenticated;
