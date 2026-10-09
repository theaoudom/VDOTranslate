import { NextResponse, type NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { start } from "workflow/api";
import { sanitizeSplit } from "@/domain/split/Split";
import { buildContainer } from "@/lib/container";
import { requireUser } from "@/lib/session";
import { loadJobTemplate } from "@/lib/templateAssets";
import { jobKey, readUpload } from "@/lib/uploads";
import { splitVideo } from "@/workflows/jobs";

/**
 * Cut a video into parts. The source is a finished video ({ sourceJobId }) or a fresh
 * upload ({ uploadId }); `settings` are the Auto-split options, `templateId` is optional.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => ({}));
  const c = buildContainer();

  let sourceVideo = "", name = "", durationSec = 0;
  if (body?.sourceJobId) {
    const src = await c.jobs.findById(String(body.sourceJobId)).catch(() => null);
    if (!src || src.userId !== auth.user.id || !src.files.video || !(await c.store.exists(src.files.video))) return NextResponse.json({ error: "That video isn’t available." }, { status: 404 });
    sourceVideo = src.files.video;
    name = src.name;
    durationSec = src.trimSec ?? src.durationSec;
  } else if (body?.uploadId) {
    const up = await readUpload(auth.user.id, String(body.uploadId));
    if (!up) return NextResponse.json({ error: "Upload not found. Please upload the video again." }, { status: 404 });
    sourceVideo = up.video;
    name = up.name;
    durationSec = up.durationSec;
  } else {
    return NextResponse.json({ error: "Choose a video to split." }, { status: 400 });
  }
  if (durationSec < 4) return NextResponse.json({ error: "That video is too short to split." }, { status: 400 });

  const id = uuidv4();
  const template = body?.templateId ? await loadJobTemplate(auth.user.id, body.templateId) : null;
  const result = await c.splitVideo.start({
    userId: auth.user.id, jobId: id, name, sourceVideo, dir: jobKey(auth.user.id, id), durationSec,
    settings: sanitizeSplit(body?.settings), template,
  });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 402 });
  try {
    await start(splitVideo, [id]);
  } catch (err) {
    console.error(`[split] couldn't start ${id}`, err);
    await c.splitVideo.fail(id);
    return NextResponse.json({ error: "We couldn’t start the split. Your credits were returned. Please try again." }, { status: 503 });
  }
  return NextResponse.json({ jobId: id, held: result.job.held }, { status: 201 });
}
