import { REVOICE_LINE_CREDITS } from "@/domain/billing/estimate";
import type { IAIRepository } from "@/domain/repositories/IAIRepository";
import type { ICreditRepository } from "@/domain/repositories/ICreditRepository";
import type { ITranslationJobRepository } from "@/domain/repositories/ITranslationJobRepository";
import { activeJobs } from "./activeJobs";
import { toSegments, type ProcessTranslationJobUseCase } from "./ProcessTranslationJob";

export type RevoiceResult = { ok: true } | { ok: false; status: number; message: string };

/** Fix one translated line: charge 1 credit, voice only that line, and re-render the video. */
export class RevoiceLineUseCase {
  constructor(
    private readonly jobs: ITranslationJobRepository,
    private readonly credits: ICreditRepository,
    private readonly ai: IAIRepository,
    private readonly processor: ProcessTranslationJobUseCase,
  ) {}

  async start(userId: string, jobId: string, index: number, text: string): Promise<RevoiceResult> {
    const job = await this.jobs.findById(jobId);
    if (!job || job.userId !== userId) return { ok: false, status: 404, message: "Video not found." };
    if (job.status !== "completed" || !job.lines?.[index]) return { ok: false, status: 409, message: "This video can’t be edited right now." };
    const clean = text.trim();
    if (!clean) return { ok: false, status: 400, message: "Write the line first." };
    if (!(await this.credits.hold(userId, REVOICE_LINE_CREDITS, "Re-voice 1 line", job.name))) {
      return { ok: false, status: 402, message: "Not enough credits." };
    }
    await this.jobs.update(jobId, { status: "merging", progress: 90 });
    activeJobs.add(job.id);
    this.run(job.id, index, clean)
      .catch((e) => console.error(`[Revoice ${jobId}]`, e))
      .finally(() => activeJobs.remove(job.id));
    return { ok: true };
  }

  private async run(jobId: string, index: number, text: string) {
    const job = (await this.jobs.findById(jobId))!;
    const files = { ...job.files };
    const lines = job.lines!.map((l, i) => (i === index ? { ...l, text } : l));
    try {
      const segs = toSegments(lines);
      const one = await this.ai.synthesizeSegments(segs, job.targetLanguage, files.dir!, {
        voice: job.voice, sourceAudioPath: files.vocals ?? files.audio, onlyIndex: index,
      });
      files.segments = (files.segments ?? []).map((f, i) => (i === index ? one[index] : f));
      await this.processor.renderVideo(job, files, lines, segs);
      await this.credits.settle(job.userId, REVOICE_LINE_CREDITS, REVOICE_LINE_CREDITS, job.name);
      await this.jobs.update(jobId, { status: "completed", progress: 100, lines, files, error: null });
    } catch (e) {
      console.error(`[Revoice ${jobId}]`, e);
      await this.credits.settle(job.userId, REVOICE_LINE_CREDITS, 0, job.name).catch(() => {});
      // the previous video is still intact
      await this.jobs.update(jobId, { status: "completed", progress: 100, error: "We couldn’t re-voice that line. Your credit was returned." }).catch(() => {});
    }
  }
}
