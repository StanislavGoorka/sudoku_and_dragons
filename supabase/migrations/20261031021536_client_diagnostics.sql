-- Technical reports stay outside exposed schemas; no account identifiers in events.
create schema if not exists private;
create table private.client_diagnostics (
  id uuid primary key,
  received_at timestamptz not null default now(),
  release text not null check (release ~ '^[a-zA-Z0-9_.+-]{1,64}$'),
  platform text not null check (platform in ('web', 'android', 'ios')),
  kind text not null check (kind in ('runtime', 'cloud_sync', 'duel_request', 'storage', 'performance')),
  code text not null check (code in ('unknown', 'TypeError', 'RangeError', 'ReferenceError', 'SyntaxError',
    'network', 'timeout', 'storage', 'conflict', 'server-error', 'sign-in', 'chunk-load', 'boot-ms', 'slow-frame')),
  screen text not null check (screen in ('boot', 'menu', 'battle', 'duel', 'lobby', 'map', 'shop', 'account', 'progress')),
  operation text not null check (operation in ('boot', 'render', 'unhandled', 'cloud_sync', 'storage_write',
    'duel_read', 'duel_recover', 'profile', 'create', 'join', 'queue', 'move', 'timeout', 'leave', 'rematch', 'decline-rematch')),
  location text not null check (length(location) <= 260 and location ~ '^([a-zA-Z0-9_-]{1,64}\.(js|ts):[0-9]{1,7}:[0-9]{1,9}(;|$)){0,3}$'),
  count integer not null check (count between 1 and 100),
  value integer check (value between 0 and 600000)
);
create index client_diagnostics_received on private.client_diagnostics (received_at);
alter table private.client_diagnostics enable row level security;

-- Rotating daily digest for rate limiting, separate from the reports.
create table private.diagnostic_quotas (
  bucket text primary key,
  day date not null,
  used integer not null check (used between 0 and 60)
);
create index diagnostic_quotas_day on private.diagnostic_quotas (day);
alter table private.diagnostic_quotas enable row level security;
revoke all on private.client_diagnostics, private.diagnostic_quotas from public, anon, authenticated;

-- Definer is private, authenticates the caller and locks search_path; clients get no table grants.
create function private.ingest_client_diagnostics(events jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  today date := (now() at time zone 'UTC')::date;
  quota text;
  used_count integer;
  new_count integer;
  item jsonb;
begin
  if caller is null then raise insufficient_privilege using message = 'Authentication required'; end if;
  if jsonb_typeof(events) is distinct from 'array' or octet_length(events::text) > 12000 then
    raise invalid_parameter_value using message = 'Invalid diagnostic batch';
  end if;
  if jsonb_array_length(events) not between 1 and 8 then
    raise invalid_parameter_value using message = 'Invalid diagnostic batch size';
  end if;
  for item in select * from jsonb_array_elements(events) loop
    if jsonb_typeof(item) is distinct from 'object' or
       item - array['id','release','platform','kind','code','screen','operation','location','count','value'] <> '{}'::jsonb or
       not (item ?& array['id','release','platform','kind','code','screen','operation','location','count','value']) then
      raise invalid_parameter_value using message = 'Unexpected diagnostic fields';
    end if;
  end loop;
  quota := md5(caller::text || ':' || today::text);
  insert into private.diagnostic_quotas (bucket, day, used) values (quota, today, 0) on conflict (bucket) do nothing;
  select used into used_count from private.diagnostic_quotas where bucket = quota for update;
  select count(distinct (e->>'id')::uuid) into new_count from jsonb_array_elements(events) e
    where not exists (select 1 from private.client_diagnostics d where d.id = (e->>'id')::uuid);
  if used_count + new_count > 60 then return false; end if;

  insert into private.client_diagnostics (id, release, platform, kind, code, screen, operation, location, count, value)
    select id, release, platform, kind, code, screen, operation, location, count, value
    from jsonb_to_recordset(events) as e(id uuid, release text, platform text, kind text, code text,
      screen text, operation text, location text, count integer, value integer)
    on conflict (id) do nothing;
  update private.diagnostic_quotas set used = used_count + new_count where bucket = quota;
  -- The first report after a quiet period also removes expired reports and quota digests.
  delete from private.client_diagnostics where received_at < now() - interval '14 days';
  delete from private.diagnostic_quotas where day < today;
  return true;
end;
$$;
revoke all on function private.ingest_client_diagnostics(jsonb) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.ingest_client_diagnostics(jsonb) to authenticated;

create function public.report_client_diagnostics(events jsonb)
returns boolean language sql security invoker set search_path = '' as $$
  select private.ingest_client_diagnostics(events);
$$;
revoke all on function public.report_client_diagnostics(jsonb) from public, anon;
grant execute on function public.report_client_diagnostics(jsonb) to authenticated;
