import fs from "fs";
import os from "os";
import path from "path";
import { NextResponse, type NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { FFmpegMediaRepository } from "@/data/repositories/FFmpegMediaRepository";
import { requireUser } from "@/lib/session";
import { assetKey, type AssetMeta } from "@/lib/templateAssets";
import { fileStore } from "@/lib/uploads";

const IMAGE = [".png", ".jpg", ".jpeg", ".webp"];
const VIDEO = [".mp4", ".mov", ".webm", ".m4v"];

/**
 * Add an image (logo, sticker…) or a short video clip for a template layer: either the file
 * itself (multipart) or `{ id, name, ext }` for a file the browser already put in storage.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const store = fileStore();

  let id: string, name: string, ext: string;
  if (req.headers.get("content-type")?.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    id = String(body?.id ?? "");
    name = String(body?.name ?? "file").slice(0, 200);
    ext = String(body?.ext ?? "").toLowerCase();
    if (!IMAGE.includes(ext) && !VIDEO.includes(ext)) return NextResponse.json({ error: "Use a PNG, JPG or WEBP image, or an MP4 / MOV clip." }, { status: 400 });
    try { assetKey(auth.user.id, id, ext); } catch { return NextResponse.json({ error: "Upload not found." }, { status: 404 }); }
    if (await store.exists(assetKey(auth.user.id, id, ".json"))) return NextResponse.json({ error: "Already uploaded." }, { status: 409 });
  } else {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file." }, { status: 400 });
    ext = path.extname(file.name).toLowerCase();
    if (!IMAGE.includes(ext) && !VIDEO.includes(ext)) return NextResponse.json({ error: "Use a PNG, JPG or WEBP image, or an MP4 / MOV clip." }, { status: 400 });
    const max = IMAGE.includes(ext) ? 10 : 200;
    if (file.size > max * 1024 * 1024) return NextResponse.json({ error: `That file is larger than ${max} MB.` }, { status: 413 });
    id = uuidv4();
    name = file.name;
    const tmp = path.join(os.tmpdir(), `samesay-asset-${id}${ext}`);
    fs.writeFileSync(tmp, Buffer.from(await file.arrayBuffer()));
    await store.save(assetKey(auth.user.id, id, ext), tmp);
    fs.rmSync(tmp, { force: true });
  }

  const type = IMAGE.includes(ext) ? "image" : "video";
  const key = assetKey(auth.user.id, id, ext);
  try {
    const info = await new FFmpegMediaRepository().probe(await store.fetch(key));
    if (!info.width || !info.height) throw new Error("no picture");
    const meta: AssetMeta = { id, type, ext, ar: info.width / info.height, hasAudio: type === "video" && info.hasAudio, durationSec: info.durationSec, name };
    await store.saveText(assetKey(auth.user.id, id, ".json"), JSON.stringify(meta));
    return NextResponse.json({ asset: id, type, ar: meta.ar, hasAudio: meta.hasAudio, name }, { status: 201 });
  } catch {
    await store.deletePrefix(key).catch(() => {});
    return NextResponse.json({ error: "That file can’t be read." }, { status: 400 });
  }
}
