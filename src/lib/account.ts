import "server-only";
import type { User } from "@supabase/supabase-js";
import type { PlanId } from "@/domain/billing/pricing";
import { SupabaseCreditRepository } from "@/data/repositories/SupabaseRepositories";
import { isAdminConfigured } from "./supabase/admin";

export interface AccountSummary {
  name: string;
  firstName: string;
  email: string;
  plan: PlanId;
  credits: number;
  held: number;
  /** false when credits can't be read (secret key missing or profile not created) */
  ready: boolean;
}

export async function loadAccount(user: User): Promise<AccountSummary> {
  const meta = (user.user_metadata ?? {}) as { full_name?: string; name?: string };
  const fallbackName = meta.full_name || meta.name || user.email?.split("@")[0] || "there";
  const base = { email: user.email ?? "", plan: "free" as PlanId, credits: 0, held: 0, ready: false, name: fallbackName };
  if (isAdminConfigured) {
    try {
      const acc = await new SupabaseCreditRepository().getAccount(user.id);
      if (acc) Object.assign(base, { plan: acc.plan, credits: acc.credits, held: acc.held, ready: true, name: acc.fullName || fallbackName });
    } catch (e) {
      console.error("[account]", e);
    }
  }
  return { ...base, firstName: base.name.split(" ")[0] };
}
