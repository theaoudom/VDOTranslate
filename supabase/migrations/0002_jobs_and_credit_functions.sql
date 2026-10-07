-- Samesay Phase 2: translation jobs + safe credit operations.
-- Run once in the Supabase dashboard → SQL Editor, after 0001_profiles_and_credits.sql.

create table if not exists public.jobs (
  id              uuid primary key,
  user_id         uuid not null references auth.users (id) on delete cascade,
  kind            text not null default 'dub' check (kind in ('dub', 'split', 'edit')),
  name            text not null,                      -- original file name
  duration_sec    numeric not null default 0,         -- seconds actually processed
  status          text not null default 'pending',    -- pending, extracting, separating, transcribing, translating, synthesizing, merging, completed, failed
  progress        integer not null default 0,
  source_language text,
  target_language text not null,
  voice           text not null default 'standard' check (voice in ('cloned', 'natural', 'standard')),
  keep_background boolean not null default true,
  burn_subtitles  boolean not null default true,
  blur_subtitles  boolean not null default false,
  trim_sec        numeric,                            -- only translate the first N seconds
  held            integer not null default 0,         -- credits held at start
  used            integer not null default 0,         -- credits finally charged
  segments        jsonb,                              -- [{start,end,speaker,gender,text,original}]
  speakers        jsonb,                              -- [{id,gender,share}]
  error           text,
  files           jsonb not null default '{}'::jsonb, -- local file paths (server only)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists jobs_user_created on public.jobs (user_id, created_at desc);

alter table public.jobs enable row level security;
drop policy if exists "Read own jobs" on public.jobs;
create policy "Read own jobs" on public.jobs
  for select to authenticated using ((select auth.uid()) = user_id);

-- ── Credit operations ─────────────────────────────────────────────────────────
-- All run as one transaction with a row lock, so balances can never go negative
-- or be double-spent. Only the server (service role) may call them.

-- Move `amount` from available to held. Returns false when the balance is too low.
create or replace function public.hold_credits(p_user uuid, p_amount integer, p_reason text, p_job_name text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_credits integer;
begin
  if p_amount <= 0 then return true; end if;
  select credits into v_credits from public.profiles where id = p_user for update;
  if v_credits is null or v_credits < p_amount then return false; end if;
  update public.profiles set credits = credits - p_amount, held = held + p_amount where id = p_user;
  insert into public.credit_ledger (user_id, delta, reason, job_name) values (p_user, -p_amount, p_reason, p_job_name);
  return true;
end; $$;

-- Release a hold: charge `p_used` of it and give the rest back.
create or replace function public.settle_credits(p_user uuid, p_held integer, p_used integer, p_job_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_refund integer := greatest(p_held - greatest(p_used, 0), 0);
begin
  update public.profiles
     set held = greatest(held - p_held, 0), credits = credits + v_refund
   where id = p_user;
  if v_refund > 0 then
    insert into public.credit_ledger (user_id, delta, reason, job_name)
    values (p_user, v_refund, case when p_used <= 0 then 'Refund · job failed' else 'Refund · unused hold' end, p_job_name);
  end if;
end; $$;

-- Charge a fixed amount straight away (e.g. re-voicing one line). Returns false when too low.
create or replace function public.spend_credits(p_user uuid, p_amount integer, p_reason text, p_job_name text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_credits integer;
begin
  select credits into v_credits from public.profiles where id = p_user for update;
  if v_credits is null or v_credits < p_amount then return false; end if;
  update public.profiles set credits = credits - p_amount where id = p_user;
  insert into public.credit_ledger (user_id, delta, reason, job_name) values (p_user, -p_amount, p_reason, p_job_name);
  return true;
end; $$;

revoke all on function public.hold_credits(uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.settle_credits(uuid, integer, integer, text) from public, anon, authenticated;
revoke all on function public.spend_credits(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.hold_credits(uuid, integer, text, text) to service_role;
grant execute on function public.settle_credits(uuid, integer, integer, text) to service_role;
grant execute on function public.spend_credits(uuid, integer, text, text) to service_role;
