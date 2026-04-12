import type { ITranslationJobRepository } from "@/domain/repositories/ITranslationJobRepository";

export class GetTranslationJobUseCase {
  constructor(private readonly jobRepository: ITranslationJobRepository) {}

  async execute(id: string) {
    const job = await this.jobRepository.findById(id);
    if (!job) throw new Error(`Translation job not found: ${id}`);
    return job;
  }
}
