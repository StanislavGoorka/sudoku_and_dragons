-- Rematch after a finished duel: the first player to ask is recorded in rematch_by; when the other
-- asks too, the `duel` function creates the next duel and links it in next_duel. A player who leaves
-- the end screen (or forfeited) sets rematch_declined.
alter table public.duels
  add column rematch_by smallint check (rematch_by in (0, 1)),
  add column rematch_declined boolean not null default false,
  add column next_duel uuid references public.duels (id) on delete set null;
