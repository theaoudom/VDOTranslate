import * as path from "path";
import type { TemplateLayer } from "@/domain/entities/Template";
import type { JobTemplate, TranslationJob } from "@/domain/entities/TranslationJob";
import type { ICreditRepository } from "@/domain/repositories/ICreditRepository";
import type { IFileStore } from "@/domain/repositories/IFileStore";
import type { IMediaRepository, RenderTemplate } from "@/domain/repositories/IMediaRepository";
import type { ITranslationJobRepository } from "@/domain/repositories/ITranslationJobRepository";
import { planParts, snapToPauses, splitEstimate, type SplitSettings } from "@/domain/split/Split";
import { localTemplate } from "./ProcessTranslationJob";

export interface SplitInput {
  userId: string;
  jobId: string;
  name: string;
  /** storage key of the video to split */
  sourceVideo: string;
  /** storage folder for the new job */
  dir: string;
  durationSec: number;
  settings: SplitSettings;
  template: JobTemplate | null;
}

export type SplitResult = { ok: true; job: TranslationJob } | { ok: false; message: string };

export const SPLIT_FAILED = "The split didn’t work. All held credits were returned.";

/**
 * Auto-split as stages for the workflow in src/workflows/jobs.ts: plan the cuts (moving
 * them onto pauses), make the parts a few at a time, then charge the fixed price.
 */
export class SplitVideoUseCase {
  constructor(
    private readonly jobs: ITranslationJobRepository,
    private readonly credits: ICreditRepository,
    private readonly media: IMediaRepository,
    private readonly store: IFileStore,
  ) {}

  /** Holds the price and creates the job. The caller then starts the workflow. */
  async start(input: SplitInput): Promise<SplitResult> {
    const est = splitEstimate(input.durationSec, input.settings, Boolean(input.template));
    const parts = planParts(input.durationSec, input.settings);
    if (!(await this.credits.hold(input.userId, est.total, `Auto-split · ${parts.length} parts`, input.name))) {
      return { ok: false, message: `Not enough credits. You need ${est.total}.` };
    }
    const now = new Date();
    const job = await this.jobs.create({
      id: input.jobId, userId: input.userId, kind: "split", name: input.name, durationSec: input.durationSec,
      status: "pending", progress: 0, sourceLanguage: null, targetLanguage: "", voice: "standard",
      keepBackground: false, burnSubtitles: false, blurSubtitles: false, trimSec: null,
      held: est.total, used: 0, lines: null, speakers: null, error: null, template: input.template,
      split: { ...input.settings, parts }, files: { dir: input.dir, original: input.sourceVideo }, createdAt: now, updatedAt: now,
    });
    return { ok: true, job };
  }

  private async load(jobId: string) {
    const job = await this.jobs.findById(jobId);
    if (!job?.split) throw new Error(`Split job ${jobId} not found`);
    return job as TranslationJob & { split: NonNullable<TranslationJob["split"]> };
  }

  /** 1. Final cut points. Returns how many parts there are and whether they're re-encoded. */
  async plan(jobId: string): Promise<{ parts: number; encode: boolean }> {
    const job = await this.load(jobId);
    await this.jobs.updateStatus(jobId, "extracting", 5);
    let parts = planParts(job.durationSec, job.split);
    if (job.split.silence && parts.length > 1) {
      const pauses = await this.media.findPauses(await this.store.fetch(job.files.original!));
      parts = snapToPauses(parts, pauses);
    }
    await this.jobs.update(jobId, { split: { ...job.split, parts } });
    return { parts: parts.length, encode: splitEstimate(job.durationSec, job.split, Boolean(job.template)).encode };
  }

  /** 2. Make parts from..to-1. */
  async makeParts(jobId: string, from: number, to: number) {
    const job = await this.load(jobId);
    const parts = job.split.parts;
    await this.jobs.updateStatus(jobId, "merging", Math.round(10 + (85 * from) / parts.length));
    const encode = splitEstimate(job.durationSec, job.split, Boolean(job.template)).encode;
    const original = await this.store.fetch(job.files.original!);
    const template = job.template ? await localTemplate(this.store, job.template) : null;
    const made = [...parts];
    for (let i = from; i < Math.min(to, parts.length); i++) {
      const p = parts[i];
      if (p.file) continue; // already made (a retry)
      const name = `part-${String(i + 1).padStart(2, "0")}.mp4`;
      const local = path.join(this.store.workDir(job.files.dir!), name);
      if (encode) {
        await this.media.render(original, original, local, { startSec: p.from, trimSec: p.to - p.from, template: partTemplate(job.split, template, i, parts.length) });
      } else {
        await this.media.cut(original, p.from, p.to, local);
      }
      const key = `${job.files.dir}/${name}`;
      await this.store.save(key, local);
      made[i] = { ...p, file: key };
    }
    // reload: keep anything written meanwhile, add the new files
    const fresh = await this.load(jobId);
    await this.jobs.update(jobId, { split: { ...fresh.split, parts: fresh.split.parts.map((p, i) => ({ ...p, file: made[i]?.file ?? p.file })) } });
  }

  /** 3. Charge the fixed price. */
  async finish(jobId: string) {
    const job = await this.load(jobId);
    if (job.status === "completed" || job.status === "failed") return;
    if (job.split.parts.some((p) => !p.file)) throw new Error("Some parts weren’t made.");
    await this.credits.settle(job.userId, job.held, job.held, job.name);
    await this.jobs.update(jobId, { status: "completed", progress: 100, used: job.held, error: null });
  }

  async fail(jobId: string) {
    const job = await this.jobs.findById(jobId);
    if (!job || job.status === "completed" || job.status === "failed") return;
    await this.credits.settle(job.userId, job.held, 0, job.name);
    await this.jobs.update(jobId, { status: "failed", error: SPLIT_FAILED });
  }
}

/** Frame and layers for one part: 9:16 crop, the brand template, and the "Part 1/12" label. */
export function partTemplate(s: SplitSettings, template: RenderTemplate | null, index: number, count: number): RenderTemplate | undefined {
  const label: TemplateLayer | null = s.label
    ? { id: "part-label", type: "text", name: "Part label", x: 4, y: 4, w: 60, op: 100, range: "all", anchor: "start", from: 0, to: 0, ar: 1, text: `Part ${index + 1}/${count}`, style: "dark" }
    : null;
  if (!s.reframe && !template && !label) return undefined;
  return {
    ratio: s.reframe ? "9:16" : template?.ratio ?? "source",
    pan: template?.pan ?? 50,
    layers: [...(template?.layers ?? []), ...(label ? [label] : [])],
  };
}
