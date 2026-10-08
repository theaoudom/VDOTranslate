import fs from "fs";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { del, get, list, put } from "@vercel/blob";
import type { IFileStore, StoredStream } from "@/domain/repositories/IFileStore";

const TYPES: Record<string, string> = {
  ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".mkv": "video/x-matroska",
  ".mp3": "audio/mpeg", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".json": "application/json", ".srt": "application/x-subrip",
};
export const contentTypeOf = (key: string) => TYPES[path.extname(key).toLowerCase()] ?? "application/octet-stream";

/** Keys from before the move to keys were absolute local paths: keep reading those. */
const isLegacyPath = (key: string) => path.isAbsolute(key);

function parseRange(range: string | null | undefined, size: number): { start: number; end: number } | "invalid" | null {
  const m = /bytes=(\d*)-(\d*)/.exec(range ?? "");
  if (!m) return null;
  const start = m[1] ? +m[1] : 0;
  const end = m[2] ? Math.min(+m[2], size - 1) : size - 1;
  return start >= size || start > end ? "invalid" : { start, end };
}

/** Files in the local uploads folder (development / single server). */
export class LocalFileStore implements IFileStore {
  constructor(private readonly root: string) {}
  private p(key: string) {
    if (isLegacyPath(key)) return key;
    const full = path.resolve(this.root, key);
    if (path.relative(this.root, full).startsWith("..")) throw new Error("Invalid key");
    return full;
  }
  async fetch(key: string) {
    const p = this.p(key);
    if (!fs.existsSync(p)) throw new Error(`Missing file ${key}`);
    return p;
  }
  async save(key: string, localPath: string) {
    const dest = this.p(key);
    if (path.resolve(localPath) === dest) return;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(localPath, dest);
  }
  async saveText(key: string, text: string) {
    const dest = this.p(key);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, text, "utf8");
  }
  async readText(key: string) {
    const p = this.p(key);
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
  }
  async exists(key: string) {
    return fs.existsSync(this.p(key));
  }
  async stream(key: string, range?: string | null): Promise<StoredStream | null> {
    const p = this.p(key);
    if (!fs.existsSync(p)) return null;
    const size = fs.statSync(p).size;
    const r = parseRange(range, size);
    if (r === "invalid") return null;
    const contentType = contentTypeOf(key);
    if (r) return { status: 206, body: Readable.toWeb(fs.createReadStream(p, r)) as ReadableStream, size, contentType, contentRange: `bytes ${r.start}-${r.end}/${size}`, contentLength: r.end - r.start + 1 };
    return { status: 200, body: Readable.toWeb(fs.createReadStream(p)) as ReadableStream, size, contentType, contentLength: size };
  }
  async deletePrefix(prefix: string) {
    fs.rmSync(this.p(prefix), { recursive: true, force: true });
  }
  async listFolders(prefix: string) {
    const dir = this.p(prefix);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      return st.isDirectory() ? [{ prefix: `${prefix}${name}/`, updatedAt: st.mtime }] : [];
    });
  }
  workDir(jobKey: string) {
    const dir = this.p(jobKey);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
}

/** Private Vercel Blob storage. Files are copied to /tmp while a step works on them. */
export class BlobFileStore implements IFileStore {
  private readonly tmp = path.join(os.tmpdir(), "samesay");

  async fetch(key: string) {
    if (isLegacyPath(key) && fs.existsSync(key)) return key;
    const local = path.join(this.tmp, key);
    if (fs.existsSync(local)) return local; // already here from an earlier step on this machine
    const res = await get(key, { access: "private", useCache: false });
    if (!res || res.statusCode !== 200) throw new Error(`Missing file ${key}`);
    fs.mkdirSync(path.dirname(local), { recursive: true });
    const partial = local + ".part";
    await pipeline(Readable.fromWeb(res.stream as never), fs.createWriteStream(partial));
    fs.renameSync(partial, local);
    return local;
  }
  async save(key: string, localPath: string, contentType?: string) {
    await put(key, fs.createReadStream(localPath), {
      access: "private", contentType: contentType ?? contentTypeOf(key), addRandomSuffix: false, allowOverwrite: true,
      multipart: fs.statSync(localPath).size > 50 * 1024 * 1024,
    });
    // keep a local copy for the next step on this machine
    const local = path.join(this.tmp, key);
    if (path.resolve(localPath) !== path.resolve(local)) {
      fs.mkdirSync(path.dirname(local), { recursive: true });
      fs.copyFileSync(localPath, local);
    }
  }
  async saveText(key: string, text: string) {
    await put(key, text, { access: "private", contentType: contentTypeOf(key), addRandomSuffix: false, allowOverwrite: true });
  }
  async readText(key: string) {
    const res = await get(key, { access: "private", useCache: false });
    if (!res || res.statusCode !== 200) return null;
    return new Response(res.stream).text();
  }
  async exists(key: string) {
    const res = await get(key, { access: "private", useCache: false, headers: { Range: "bytes=0-0" } }).catch(() => null);
    if (res?.stream) await res.stream.cancel().catch(() => {});
    return Boolean(res);
  }
  async stream(key: string, range?: string | null): Promise<StoredStream | null> {
    const res = await get(key, { access: "private", headers: range ? { Range: range } : undefined });
    if (!res || !res.stream) return null;
    const status = (res as unknown as { statusCode: number }).statusCode === 206 || res.headers.get("content-range") ? 206 : 200;
    const contentRange = res.headers.get("content-range") ?? undefined;
    const size = contentRange ? +(contentRange.split("/")[1] ?? 0) : Number(res.headers.get("content-length") ?? 0);
    return { status, body: res.stream, size, contentType: contentTypeOf(key), contentRange, contentLength: Number(res.headers.get("content-length") ?? size) };
  }
  async deletePrefix(prefix: string) {
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor, limit: 1000 });
      if (page.blobs.length) await del(page.blobs.map((b) => b.url));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    fs.rmSync(path.join(this.tmp, prefix), { recursive: true, force: true });
  }
  async listFolders(prefix: string) {
    const newest = new Map<string, Date>();
    let cursor: string | undefined;
    do {
      const page = await list({ prefix, cursor, limit: 1000 });
      for (const b of page.blobs) {
        const rest = b.pathname.slice(prefix.length);
        const i = rest.indexOf("/");
        if (i <= 0) continue;
        const folder = prefix + rest.slice(0, i + 1);
        const prev = newest.get(folder);
        if (!prev || b.uploadedAt > prev) newest.set(folder, b.uploadedAt);
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return Array.from(newest, ([p, updatedAt]) => ({ prefix: p, updatedAt }));
  }
  workDir(jobKey: string) {
    const dir = path.join(this.tmp, jobKey);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
}
