import fs from "fs";
import path from "path";
import { NextResponse, type NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { buildContainer, jobDir } from "@/lib/container";
import { requireUser } from "@/lib/session";
import { loadJobTemplate } from "@/lib/templateAssets";

/**
 * Export a video with a template. The source is either a finished video
 * ({ sourceJobId }) or a fresh upload ({ uploadId }).
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => ({}));
  const c = buildContainer();

  const template = await loadJobTemplate(auth.user.id, body?.templateId);
  if (!template) return NextResponse.json({ error: "Choose a template first." }, { status: 400 });

  let sourceVideo = "", name = "";
  if (body?.sourceJobId) {
    const src = await c.jobs.findById(String(body.sourceJobId)).catch(() => null);
    if (!src || src.userId !== auth.user.id || !src.files.video || !fs.existsSync(src.files.video)) return NextResponse.json({ error: "That video isn’t available." }, { status: 404 });
    sourceVideo = src.files.video;
    name = src.name;
  } else if (body?.uploadId) {
    let dir: string;
    try { dir = jobDir(auth.user.id, String(body.uploadId)); } catch { return NextResponse.json({ error: "Upload not found." }, { status: 404 }); }
    const metaPath = path.join(dir, "upload.json");
    if (!fs.existsSync(metaPath)) return NextResponse.json({ error: "Upload not found." }, { status: 404 });
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as { name: string; ext: string };
    sourceVideo = path.join(dir, "original" + meta.ext);
    name = meta.name;
  } else {
    return NextResponse.json({ error: "Choose a video to export." }, { status: 400 });
  }

  const info = await c.media.probe(sourceVideo);
  const id = uuidv4();
  const dir = jobDir(auth.user.id, id);
  fs.mkdirSync(dir, { recursive: true });
  const result = await c.exportWithTemplate.start({ userId: auth.user.id, jobId: id, name, sourceVideo, dir, durationSec: info.durationSec, template });
  if (!result.ok) {
    fs.rmSync(dir, { recursive: true, force: true });
    return NextResponse.json({ error: result.message }, { status: 402 });
  }
  return NextResponse.json({ jobId: result.job.id, held: result.job.held }, { status: 201 });
}
