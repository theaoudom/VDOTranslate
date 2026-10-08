import { FatalError } from "workflow";
import { buildContainer } from "@/lib/container";
import { UserFacingError } from "@/domain/use-cases/ProcessTranslationJob";

/*
 * Background jobs as durable workflows: each step can run on a different machine,
 * is retried if it fails, and the run picks up where it stopped after a restart.
 * Files move between steps through storage (see IFileStore).
 */

const USER_ERROR = "user:";
/** Lines voiced per step, so each step stays well inside a function's time limit. */
const VOICE_BATCH = 40;

/** Runs a stage; a problem the user should hear about is not retried. */
async function stage<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof UserFacingError) throw new FatalError(USER_ERROR + e.message);
    throw e;
  }
}

async function extract(jobId: string) {
  "use step";
  return stage(() => buildContainer().processJob.extract(jobId));
}
async function separate(jobId: string) {
  "use step";
  return stage(() => buildContainer().processJob.separate(jobId));
}
async function transcribeAndTranslate(jobId: string) {
  "use step";
  return stage(() => buildContainer().processJob.transcribeAndTranslate(jobId));
}
async function synthesize(jobId: string, from: number, to: number) {
  "use step";
  return stage(() => buildContainer().processJob.synthesize(jobId, from, to));
}
async function render(jobId: string) {
  "use step";
  return stage(() => buildContainer().processJob.render(jobId));
}
async function finish(jobId: string) {
  "use step";
  return buildContainer().processJob.finish(jobId);
}
async function fail(jobId: string, message: string | null) {
  "use step";
  return buildContainer().processJob.fail(jobId, message);
}

/** Translate and dub one video, then settle its credits. */
export async function translateVideo(jobId: string) {
  "use workflow";
  try {
    const { keepBackground } = await extract(jobId);
    if (keepBackground) await separate(jobId);
    const lines = await transcribeAndTranslate(jobId);
    for (let from = 0; from < lines; from += VOICE_BATCH) await synthesize(jobId, from, Math.min(lines, from + VOICE_BATCH));
    await render(jobId);
    await finish(jobId);
  } catch (e) {
    const message = e instanceof Error && e.message.startsWith(USER_ERROR) ? e.message.slice(USER_ERROR.length) : null;
    await fail(jobId, message);
  }
}

async function revoice(jobId: string, index: number, text: string) {
  "use step";
  return buildContainer().revoiceLine.run(jobId, index, text);
}

/** Re-voice one corrected line and render the video again. */
export async function revoiceLine(jobId: string, index: number, text: string) {
  "use workflow";
  await revoice(jobId, index, text);
}

async function exportStep(jobId: string) {
  "use step";
  return buildContainer().exportWithTemplate.run(jobId);
}

/** Apply a template to a video. */
export async function exportVideo(jobId: string) {
  "use workflow";
  await exportStep(jobId);
}
