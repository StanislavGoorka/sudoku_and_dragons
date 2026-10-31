-- The whole random queue operation is atomic, including the empty-queue case. Locking only an
-- existing row cannot help when two players both arrive before a waiting duel has been created.
-- Only the Edge Function may call this: the state and solution come from the trusted game core.
create function public.queue_random_duel(
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
begin
  if p_difficulty is null or p_difficulty not in ('easy', 'medium', 'hard') then
    raise exception 'bad-difficulty' using errcode = '22023';
  end if;

  -- One transaction-scoped lock for random matchmaking, even when the queue is empty. Puzzle
  -- generation happens before this call, so the lock covers only these short database operations.
  perform pg_catalog.pg_advisory_xact_lock(736843, 1);
  v_now := pg_catalog.clock_timestamp();

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
    and d.player0 <> p_player
    and d.created_at > v_now - interval '10 minutes'
    and exists (select 1 from public.duel_secrets s where s.duel_id = d.id)
  order by d.created_at, d.id
  limit 1
  for update of d skip locked;

  if found then
    update public.duels
    set player1 = p_player,
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
