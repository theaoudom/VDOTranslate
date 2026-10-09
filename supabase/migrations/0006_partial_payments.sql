-- Samesay: approve a payment with a different number of credits (when someone paid less
-- than the price), and choose whether a plan payment starts the plan month.
-- Run once in the Supabase dashboard → SQL Editor.

alter table public.payments add column if not exists credits_added integer;
alter table public.payments add column if not exists plan_started boolean;

drop function if exists public.approve_payment(uuid);

-- Approve a pending payment exactly once. p_credits null = the full amount;
-- p_start_plan false = only add credits, keep the current plan.
-- Returns the user id, or null when it wasn't pending.
create or replace function public.approve_payment(p_id uuid, p_credits integer default null, p_start_plan boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v public.payments; v_credits integer; v_plan text;
begin
  select * into v from public.payments where id = p_id and status = 'pending' for update;
  if v.id is null then return null; end if;
  v_credits := coalesce(p_credits, v.credits);
  if v_credits < 0 then raise exception 'credits must not be negative'; end if;
  v_plan := case when p_start_plan then v.plan else null end;

  update public.payments
    set status = 'approved', decided_at = now(), credits_added = v_credits, plan_started = (v_plan is not null)
    where id = p_id;
  update public.profiles
    set credits = credits + v_credits,
        plan = coalesce(v_plan, plan),
        renews_at = case when v_plan is not null then now() + interval '30 days' else renews_at end
    where id = v.user_id;
  if v_credits > 0 then
    insert into public.credit_ledger (user_id, delta, reason, job_name)
      values (v.user_id, v_credits,
              case when v_plan is not null then 'Plan · ' || initcap(v_plan) || ' · 1 month' else 'Top-up · ' || v_credits || ' cr' end
                || case when v_credits <> v.credits then ' (part payment)' else ' · paid $' || trim(to_char(v.usd, 'FM999990.00')) end,
              v.ref);
  end if;
  return v.user_id;
end; $$;

revoke all on function public.approve_payment(uuid, integer, boolean) from public, anon, authenticated;
grant execute on function public.approve_payment(uuid, integer, boolean) to service_role;
