import * as path from "path";
import type { ITranslationJobRepository } from "@/domain/repositories/ITranslationJobRepository";
import type { IVideoProcessingRepository } from "@/domain/repositories/IVideoProcessingRepository";
import type { IAIRepository } from "@/domain/repositories/IAIRepository";

export class ProcessTranslationJobUseCase {
  constructor(
    private readonly jobRepository: ITranslationJobRepository,
    private readonly videoProcessor: IVideoProcessingRepository,
    private readonly aiRepository: IAIRepository,
  ) {}

  async execute(jobId: string, uploadsDir: string): Promise<void> {
    const job = await this.jobRepository.findById(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);

    try {
      // Step 1: Extract audio from video
      await this.jobRepository.updateStatus(jobId, "extracting", 10);
      const audioPath = path.join(uploadsDir, `${jobId}_audio.mp3`);
      await this.videoProcessor.extractAudio(job.originalVideoPath, audioPath);
      await this.jobRepository.update(jobId, { extractedAudioPath: audioPath });

      // Step 2: Transcribe audio & detect language
      await this.jobRepository.updateStatus(jobId, "transcribing", 30);
      const { text: transcript, language: sourceLanguage } =
        await this.aiRepository.transcribe(audioPath);
      await this.jobRepository.update(jobId, { transcript, sourceLanguage });
      
      console.log(`\n\n=== ORIGINAL SCRIPT (Detected: ${sourceLanguage}) ===\n${transcript}\n==============================================\n`);

      // Step 3: Translate text
      await this.jobRepository.updateStatus(jobId, "translating", 55);
      const translatedText = await this.aiRepository.translate(
        transcript,
        job.targetLanguage,
      );
      await this.jobRepository.update(jobId, { translatedText });
      
      console.log(`\n\n=== TRANSLATED SCRIPT (${job.targetLanguage}) ===\n${translatedText}\n=======================================\n`);

      // Step 4: Text-to-speech synthesis
      await this.jobRepository.updateStatus(jobId, "synthesizing", 75);
      const translatedAudioPath = path.join(uploadsDir, `${jobId}_translated.mp3`);
      await this.aiRepository.synthesize(translatedText, job.targetLanguage, translatedAudioPath);
      await this.jobRepository.update(jobId, { translatedAudioPath });

      // Step 5: Merge translated audio back into video
      await this.jobRepository.updateStatus(jobId, "merging", 90);
      const translatedVideoPath = path.join(uploadsDir, `${jobId}_translated.mp4`);
      await this.videoProcessor.mergeAudioIntoVideo(
        job.originalVideoPath,
        translatedAudioPath,
        translatedVideoPath,
      );

      // Done
      await this.jobRepository.update(jobId, {
        translatedVideoPath,
        status: "completed",
        progress: 100,
        updatedAt: new Date(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.jobRepository.update(jobId, {
        status: "failed",
        error: message,
        updatedAt: new Date(),
      });
      throw err;
    }
  }
}
