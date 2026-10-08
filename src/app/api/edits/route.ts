import { NextResponse, type NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { start } from "workflow/api";
import { buildContainer } from "@/lib/container";
import { requireUser } from "@/lib/session";
import { loadJobTemplate } from "@/lib/templateAssets";
import { jobKey, readUpload } from "@/lib/uploads";
import { exportVideo } from "@/workflows/jobs";

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

  let sourceVideo = "", name = "", durationSec = 0;
  if (body?.sourceJobId) {
    const src = await c.jobs.findById(String(body.sourceJobId)).catch(() => null);
    if (!src || src.userId !== auth.user.id || !src.files.video || !(await c.store.exists(src.files.video))) return NextResponse.json({ error: "That video isn’t available." }, { status: 404 });
    sourceVideo = src.files.video;
    name = src.name;
    durationSec = src.trimSec ?? src.durationSec;
  } else if (body?.uploadId) {
    const up = await readUpload(auth.user.id, String(body.uploadId));
    if (!up) return NextResponse.json({ error: "Upload not found." }, { status: 404 });
    sourceVideo = up.video;
    name = up.name;
    durationSec = up.durationSec;
  } else {
    return NextResponse.json({ error: "Choose a video to export." }, { status: 400 });
  }

  const id = uuidv4();
  const result = await c.exportWithTemplate.start({ userId: auth.user.id, jobId: id, name, sourceVideo, dir: jobKey(auth.user.id, id), durationSec, template });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 402 });
  await start(exportVideo, [id]);
  return NextResponse.json({ jobId: result.job.id, held: result.job.held }, { status: 201 });
}
