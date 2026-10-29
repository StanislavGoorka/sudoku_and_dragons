-- The skin of each player's dragon in duels (src/game/dragonSkins.ts), so their rivals see it.
-- Any well-formed id is kept: a client that does not know a skin shows the default look.
alter table public.profiles
  add column dragon text not null default 'azure' check (dragon ~ '^[a-z0-9-]{1,24}$');
