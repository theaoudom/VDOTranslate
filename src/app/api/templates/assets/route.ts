import fs from "fs";
import path from "path";
import { NextResponse, type NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { FFmpegMediaRepository } from "@/data/repositories/FFmpegMediaRepository";
import { requireUser } from "@/lib/session";
import { assetsDir, type AssetMeta } from "@/lib/templateAssets";

const IMAGE = [".png", ".jpg", ".jpeg", ".webp"];
const VIDEO = [".mp4", ".mov", ".webm", ".m4v"];

/** Upload an image (logo, sticker…) or a short video clip for a template layer. */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file." }, { status: 400 });
  const ext = path.extname(file.name).toLowerCase();
  const type = IMAGE.includes(ext) ? "image" : VIDEO.includes(ext) ? "video" : null;
  if (!type) return NextResponse.json({ error: "Use a PNG, JPG or WEBP image, or an MP4 / MOV clip." }, { status: 400 });
  const max = type === "image" ? 10 : 200;
  if (file.size > max * 1024 * 1024) return NextResponse.json({ error: `That file is larger than ${max} MB.` }, { status: 413 });

  const id = uuidv4();
  const dir = assetsDir(auth.user.id);
  const filePath = path.join(dir, id + ext);
  fs.writeFileSync(filePath, Buffer.from(await file.arrayBuffer()));
  try {
    const info = await new FFmpegMediaRepository().probe(filePath);
    if (!info.width || !info.height) throw new Error("no picture");
    const meta: AssetMeta = { id, type, ext, ar: info.width / info.height, hasAudio: type === "video" && info.hasAudio, durationSec: info.durationSec, name: file.name };
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(meta));
    return NextResponse.json({ asset: id, type, ar: meta.ar, hasAudio: meta.hasAudio, name: file.name }, { status: 201 });
  } catch {
    fs.rmSync(filePath, { force: true });
    return NextResponse.json({ error: "That file can’t be read." }, { status: 400 });
  }
}
