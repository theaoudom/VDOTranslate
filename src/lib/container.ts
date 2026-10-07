import "server-only";
import fs from "fs";
import path from "path";
import { FFmpegMediaRepository } from "@/data/repositories/FFmpegMediaRepository";
import { OpenAIAIRepository } from "@/data/repositories/OpenAIAIRepository";
import { ReplicateAudioSeparator } from "@/data/repositories/ReplicateAudioSeparator";
import { SupabaseCreditRepository, SupabaseJobRepository } from "@/data/repositories/SupabaseRepositories";
import { ProcessTranslationJobUseCase } from "@/domain/use-cases/ProcessTranslationJob";
import { RevoiceLineUseCase } from "@/domain/use-cases/RevoiceLine";
import { StartTranslationUseCase } from "@/domain/use-cases/StartTranslation";

export function getUploadsDir(): string {
  const dir = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(process.cwd(), "uploads");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Folder for one user's upload/job. Ids are UUIDs, checked before use. */
export function jobDir(userId: string, id: string): string {
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!uuid.test(userId) || !uuid.test(id)) throw new Error("Invalid id");
  return path.join(getUploadsDir(), userId, id);
}

export function buildContainer() {
  const jobs = new SupabaseJobRepository();
  const credits = new SupabaseCreditRepository();
  const media = new FFmpegMediaRepository();
  const ai = new OpenAIAIRepository();
  const separator = new ReplicateAudioSeparator();
  const process = new ProcessTranslationJobUseCase(jobs, credits, media, ai, separator);

  return {
    jobs,
    credits,
    media,
    ai,
    separator,
    startTranslation: new StartTranslationUseCase(jobs, credits, ai, separator),
    processJob: process,
    revoiceLine: new RevoiceLineUseCase(jobs, credits, ai, process),
  };
}
