-- The player's hit effect (src/game/hitEffects.ts), shown to rivals in duels like the dragon skin.
alter table public.profiles
  add column effect text not null default 'sparks' check (effect ~ '^[a-z0-9-]{1,24}$');
