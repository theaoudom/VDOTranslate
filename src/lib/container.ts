import "server-only";
import { FFmpegMediaRepository } from "@/data/repositories/FFmpegMediaRepository";
import { OpenAIAIRepository } from "@/data/repositories/OpenAIAIRepository";
import { ReplicateAudioSeparator } from "@/data/repositories/ReplicateAudioSeparator";
import { SupabaseCreditRepository, SupabaseJobRepository } from "@/data/repositories/SupabaseRepositories";
import { ProcessTranslationJobUseCase } from "@/domain/use-cases/ProcessTranslationJob";
import { RevoiceLineUseCase } from "@/domain/use-cases/RevoiceLine";
import { StartTranslationUseCase } from "@/domain/use-cases/StartTranslation";

export { getUploadsDir, jobDir } from "./uploads";

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
