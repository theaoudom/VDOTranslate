-- Samesay: user profiles, credit balance and credit history.
-- Run once in the Supabase dashboard → SQL Editor (or with `supabase db push`).

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  plan        text not null default 'free' check (plan in ('free', 'creator', 'studio')),
  credits     integer not null default 0 check (credits >= 0),  -- available
  held        integer not null default 0 check (held >= 0),     -- reserved by running jobs
  renews_at   timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists public.credit_ledger (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  delta       integer not null,          -- + added, − spent or held
  reason      text not null,             -- e.g. 'Welcome credits · Free', 'Translation hold · EN → KM'
  job_name    text,
  created_at  timestamptz not null default now()
);
create index if not exists credit_ledger_user_created on public.credit_ledger (user_id, created_at desc);

-- Users can read their own rows. Balances only change on the server (service role),
-- so there are deliberately no insert/update/delete policies for signed-in users.
alter table public.profiles enable row level security;
alter table public.credit_ledger enable row level security;

drop policy if exists "Read own profile" on public.profiles;
create policy "Read own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "Read own credit history" on public.credit_ledger;
create policy "Read own credit history" on public.credit_ledger
  for select to authenticated using ((select auth.uid()) = user_id);

-- New account → profile on the Free plan with 60 welcome credits.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, plan, credits)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    'free',
    60
  );
  insert into public.credit_ledger (user_id, delta, reason)
  values (new.id, 60, 'Welcome credits · Free');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
