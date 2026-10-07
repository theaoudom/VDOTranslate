import fs from "fs";
import path from "path";

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
