import fs from "fs";
import os from "os";
import path from "path";
import { NextResponse, type NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { buildContainer } from "@/lib/container";
import { requireUser } from "@/lib/session";
import { fileStore, jobKey, type UploadMeta } from "@/lib/uploads";

const MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
const ALLOWED = [".mp4", ".mov", ".webm", ".mkv", ".m4v", ".avi"];

/**
 * Takes in a video and returns its length, so the price can be shown before anything is charged.
 * Either the file itself (multipart, local storage) or `{ id, name, size, ext }` for a video
 * the browser already put in storage.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const store = fileStore();

  let id: string, name: string, size: number, ext: string;
  if (req.headers.get("content-type")?.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    id = String(body?.id ?? "");
    name = String(body?.name ?? "video").slice(0, 200);
    size = Number(body?.size) || 0;
    ext = String(body?.ext ?? "").toLowerCase();
    if (!ALLOWED.includes(ext)) return NextResponse.json({ error: "Use an MP4, MOV or WEBM video." }, { status: 400 });
    try { jobKey(auth.user.id, id); } catch { return NextResponse.json({ error: "Upload not found." }, { status: 404 }); }
    if (await store.exists(`${jobKey(auth.user.id, id)}/upload.json`)) return NextResponse.json({ error: "Already uploaded." }, { status: 409 });
  } else {
    const form = await req.formData();
    const file = form.get("video");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a video file." }, { status: 400 });
    ext = path.extname(file.name).toLowerCase();
    if (!ALLOWED.includes(ext)) return NextResponse.json({ error: "Use an MP4, MOV or WEBM video." }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "That video is larger than 2 GB." }, { status: 413 });
    id = uuidv4();
    name = file.name;
    size = file.size;
    const tmp = path.join(os.tmpdir(), `samesay-upload-${id}${ext}`);
    fs.writeFileSync(tmp, Buffer.from(await file.arrayBuffer()));
    await store.save(`${jobKey(auth.user.id, id)}/original${ext}`, tmp);
    fs.rmSync(tmp, { force: true });
  }

  const key = jobKey(auth.user.id, id);
  try {
    const info = await buildContainer().media.probe(await store.fetch(`${key}/original${ext}`));
    const meta: UploadMeta = { name, size, ext, ...info };
    await store.saveText(`${key}/upload.json`, JSON.stringify(meta));
    return NextResponse.json({ uploadId: id, name, size, durationSec: info.durationSec, width: info.width, height: info.height }, { status: 201 });
  } catch (e) {
    console.error("[upload] probe failed", e);
    await store.deletePrefix(`${key}/`).catch(() => {});
    return NextResponse.json({ error: "That file can’t be read as a video." }, { status: 400 });
  }
}
