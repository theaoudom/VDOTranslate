import { v4 as uuidv4 } from "uuid";
import type { TranslationJob } from "@/domain/entities/TranslationJob";
import type { ITranslationJobRepository } from "@/domain/repositories/ITranslationJobRepository";

export class CreateTranslationJobUseCase {
  constructor(private readonly jobRepository: ITranslationJobRepository) {}

  async execute(originalVideoPath: string, targetLanguage: string): Promise<TranslationJob> {
    const job: TranslationJob = {
      id: uuidv4(),
      status: "pending",
      progress: 0,
      sourceLanguage: null,
      targetLanguage,
      originalVideoPath,
      extractedAudioPath: null,
      translatedAudioPath: null,
      translatedVideoPath: null,
      transcript: null,
      translatedText: null,
      error: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return this.jobRepository.create(job);
  }
}
