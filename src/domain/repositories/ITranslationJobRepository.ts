import type { TranslationJob, TranslationJobStatus } from "@/domain/entities/TranslationJob";

export interface ITranslationJobRepository {
  create(job: TranslationJob): Promise<TranslationJob>;
  findById(id: string): Promise<TranslationJob | null>;
  listForUser(userId: string, limit?: number): Promise<TranslationJob[]>;
  /** Jobs that are neither completed nor failed (any user). */
  listUnfinished(): Promise<TranslationJob[]>;
  /** Jobs created before this date that still have files on disk (any user). */
  listWithFilesBefore(date: Date): Promise<TranslationJob[]>;
  update(id: string, updates: Partial<TranslationJob>): Promise<TranslationJob>;
  updateStatus(id: string, status: TranslationJobStatus, progress: number): Promise<void>;
}
