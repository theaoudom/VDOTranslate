import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import type { ApproveOptions, IPaymentRepository, Payment, PaymentStatus } from "@/domain/payments/Payment";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = () => adminClient() as any;

function fromRow(r: any): Payment {
  return {
    id: r.id, userId: r.user_id, ref: r.ref, kind: r.kind, plan: r.plan, credits: r.credits, usd: Number(r.usd), status: r.status,
    creditsAdded: r.credits_added ?? null, planStarted: r.plan_started ?? null,
    tgMessageId: r.tg_message_id == null ? null : Number(r.tg_message_id),
    createdAt: new Date(r.created_at), paidAt: r.paid_at ? new Date(r.paid_at) : null, decidedAt: r.decided_at ? new Date(r.decided_at) : null,
  };
}

export class SupabasePaymentRepository implements IPaymentRepository {
  async create(p: Pick<Payment, "userId" | "ref" | "kind" | "plan" | "credits" | "usd">) {
    const { data, error } = await db().from("payments")
      .insert({ user_id: p.userId, ref: p.ref, kind: p.kind, plan: p.plan, credits: p.credits, usd: p.usd })
      .select().single();
    if (error) throw new Error(error.message);
    return fromRow(data);
  }

  async findById(id: string): Promise<Payment | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const { data, error } = await db().from("payments").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? fromRow(data) : null;
  }

  async listForUser(userId: string, statuses: PaymentStatus[]): Promise<Payment[]> {
    const { data, error } = await db().from("payments").select("*").eq("user_id", userId).in("status", statuses).order("created_at", { ascending: false }).limit(20);
    if (error) throw new Error(error.message);
    return (data ?? []).map(fromRow);
  }

  async transition(id: string, from: PaymentStatus[], to: PaymentStatus, extra: Partial<Pick<Payment, "paidAt" | "decidedAt">> = {}) {
    const row: Record<string, unknown> = { status: to };
    if (extra.paidAt) row.paid_at = extra.paidAt.toISOString();
    if (extra.decidedAt) row.decided_at = extra.decidedAt.toISOString();
    const { data, error } = await db().from("payments").update(row).eq("id", id).in("status", from).select().maybeSingle();
    if (error) throw new Error(error.message);
    return data ? fromRow(data) : null;
  }

  async setMessageId(id: string, messageId: number) {
    const { error } = await db().from("payments").update({ tg_message_id: messageId }).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async approve(id: string, opts: ApproveOptions = {}) {
    const { data, error } = await db().rpc("approve_payment", { p_id: id, p_credits: opts.credits ?? null, p_start_plan: opts.startPlan ?? true });
    if (error) throw new Error(`Couldn't approve the payment: ${error.message}`);
    return Boolean(data);
  }

  async deleteOpenBefore(date: Date) {
    const { error } = await db().from("payments").delete().eq("status", "open").lt("created_at", date.toISOString());
    if (error) throw new Error(error.message);
  }
}
