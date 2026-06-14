-- Atlas — schéma de synchronisation Supabase.
-- À coller dans Supabase → SQL Editor → New query → Run. (Idempotent : ré-exécutable.)

create extension if not exists pgcrypto;

create table if not exists atlas_people (
  id         uuid primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  data       jsonb not null,          -- la fiche complète (sans la photo)
  photo      text,                    -- photo en dataURL (ou null)
  updated_at timestamptz not null default now()
);

-- Chaque utilisateur ne voit/écrit que SES lignes.
alter table atlas_people enable row level security;

drop policy if exists "atlas own rows" on atlas_people;
create policy "atlas own rows" on atlas_people
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists atlas_people_user_idx on atlas_people (user_id);

-- ⚠️ Ensuite, dans Authentication → Providers → Email :
--    • activer « Email »
--    • DÉSACTIVER « Confirm email » (sinon il faut valider un e-mail avant de
--      pouvoir synchroniser la 1re fois). App perso = OK de le désactiver.
