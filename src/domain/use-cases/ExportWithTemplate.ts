import * as path from "path";
import { RATES } from "@/domain/billing/pricing";
import type { JobTemplate, TranslationJob } from "@/domain/entities/TranslationJob";
import type { ICreditRepository } from "@/domain/repositories/ICreditRepository";
import type { IMediaRepository } from "@/domain/repositories/IMediaRepository";
import type { ITranslationJobRepository } from "@/domain/repositories/ITranslationJobRepository";
import { activeJobs } from "./activeJobs";

/** Fixed price: render minutes, at least 1 credit. */
export const exportCost = (durationSec: number) => Math.max(1, Math.ceil((durationSec / 60) * RATES.render));

export interface ExportInput {
  userId: string;
  jobId: string;
  name: string;
  sourceVideo: string;
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
  ) {}

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
    activeJobs.add(job.id);
    this.run(job).finally(() => activeJobs.remove(job.id));
    return { ok: true, job };
  }

  private async run(job: TranslationJob) {
    const video = path.join(job.files.dir!, `exported-${Date.now()}.mp4`);
    try {
      await this.media.render(job.files.original!, job.files.original!, video, { template: job.template! });
      await this.credits.settle(job.userId, job.held, job.held, job.name);
      await this.jobs.update(job.id, { status: "completed", progress: 100, used: job.held, files: { ...job.files, video } });
    } catch (e) {
      console.error(`[Export ${job.id}]`, e);
      await this.credits.settle(job.userId, job.held, 0, job.name).catch(() => {});
      await this.jobs.update(job.id, { status: "failed", error: "The export didn’t work. All held credits were returned." }).catch(() => {});
    }
  }
}
