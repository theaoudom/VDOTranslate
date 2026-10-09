-- Samesay: manual payments (KHQR / bank transfer, approved by the team in Telegram),
-- plan months, and per-user translation defaults.
-- Run once in the Supabase dashboard → SQL Editor.

-- Translation defaults chosen in Settings (target language, voice, background, subtitles).
alter table public.profiles add column if not exists defaults jsonb not null default '{}'::jsonb;

-- One payment someone is making. `ref` is the note they write on the transfer.
--   open      → the pay window is showing (not sent to Telegram yet)
--   pending   → they pressed "I've paid"; waiting for the team in Telegram
--   approved / rejected / cancelled → final
create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  ref           text not null unique,
  kind          text not null check (kind in ('pack', 'plan')),
  plan          text check (plan in ('creator', 'studio')),
  credits       integer not null check (credits > 0),
  usd           numeric(10, 2) not null check (usd > 0),
  status        text not null default 'open' check (status in ('open', 'pending', 'approved', 'rejected', 'cancelled')),
  tg_message_id bigint,
  created_at    timestamptz not null default now(),
  paid_at       timestamptz,
  decided_at    timestamptz
);
create index if not exists payments_user_created on public.payments (user_id, created_at desc);
create index if not exists payments_status on public.payments (status);

alter table public.payments enable row level security;
drop policy if exists "Read own payments" on public.payments;
create policy "Read own payments" on public.payments
  for select to authenticated using ((select auth.uid()) = user_id);

-- Approve a pending payment exactly once: adds the credits, and for a plan starts a
-- 30-day month from now. Returns the user id, or null when it wasn't pending.
create or replace function public.approve_payment(p_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v public.payments;
begin
  update public.payments set status = 'approved', decided_at = now()
    where id = p_id and status = 'pending'
    returning * into v;
  if v.id is null then return null; end if;
  update public.profiles
    set credits = credits + v.credits,
        plan = coalesce(v.plan, plan),
        renews_at = case when v.plan is not null then now() + interval '30 days' else renews_at end
    where id = v.user_id;
  insert into public.credit_ledger (user_id, delta, reason, job_name)
    values (v.user_id, v.credits,
            case when v.plan is not null then 'Plan · ' || initcap(v.plan) || ' · 1 month' else 'Top-up · ' || v.credits || ' cr' end
              || ' · paid $' || trim(to_char(v.usd, 'FM999990.00')),
            v.ref);
  return v.user_id;
end; $$;

-- Paid plans end when their month is over (run daily by the maintenance cron).
create or replace function public.expire_plans()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.profiles set plan = 'free'
    where plan <> 'free' and renews_at is not null and renews_at < now();
  get diagnostics n = row_count;
  return n;
end; $$;

revoke all on function public.approve_payment(uuid) from public, anon, authenticated;
revoke all on function public.expire_plans() from public, anon, authenticated;
grant execute on function public.approve_payment(uuid) to service_role;
grant execute on function public.expire_plans() to service_role;
