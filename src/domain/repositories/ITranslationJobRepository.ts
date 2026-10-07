import type { TranslationJob, TranslationJobStatus } from "@/domain/entities/TranslationJob";

export interface ITranslationJobRepository {
  create(job: TranslationJob): Promise<TranslationJob>;
  findById(id: string): Promise<TranslationJob | null>;
  listForUser(userId: string, limit?: number): Promise<TranslationJob[]>;
  update(id: string, updates: Partial<TranslationJob>): Promise<TranslationJob>;
  updateStatus(id: string, status: TranslationJobStatus, progress: number): Promise<void>;
}
