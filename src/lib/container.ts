import "server-only";
import { FFmpegMediaRepository } from "@/data/repositories/FFmpegMediaRepository";
import { OpenAIAIRepository } from "@/data/repositories/OpenAIAIRepository";
import { ReplicateAudioSeparator } from "@/data/repositories/ReplicateAudioSeparator";
import { SupabaseCreditRepository, SupabaseJobRepository } from "@/data/repositories/SupabaseRepositories";
import { ProcessTranslationJobUseCase } from "@/domain/use-cases/ProcessTranslationJob";
import { ExportWithTemplateUseCase } from "@/domain/use-cases/ExportWithTemplate";
import { RevoiceLineUseCase } from "@/domain/use-cases/RevoiceLine";
import { SplitVideoUseCase } from "@/domain/use-cases/SplitVideo";
import { StartTranslationUseCase } from "@/domain/use-cases/StartTranslation";
import { fileStore } from "./uploads";

export function buildContainer() {
  const jobs = new SupabaseJobRepository();
  const credits = new SupabaseCreditRepository();
  const media = new FFmpegMediaRepository();
  const ai = new OpenAIAIRepository();
  const separator = new ReplicateAudioSeparator();
  const store = fileStore();
  const process = new ProcessTranslationJobUseCase(jobs, credits, media, ai, separator, store);

  return {
    jobs,
    credits,
    media,
    ai,
    separator,
    store,
    startTranslation: new StartTranslationUseCase(jobs, credits, ai, separator),
    processJob: process,
    revoiceLine: new RevoiceLineUseCase(jobs, credits, ai, process, store),
    exportWithTemplate: new ExportWithTemplateUseCase(jobs, credits, media, store),
    splitVideo: new SplitVideoUseCase(jobs, credits, media, store),
  };
}
