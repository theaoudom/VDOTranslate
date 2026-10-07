import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import type { PlanId } from "@/domain/billing/pricing";
import type { TranslationJob, TranslationJobStatus } from "@/domain/entities/TranslationJob";
import type { CreditAccount, ICreditRepository, LedgerEntry } from "@/domain/repositories/ICreditRepository";
import type { ITranslationJobRepository } from "@/domain/repositories/ITranslationJobRepository";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = () => adminClient() as any;

function toRow(j: Partial<TranslationJob>): Record<string, unknown> {
  const map: Record<string, string> = {
    id: "id", userId: "user_id", name: "name", durationSec: "duration_sec", status: "status", progress: "progress",
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
    id: r.id, userId: r.user_id, name: r.name, durationSec: Number(r.duration_sec), status: r.status, progress: r.progress,
    sourceLanguage: r.source_language, targetLanguage: r.target_language, voice: r.voice, keepBackground: r.keep_background,
    burnSubtitles: r.burn_subtitles, blurSubtitles: r.blur_subtitles, trimSec: r.trim_sec == null ? null : Number(r.trim_sec),
    held: r.held, used: r.used, lines: r.segments, speakers: r.speakers, error: r.error, files: r.files ?? {},
    createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at),
  };
}

export class SupabaseJobRepository implements ITranslationJobRepository {
  async create(job: TranslationJob) {
    const { data, error } = await db().from("jobs").insert({ ...toRow(job), kind: "dub" }).select().single();
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
    return { userId, fullName: data.full_name, plan: data.plan as PlanId, credits: data.credits, held: data.held, renewsAt: data.renews_at ? new Date(data.renews_at) : null };
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
