import fs from "fs";
import path from "path";
import { NextResponse, type NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { buildContainer, jobDir } from "@/lib/container";
import { requireUser } from "@/lib/session";

const MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
const ALLOWED = [".mp4", ".mov", ".webm", ".mkv", ".m4v", ".avi"];

/** Saves the video and returns its length, so the price can be shown before anything is charged. */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const form = await req.formData();
  const file = form.get("video");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a video file." }, { status: 400 });
  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED.includes(ext)) return NextResponse.json({ error: "Use an MP4, MOV or WEBM video." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That video is larger than 2 GB." }, { status: 413 });

  const id = uuidv4();
  const dir = jobDir(auth.user.id, id);
  fs.mkdirSync(dir, { recursive: true });
  const videoPath = path.join(dir, "original" + ext);
  fs.writeFileSync(videoPath, Buffer.from(await file.arrayBuffer()));

  try {
    const info = await buildContainer().media.probe(videoPath);
    fs.writeFileSync(path.join(dir, "upload.json"), JSON.stringify({ name: file.name, size: file.size, ext, ...info }));
    return NextResponse.json({ uploadId: id, name: file.name, size: file.size, durationSec: info.durationSec, width: info.width, height: info.height }, { status: 201 });
  } catch {
    fs.rmSync(dir, { recursive: true, force: true });
    return NextResponse.json({ error: "That file can’t be read as a video." }, { status: 400 });
  }
}
