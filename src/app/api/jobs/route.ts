import { NextResponse, type NextRequest } from "next/server";
import type { VoiceKind } from "@/domain/billing/pricing";
import { toPublicJob } from "@/domain/entities/TranslationJob";
import { SUPPORTED_LANGUAGES } from "@/domain/entities/Language";
import { start } from "workflow/api";
import { buildContainer } from "@/lib/container";
import { requireUser } from "@/lib/session";
import { loadJobTemplate } from "@/lib/templateAssets";
import { readUpload } from "@/lib/uploads";
import { translateVideo } from "@/workflows/jobs";

const VOICES: VoiceKind[] = ["cloned", "natural", "standard"];

/** The signed-in user's videos, newest first. */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const jobs = await buildContainer().jobs.listForUser(auth.user.id);
  return NextResponse.json(jobs.map(toPublicJob));
}

/** Starts a translation for an uploaded video: checks everything, holds the credits, then processes in the background. */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const uploadId = String(body?.uploadId ?? "");
  const target = String(body?.targetLanguage ?? "");
  const source = body?.sourceLanguage && body.sourceLanguage !== "auto" ? String(body.sourceLanguage) : null;
  const voice = String(body?.voice ?? "") as VoiceKind;
  if (!SUPPORTED_LANGUAGES.some((l) => l.code === target)) return NextResponse.json({ error: "Choose a language to translate to." }, { status: 400 });
  if (!VOICES.includes(voice)) return NextResponse.json({ error: "Choose a voice." }, { status: 400 });

  const meta = await readUpload(auth.user.id, uploadId);
  if (!meta) return NextResponse.json({ error: "Upload not found. Please upload the video again." }, { status: 404 });

  const c = buildContainer();
  const result = await c.startTranslation.execute({
    userId: auth.user.id, jobId: uploadId, name: meta.name, videoPath: meta.video, jobDir: meta.key,
    durationSec: meta.durationSec, targetLanguage: target, sourceLanguage: source, voice,
    keepBackground: Boolean(body?.keepBackground), burnSubtitles: Boolean(body?.burnSubtitles), blurSubtitles: Boolean(body?.blurSubtitles),
    trimSec: typeof body?.trimSec === "number" && body.trimSec > 0 ? body.trimSec : null,
    template: await loadJobTemplate(auth.user.id, body?.templateId),
  });
  if (!result.ok) return NextResponse.json({ error: result.message, code: result.code }, { status: result.code === "not_enough_credits" ? 402 : 400 });

  // Runs in the background: the browser follows progress on the processing page.
  try {
    await start(translateVideo, [result.job.id]);
  } catch (err) {
    console.error(`[ProcessJob] couldn't start ${result.job.id}`, err);
    await c.processJob.fail(result.job.id, "We couldn’t start processing. All held credits were returned. Please try again.");
    return NextResponse.json({ error: "We couldn’t start processing. Your credits were returned. Please try again." }, { status: 503 });
  }
  return NextResponse.json({ jobId: result.job.id, held: result.job.held }, { status: 201 });
}
