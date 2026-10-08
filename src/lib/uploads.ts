import fs from "fs";
import path from "path";
import { BlobFileStore, LocalFileStore } from "@/data/storage/FileStores";
import type { IFileStore } from "@/domain/repositories/IFileStore";

export function getUploadsDir(): string {
  const dir = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(process.cwd(), "uploads");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Videos go to Vercel Blob on Vercel (no lasting disk there), the uploads folder otherwise. */
export const usesBlob = process.env.FILE_STORE === "blob" || (process.env.FILE_STORE !== "local" && Boolean(process.env.VERCEL));

const g = globalThis as unknown as { __samesayStore?: IFileStore };
export function fileStore(): IFileStore {
  return (g.__samesayStore ??= usesBlob ? new BlobFileStore() : new LocalFileStore(getUploadsDir()));
}

const UUID = /^[0-9a-f-]{36}$/i;

/** Storage folder for one user's upload/job: `<userId>/<id>`. Ids are UUIDs, checked before use. */
export function jobKey(userId: string, id: string): string {
  if (!UUID.test(userId) || !UUID.test(id)) throw new Error("Invalid id");
  return `${userId}/${id}`;
}

export interface UploadMeta {
  name: string;
  size: number;
  ext: string;
  durationSec: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

/** What we learned about an upload when it arrived, or null when there's no such upload. */
export async function readUpload(userId: string, id: string): Promise<(UploadMeta & { key: string; video: string }) | null> {
  let key: string;
  try { key = jobKey(userId, id); } catch { return null; }
  const text = await fileStore().readText(`${key}/upload.json`).catch(() => null);
  if (!text) return null;
  const meta = JSON.parse(text) as UploadMeta;
  return { ...meta, key, video: `${key}/original${meta.ext}` };
}
