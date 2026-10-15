-- Samesay: AI movies. One row per movie: the idea, script, characters, shots and credits.
-- Characters made from a real person's photo keep the consent the user gave (cast[].consent).
-- Run once in the Supabase dashboard → SQL Editor.

create table if not exists public.movies (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null default 'Untitled movie',
  --  draft  → being written / planned (script, characters, shots)
  --  making → shots are being generated (credits held)
  --  done / failed
  status      text not null default 'draft' check (status in ('draft', 'making', 'done', 'failed')),
  settings    jsonb not null default '{}'::jsonb,   -- genre, length, ratio, style, source
  script      jsonb not null default '[]'::jsonb,   -- scenes: place, time, text, lines
  "cast"      jsonb not null default '[]'::jsonb,   -- characters: name, role, look, portrait / photo + consent
  shots       jsonb not null default '[]'::jsonb,   -- shots: scene, title, prompt, seconds, model, state, file
  quality     text not null default 'balanced',
  held        integer not null default 0,
  used        integer not null default 0,
  files       jsonb not null default '{}'::jsonb,   -- storage keys (final video, frames)
  error       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists movies_user_updated on public.movies (user_id, updated_at desc);
create index if not exists movies_status on public.movies (status);

alter table public.movies enable row level security;
drop policy if exists "Read own movies" on public.movies;
create policy "Read own movies" on public.movies
  for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.touch_movies() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;
drop trigger if exists movies_touch on public.movies;
create trigger movies_touch before update on public.movies for each row execute function public.touch_movies();
