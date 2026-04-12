import path from "path";
import fs from "fs";
import { getJobRepository } from "@/data/repositories/InMemoryTranslationJobRepository";
import { FFmpegVideoProcessingRepository } from "@/data/repositories/FFmpegVideoProcessingRepository";
import { OpenAIAIRepository } from "@/data/repositories/OpenAIAIRepository";
import { CreateTranslationJobUseCase } from "@/domain/use-cases/CreateTranslationJob";
import { GetTranslationJobUseCase } from "@/domain/use-cases/GetTranslationJob";
import { ProcessTranslationJobUseCase } from "@/domain/use-cases/ProcessTranslationJob";

export function getUploadsDir(): string {
  const dir = process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.join(process.cwd(), "uploads");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function buildContainer() {
  const jobRepository = getJobRepository();
  const videoProcessor = new FFmpegVideoProcessingRepository();
  const aiRepository = new OpenAIAIRepository();

  return {
    createJob: new CreateTranslationJobUseCase(jobRepository),
    getJob: new GetTranslationJobUseCase(jobRepository),
    processJob: new ProcessTranslationJobUseCase(jobRepository, videoProcessor, aiRepository),
  };
}
