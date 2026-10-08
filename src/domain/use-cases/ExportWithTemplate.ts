import * as path from "path";
import { exportCost } from "@/domain/billing/estimate";
import type { JobTemplate, TranslationJob } from "@/domain/entities/TranslationJob";
import type { ICreditRepository } from "@/domain/repositories/ICreditRepository";
import type { IFileStore } from "@/domain/repositories/IFileStore";
import type { IMediaRepository } from "@/domain/repositories/IMediaRepository";
import type { ITranslationJobRepository } from "@/domain/repositories/ITranslationJobRepository";
import { localTemplate } from "./ProcessTranslationJob";

export interface ExportInput {
  userId: string;
  jobId: string;
  name: string;
  /** storage key of the video to export */
  sourceVideo: string;
  /** storage folder for the new job */
  dir: string;
  durationSec: number;
  template: JobTemplate;
}

export type ExportResult = { ok: true; job: TranslationJob } | { ok: false; message: string };

/** "Export this video" from the Templates editor: apply a template to a finished or uploaded video. */
export class ExportWithTemplateUseCase {
  constructor(
    private readonly jobs: ITranslationJobRepository,
    private readonly credits: ICreditRepository,
    private readonly media: IMediaRepository,
    private readonly store: IFileStore,
  ) {}

  /** Holds the credits and creates the job. The caller then runs `run` in the background. */
  async start(input: ExportInput): Promise<ExportResult> {
    const cost = exportCost(input.durationSec);
    if (!(await this.credits.hold(input.userId, cost, `Export with template · ${input.template.name}`, input.name))) {
      return { ok: false, message: `Not enough credits. You need ${cost}.` };
    }
    const now = new Date();
    const job = await this.jobs.create({
      id: input.jobId, userId: input.userId, kind: "edit", name: input.name, durationSec: input.durationSec,
      status: "merging", progress: 10, sourceLanguage: null, targetLanguage: "", voice: "standard",
      keepBackground: false, burnSubtitles: false, blurSubtitles: false, trimSec: null,
      held: cost, used: 0, lines: null, speakers: null, error: null, template: input.template,
      files: { dir: input.dir, original: input.sourceVideo }, createdAt: now, updatedAt: now,
    });
    return { ok: true, job };
  }

  /** Renders the export. Never throws: on failure the credits go back. */
  async run(jobId: string) {
    const job = await this.jobs.findById(jobId);
    if (!job || job.status !== "merging") return; // already finished (a retry)
    try {
      const name = `exported-${Date.now()}.mp4`;
      const key = `${job.files.dir}/${name}`;
      const local = path.join(this.store.workDir(job.files.dir!), name);
      const original = await this.store.fetch(job.files.original!);
      await this.media.render(original, original, local, { template: await localTemplate(this.store, job.template!) });
      await this.store.save(key, local);
      await this.credits.settle(job.userId, job.held, job.held, job.name);
      await this.jobs.update(job.id, { status: "completed", progress: 100, used: job.held, files: { ...job.files, video: key } });
    } catch (e) {
      console.error(`[Export ${job.id}]`, e);
      await this.credits.settle(job.userId, job.held, 0, job.name).catch(() => {});
      await this.jobs.update(job.id, { status: "failed", error: "The export didn’t work. All held credits were returned." }).catch(() => {});
    }
  }
}
