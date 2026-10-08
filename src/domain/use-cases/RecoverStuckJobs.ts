import { REVOICE_LINE_CREDITS } from "@/domain/billing/estimate";
import type { ICreditRepository } from "@/domain/repositories/ICreditRepository";
import type { ITranslationJobRepository } from "@/domain/repositories/ITranslationJobRepository";

/**
 * Jobs run inside the web server. If it restarts (or a step hangs), a job can stop
 * half-way with its credits still held. This finds those jobs and gives the credits back.
 */
export class RecoverStuckJobsUseCase {
  constructor(
    private readonly jobs: ITranslationJobRepository,
    private readonly credits: ICreditRepository,
  ) {}

  /**
   * @param isActive  whether this server process is still working on the job
   * @param staleMinutes  an inactive job that hasn't updated for this long is treated as stuck
   * @param hardLimitMinutes  even an active job is stopped after this long
   */
  async execute({ isActive, staleMinutes, hardLimitMinutes }: { isActive: (id: string) => boolean; staleMinutes: number; hardLimitMinutes: number }) {
    const now = Date.now();
    let recovered = 0;
    for (const job of await this.jobs.listUnfinished()) {
      const idleMin = (now - job.updatedAt.getTime()) / 60000;
      const ageMin = (now - job.createdAt.getTime()) / 60000;
      const orphaned = !isActive(job.id) && idleMin >= staleMinutes;
      const tooLong = ageMin >= hardLimitMinutes && idleMin >= staleMinutes;
      if (!orphaned && !tooLong) continue;

      if (job.kind === "dub" && job.used > 0 && job.status === "merging") {
        // A re-voice of one line was interrupted: the video before it is still fine.
        await this.credits.settle(job.userId, REVOICE_LINE_CREDITS, 0, job.name);
        await this.jobs.update(job.id, { status: "completed", progress: 100, error: "We couldn’t re-voice that line. Your credit was returned." });
      } else {
        await this.credits.settle(job.userId, job.held, 0, job.name);
        await this.jobs.update(job.id, { status: "failed", error: "Processing was interrupted. All held credits were returned. Please try again." });
      }
      recovered++;
    }
    return recovered;
  }
}
