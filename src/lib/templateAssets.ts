import "server-only";
import type { Template } from "@/domain/entities/Template";
import type { JobTemplate } from "@/domain/entities/TranslationJob";
import { SupabaseTemplateRepository } from "@/data/repositories/SupabaseRepositories";
import type { RenderTemplate } from "@/domain/repositories/IMediaRepository";
import { fileStore } from "./uploads";

/** Images and video clips used in a user's templates are stored under `<user>/assets/`. */
export interface AssetMeta {
  id: string;
  type: "image" | "video";
  ext: string;
  ar: number;
  hasAudio: boolean;
  durationSec: number;
  name: string;
}

const UUID = /^[0-9a-f-]{36}$/i;

export function assetKey(userId: string, id: string, ext: string) {
  if (!UUID.test(userId) || !UUID.test(id)) throw new Error("Invalid id");
  return `${userId}/assets/${id}${ext}`;
}

/** The asset's details and its storage key, or null when it isn't the user's. */
export async function readAsset(userId: string, id: string): Promise<(AssetMeta & { file: string }) | null> {
  if (!UUID.test(id) || !UUID.test(userId)) return null;
  const text = await fileStore().readText(assetKey(userId, id, ".json")).catch(() => null);
  if (!text) return null;
  const m = JSON.parse(text) as AssetMeta;
  return { ...m, file: assetKey(userId, id, m.ext) };
}

/** A template ready for ffmpeg: each image / clip layer gets its stored file (missing ones are skipped). */
export async function resolveTemplate(userId: string, t: Pick<Template, "ratio" | "pan" | "layers">): Promise<RenderTemplate> {
  return {
    ratio: t.ratio,
    pan: t.pan,
    layers: await Promise.all(t.layers.map(async (L) => {
      if (L.type === "text" || !L.asset) return L;
      const a = await readAsset(userId, L.asset);
      return a ? { ...L, file: a.file, hasAudio: a.hasAudio } : L;
    })),
  };
}

/** The user's template as a frozen copy for a job, or null (none chosen / not theirs). */
export async function loadJobTemplate(userId: string, templateId: unknown): Promise<JobTemplate | null> {
  if (typeof templateId !== "string" || !UUID.test(templateId)) return null;
  const t = await new SupabaseTemplateRepository().findById(templateId).catch(() => null);
  if (!t || t.userId !== userId) return null;
  return { id: t.id, name: t.name, ...(await resolveTemplate(userId, t)) };
}
