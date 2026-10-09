import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import type { PlanId } from "@/domain/billing/pricing";
import type { TranslationJob, TranslationJobStatus } from "@/domain/entities/TranslationJob";
import type { CreditAccount, ICreditRepository, LedgerEntry } from "@/domain/repositories/ICreditRepository";
import type { ITranslationJobRepository } from "@/domain/repositories/ITranslationJobRepository";
import type { Template } from "@/domain/entities/Template";
import type { ITemplateRepository } from "@/domain/repositories/ITemplateRepository";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = () => adminClient() as any;

function toRow(j: Partial<TranslationJob>): Record<string, unknown> {
  const map: Record<string, string> = {
    id: "id", userId: "user_id", kind: "kind", template: "template", split: "split", name: "name", durationSec: "duration_sec", status: "status", progress: "progress",
    sourceLanguage: "source_language", targetLanguage: "target_language", voice: "voice", keepBackground: "keep_background",
    burnSubtitles: "burn_subtitles", blurSubtitles: "blur_subtitles", trimSec: "trim_sec", held: "held", used: "used",
    lines: "segments", speakers: "speakers", error: "error", files: "files", createdAt: "created_at", updatedAt: "updated_at",
  };
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(j)) if (map[k] && v !== undefined) row[map[k]] = v instanceof Date ? v.toISOString() : v;
  return row;
}

function fromRow(r: any): TranslationJob {
  return {
    id: r.id, userId: r.user_id, kind: r.kind ?? "dub", template: r.template ?? null, split: r.split ?? null, name: r.name, durationSec: Number(r.duration_sec), status: r.status, progress: r.progress,
    sourceLanguage: r.source_language, targetLanguage: r.target_language, voice: r.voice, keepBackground: r.keep_background,
    burnSubtitles: r.burn_subtitles, blurSubtitles: r.blur_subtitles, trimSec: r.trim_sec == null ? null : Number(r.trim_sec),
    held: r.held, used: r.used, lines: r.segments, speakers: r.speakers, error: r.error, files: r.files ?? {},
    createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at),
  };
}

export class SupabaseJobRepository implements ITranslationJobRepository {
  async create(job: TranslationJob) {
    const { data, error } = await db().from("jobs").insert(toRow(job)).select().single();
    if (error) throw new Error(`Couldn't save the job: ${error.message}`);
    return fromRow(data);
  }

  async findById(id: string) {
    const { data, error } = await db().from("jobs").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? fromRow(data) : null;
  }

  async listForUser(userId: string, limit = 50) {
    const { data, error } = await db().from("jobs").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map(fromRow);
  }

  async listUnfinished() {
    const { data, error } = await db().from("jobs").select("*").not("status", "in", "(completed,failed)").limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []).map(fromRow);
  }

  async listWithFilesBefore(date: Date) {
    const { data, error } = await db().from("jobs").select("*").lt("created_at", date.toISOString()).neq("files", "{}").limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []).map(fromRow);
  }

  async update(id: string, updates: Partial<TranslationJob>) {
    const { data, error } = await db().from("jobs").update({ ...toRow(updates), updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw new Error(`Couldn't update the job: ${error.message}`);
    return fromRow(data);
  }

  async updateStatus(id: string, status: TranslationJobStatus, progress: number) {
    await this.update(id, { status, progress });
  }
}

export class SupabaseCreditRepository implements ICreditRepository {
  async getAccount(userId: string): Promise<CreditAccount | null> {
    const { data, error } = await db().from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const renewsAt = data.renews_at ? new Date(data.renews_at) : null;
    // A paid month that ended counts as Free right away (the daily cron also updates the row).
    const plan = data.plan !== "free" && renewsAt && renewsAt.getTime() < Date.now() ? "free" : (data.plan as PlanId);
    return { userId, fullName: data.full_name, plan, credits: data.credits, held: data.held, renewsAt };
  }

  async hold(userId: string, amount: number, reason: string, jobName: string) {
    const { data, error } = await db().rpc("hold_credits", { p_user: userId, p_amount: amount, p_reason: reason, p_job_name: jobName });
    if (error) throw new Error(`Couldn't hold credits: ${error.message}`);
    return data === true;
  }

  async settle(userId: string, held: number, used: number, jobName: string) {
    const { error } = await db().rpc("settle_credits", { p_user: userId, p_held: held, p_used: used, p_job_name: jobName });
    if (error) throw new Error(`Couldn't settle credits: ${error.message}`);
  }

  async spend(userId: string, amount: number, reason: string, jobName: string) {
    const { data, error } = await db().rpc("spend_credits", { p_user: userId, p_amount: amount, p_reason: reason, p_job_name: jobName });
    if (error) throw new Error(`Couldn't charge credits: ${error.message}`);
    return data === true;
  }

  async history(userId: string, limit = 20): Promise<LedgerEntry[]> {
    const { data, error } = await db().from("credit_ledger").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({ id: r.id, delta: r.delta, reason: r.reason, jobName: r.job_name, createdAt: new Date(r.created_at) }));
  }
}

function templateFromRow(r: any): Template {
  return { id: r.id, userId: r.user_id, name: r.name, ratio: r.ratio, pan: Number(r.pan), layers: r.layers ?? [], createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at) };
}

export class SupabaseTemplateRepository implements ITemplateRepository {
  async listForUser(userId: string) {
    const { data, error } = await db().from("templates").select("*").eq("user_id", userId).order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map(templateFromRow);
  }

  async findById(id: string) {
    const { data, error } = await db().from("templates").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? templateFromRow(data) : null;
  }

  async create(t: Omit<Template, "id" | "createdAt" | "updatedAt">) {
    const { data, error } = await db().from("templates").insert({ user_id: t.userId, name: t.name, ratio: t.ratio, pan: t.pan, layers: t.layers }).select().single();
    if (error) throw new Error(`Couldn't save the template: ${error.message}`);
    return templateFromRow(data);
  }

  async update(id: string, changes: Partial<Pick<Template, "name" | "ratio" | "pan" | "layers">>) {
    const { data, error } = await db().from("templates").update({ ...changes, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw new Error(`Couldn't save the template: ${error.message}`);
    return templateFromRow(data);
  }

  async delete(id: string) {
    const { error } = await db().from("templates").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }
}
