import type { TranslationJob, TranslationJobStatus } from "@/domain/entities/TranslationJob";
import type { ITranslationJobRepository } from "@/domain/repositories/ITranslationJobRepository";

// Bound to global to survive Next.js Hot Module Replacement in dev mode
const globalForJobs = global as unknown as { store: Map<string, TranslationJob> };
const store = globalForJobs.store || new Map<string, TranslationJob>();
if (process.env.NODE_ENV !== "production") globalForJobs.store = store;

export class InMemoryTranslationJobRepository implements ITranslationJobRepository {
  async create(job: TranslationJob): Promise<TranslationJob> {
    store.set(job.id, { ...job });
    return job;
  }

  async findById(id: string): Promise<TranslationJob | null> {
    return store.get(id) ?? null;
  }

  async update(id: string, updates: Partial<TranslationJob>): Promise<TranslationJob> {
    const existing = store.get(id);
    if (!existing) throw new Error(`Job ${id} not found`);
    const updated: TranslationJob = { ...existing, ...updates, updatedAt: new Date() };
    store.set(id, updated);
    return updated;
  }

  async updateStatus(id: string, status: TranslationJobStatus, progress: number): Promise<void> {
    await this.update(id, { status, progress });
  }

  async delete(id: string): Promise<void> {
    store.delete(id);
  }
}

// Singleton export so the same store is reused across API routes in dev
let instance: InMemoryTranslationJobRepository | null = null;
export function getJobRepository(): InMemoryTranslationJobRepository {
  if (!instance) instance = new InMemoryTranslationJobRepository();
  return instance;
}
