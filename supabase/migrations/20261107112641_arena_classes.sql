-- Arena stats are written only by the duel referee, not by clients or cloud saves.
create table public.arena_profiles (
  player uuid primary key references auth.users(id) on delete cascade,
  xp integer not null default 0 check (xp >= 0),
  rating integer not null default 1000 check (rating >= 100)
);

alter table public.arena_profiles enable row level security;
revoke all on table public.arena_profiles from public, anon, authenticated;
grant select on table public.arena_profiles to authenticated;
grant select, insert, update, delete on table public.arena_profiles to service_role;
create policy arena_profile_own on public.arena_profiles for select to authenticated
  using (player = (select auth.uid()));
alter table public.duels add column arena_result jsonb;

-- A terminal confirmed random Arena match is settled in the same transaction as its result.
create function public.settle_arena_result()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r0 integer;
  r1 integer;
  actual numeric;
  swing integer;
  award0 integer;
  award1 integer;
begin
  if old.status = 'finished' or new.status <> 'finished' or new.mode <> 'random'
     or new.player1 is null or not (new.state ? 'heroes')
     or coalesce((new.state #>> '{heroes,0,correct}')::integer, 0) < 1
     or coalesce((new.state #>> '{heroes,1,correct}')::integer, 0) < 1 then
    return new;
  end if;

  insert into public.arena_profiles(player)
  select id from (values (new.player0), (new.player1)) as players(id) order by id
  on conflict (player) do nothing;
  perform 1 from public.arena_profiles where player in (new.player0, new.player1) order by player for update;
  select rating into r0 from public.arena_profiles where player = new.player0;
  select rating into r1 from public.arena_profiles where player = new.player1;
  actual := case new.state ->> 'winner' when '0' then 1 when '1' then 0 else 0.5 end;
  swing := round(24 * (actual - 1 / (1 + power(10::numeric, (r1 - r0)::numeric / 400))));
  award0 := case actual when 1 then 25 when 0 then 10 else 15 end;
  award1 := case actual when 0 then 25 when 1 then 10 else 15 end;
  update public.arena_profiles
  set rating = greatest(100, rating + case when player = new.player0 then swing else -swing end),
      xp = xp + case when player = new.player0 then award0 else award1 end
  where player in (new.player0, new.player1);
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('rating', rating, 'xp', xp,
    'delta', rating - case when player = new.player0 then r0 else r1 end,
    'earned', case when player = new.player0 then award0 else award1 end)
    order by (player <> new.player0)) into new.arena_result
  from public.arena_profiles where player in (new.player0, new.player1);
  return new;
end;
$$;
revoke execute on function public.settle_arena_result() from public, anon, authenticated;
create trigger settle_arena_result before update of status on public.duels
  for each row when (old.status is distinct from new.status)
  execute function public.settle_arena_result();

-- The whole random queue operation is atomic, including the empty-queue case. Locking only an
-- existing row cannot help when two players both arrive before a waiting duel has been created.
-- Only the Edge Function may call this: the state and solution come from the trusted game core.
create or replace function public.queue_random_duel(
  p_player uuid,
  p_difficulty text,
  p_state jsonb,
  p_seed bigint,
  p_solution smallint[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_duel public.duels%rowtype;
  v_now timestamptz;
  v_rating integer;
begin
  if p_difficulty is null or p_difficulty not in ('easy', 'medium', 'hard') then
    raise exception 'bad-difficulty' using errcode = '22023';
  end if;

  -- One transaction-scoped lock for random matchmaking, even when the queue is empty. Puzzle
  -- generation happens before this call, so the lock covers only these short database operations.
  perform pg_catalog.pg_advisory_xact_lock(736843, 1);
  v_now := pg_catalog.clock_timestamp();
  select rating into v_rating from public.arena_profiles where player = p_player;

  -- Starting a new search replaces this player's old waiting duel, as before. Clear stale rooms too.
  update public.duels
  set status = 'cancelled'
  where status = 'waiting'
    and (player0 = p_player or created_at < v_now - interval '30 minutes');

  select d.* into v_duel
  from public.duels d
  where d.status = 'waiting'
    and d.mode = 'random'
    and d.difficulty = p_difficulty
    and (d.state ? 'heroes') = (p_state ? 'heroes')
    and (not (p_state ? 'heroes') or
      abs(coalesce(v_rating, 1000) - coalesce((select rating from public.arena_profiles where player = d.player0), 1000))
      <= least(500, 100 + 50 * floor(extract(epoch from (v_now - d.created_at)) / 10)))
    and d.player0 <> p_player
    and d.created_at > v_now - interval '10 minutes'
    and exists (select 1 from public.duel_secrets s where s.duel_id = d.id)
  order by d.created_at, d.id
  limit 1
  for update of d skip locked;

  if found then
    update public.duels
    set player1 = p_player,
        state = case when p_state ? 'heroes' then
          pg_catalog.jsonb_set(pg_catalog.jsonb_set(v_duel.state, '{heroes,1}', p_state #> '{heroes,0}'),
            '{hp,1}', p_state #> '{hp,0}')
          else v_duel.state end,
        status = 'playing',
        turn_started_at = v_now,
        version = version + 1,
        updated_at = v_now
    where id = v_duel.id
    returning * into v_duel;
    return pg_catalog.jsonb_build_object('duel', pg_catalog.to_jsonb(v_duel), 'seat', 1);
  end if;

  insert into public.duels (mode, difficulty, player0, state, created_at, updated_at)
  values ('random', p_difficulty, p_player, p_state, v_now, v_now)
  returning * into v_duel;

  -- A duel and its solution become visible together; an insert failure rolls back both.
  insert into public.duel_secrets (duel_id, seed, solution)
  values (v_duel.id, p_seed, p_solution);

  return pg_catalog.jsonb_build_object('duel', pg_catalog.to_jsonb(v_duel), 'seat', 0);
end;
$$;

revoke execute on function public.queue_random_duel(uuid, text, jsonb, bigint, smallint[])
  from public, anon, authenticated;
grant execute on function public.queue_random_duel(uuid, text, jsonb, bigint, smallint[])
  to service_role;

-- The window also expands for two players already in the queue. Keep one board and give the
-- replaced waiting row a pointer so its watcher can follow the match after reconnecting.
create function public.try_pair_arena(p_duel uuid, p_player uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  mine public.duels%rowtype;
  rival public.duels%rowtype;
  t timestamptz;
  my_rating integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(736843, 1);
  t := pg_catalog.clock_timestamp();
  select * into mine from public.duels where id = p_duel and player0 = p_player
    and status = 'waiting' and mode = 'random' and state ? 'heroes'
    and created_at > t - interval '10 minutes'
    and exists (select 1 from public.duel_secrets s where s.duel_id = p_duel)
    for update;
  if not found then return null; end if;
  select rating into my_rating from public.arena_profiles where player = p_player;
  select d.* into rival from public.duels d
  where d.status = 'waiting' and d.mode = 'random' and d.difficulty = mine.difficulty
    and d.player0 <> p_player and d.state ? 'heroes' and d.created_at > t - interval '10 minutes'
    and exists (select 1 from public.duel_secrets s where s.duel_id = d.id)
    and abs(coalesce(my_rating, 1000) - coalesce((select rating from public.arena_profiles where player = d.player0), 1000))
      <= least(500, 100 + 50 * floor(extract(epoch from (t - least(d.created_at, mine.created_at))) / 10))
  order by d.created_at, d.id limit 1 for update of d skip locked;
  if not found then return null; end if;
  update public.duels set status = 'playing', player1 = rival.player0,
    state = pg_catalog.jsonb_set(pg_catalog.jsonb_set(mine.state, '{heroes,1}', rival.state #> '{heroes,0}'), '{hp,1}', rival.state #> '{hp,0}'),
    turn_started_at = t, updated_at = t, version = version + 1 where id = mine.id returning * into mine;
  update public.duels set status = 'cancelled', next_duel = mine.id, updated_at = t, version = version + 1 where id = rival.id;
  return pg_catalog.to_jsonb(mine);
end;
$$;
revoke execute on function public.try_pair_arena(uuid, uuid) from public, anon, authenticated;
grant execute on function public.try_pair_arena(uuid, uuid) to service_role;
