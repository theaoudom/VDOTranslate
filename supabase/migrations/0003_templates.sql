-- Samesay Phase 3: brand templates.
-- Run once in the Supabase dashboard → SQL Editor, after 0002.

create table if not exists public.templates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  ratio       text not null default '16:9' check (ratio in ('16:9', '9:16', '1:1')),
  pan         numeric not null default 50,     -- crop position 0–100
  layers      jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists templates_user on public.templates (user_id, created_at);

alter table public.templates enable row level security;
drop policy if exists "Read own templates" on public.templates;
create policy "Read own templates" on public.templates
  for select to authenticated using ((select auth.uid()) = user_id);

-- The template used for a job (a copy, so later edits don't change finished videos).
alter table public.jobs add column if not exists template jsonb;
