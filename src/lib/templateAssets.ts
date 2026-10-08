import "server-only";
import fs from "fs";
import path from "path";
import type { Template } from "@/domain/entities/Template";
import type { JobTemplate } from "@/domain/entities/TranslationJob";
import { SupabaseTemplateRepository } from "@/data/repositories/SupabaseRepositories";
import type { RenderTemplate } from "@/domain/repositories/IMediaRepository";
import { getUploadsDir } from "./uploads";

/** Images and video clips used in a user's templates live in uploads/<user>/assets/. */
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

export function assetsDir(userId: string) {
  if (!UUID.test(userId)) throw new Error("Invalid id");
  const dir = path.join(getUploadsDir(), userId, "assets");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function readAsset(userId: string, id: string): (AssetMeta & { file: string }) | null {
  if (!UUID.test(id)) return null;
  const meta = path.join(assetsDir(userId), `${id}.json`);
  if (!fs.existsSync(meta)) return null;
  const m = JSON.parse(fs.readFileSync(meta, "utf8")) as AssetMeta;
  const file = path.join(assetsDir(userId), id + m.ext);
  return fs.existsSync(file) ? { ...m, file } : null;
}

/** A template ready for ffmpeg: each image / clip layer gets its local file (missing ones are skipped). */
export function resolveTemplate(userId: string, t: Pick<Template, "ratio" | "pan" | "layers">): RenderTemplate {
  return {
    ratio: t.ratio,
    pan: t.pan,
    layers: t.layers.map((L) => {
      if (L.type === "text" || !L.asset) return L;
      const a = readAsset(userId, L.asset);
      return a ? { ...L, file: a.file, hasAudio: a.hasAudio } : L;
    }),
  };
}

/** The user's template as a frozen copy for a job, or null (none chosen / not theirs). */
export async function loadJobTemplate(userId: string, templateId: unknown): Promise<JobTemplate | null> {
  if (typeof templateId !== "string" || !UUID.test(templateId)) return null;
  const t = await new SupabaseTemplateRepository().findById(templateId).catch(() => null);
  if (!t || t.userId !== userId) return null;
  return { id: t.id, name: t.name, ...resolveTemplate(userId, t) };
}
