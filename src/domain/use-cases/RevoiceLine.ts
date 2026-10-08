import { REVOICE_LINE_CREDITS } from "@/domain/billing/estimate";
import type { IAIRepository } from "@/domain/repositories/IAIRepository";
import type { ICreditRepository } from "@/domain/repositories/ICreditRepository";
import type { IFileStore } from "@/domain/repositories/IFileStore";
import type { ITranslationJobRepository } from "@/domain/repositories/ITranslationJobRepository";
import { toSegments, type ProcessTranslationJobUseCase } from "./ProcessTranslationJob";

export type RevoiceResult = { ok: true } | { ok: false; status: number; message: string };

/** Fix one translated line: charge 1 credit, voice only that line, and re-render the video. */
export class RevoiceLineUseCase {
  constructor(
    private readonly jobs: ITranslationJobRepository,
    private readonly credits: ICreditRepository,
    private readonly ai: IAIRepository,
    private readonly processor: ProcessTranslationJobUseCase,
    private readonly store: IFileStore,
  ) {}

  /** Checks and holds the credit. The caller then runs `run` in the background. */
  async start(userId: string, jobId: string, index: number, text: string): Promise<RevoiceResult> {
    const job = await this.jobs.findById(jobId);
    if (!job || job.userId !== userId) return { ok: false, status: 404, message: "Video not found." };
    if (job.status !== "completed" || !job.lines?.[index]) return { ok: false, status: 409, message: "This video can’t be edited right now." };
    if (!text.trim()) return { ok: false, status: 400, message: "Write the line first." };
    if (!(await this.credits.hold(userId, REVOICE_LINE_CREDITS, "Re-voice 1 line", job.name))) {
      return { ok: false, status: 402, message: "Not enough credits." };
    }
    await this.jobs.update(jobId, { status: "merging", progress: 90 });
    return { ok: true };
  }

  /** Voices the line and renders again. Never throws: on failure the credit goes back and the old video stays. */
  async run(jobId: string, index: number, text: string) {
    const job = await this.jobs.findById(jobId);
    if (!job || job.status !== "merging") return; // already finished (a retry)
    const lines = job.lines!.map((l, i) => (i === index ? { ...l, text: text.trim() } : l));
    try {
      const sourceAudio = job.voice === "cloned" ? await this.store.fetch(job.files.vocals ?? job.files.audio!) : null;
      const one = await this.ai.synthesizeSegments(toSegments(lines), job.targetLanguage, this.store.workDir(job.files.dir!), {
        voice: job.voice, sourceAudioPath: sourceAudio, onlyIndex: index,
      });
      const key = `${job.files.dir}/seg_${index}-${Date.now()}.mp3`;
      await this.store.save(key, one[index]);
      const segments = (job.files.segments ?? []).map((f, i) => (i === index ? key : f));
      const files = await this.processor.renderVideo({ ...job, files: { ...job.files, segments } }, lines);
      await this.credits.settle(job.userId, REVOICE_LINE_CREDITS, REVOICE_LINE_CREDITS, job.name);
      await this.jobs.update(jobId, { status: "completed", progress: 100, lines, files, error: null });
    } catch (e) {
      console.error(`[Revoice ${jobId}]`, e);
      await this.credits.settle(job.userId, REVOICE_LINE_CREDITS, 0, job.name).catch(() => {});
      await this.jobs.update(jobId, { status: "completed", progress: 100, error: "We couldn’t re-voice that line. Your credit was returned." }).catch(() => {});
    }
  }
}
