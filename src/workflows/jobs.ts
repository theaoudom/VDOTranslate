import { FatalError, sleep } from "workflow";
import { buildMovies } from "@/lib/movies";
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

/** Parts made per step: plain cuts are quicker than reframed / labelled parts. */
const PARTS_PER_STEP = { copy: 6, encode: 3 };

async function planSplit(jobId: string) {
  "use step";
  return buildContainer().splitVideo.plan(jobId);
}
async function makeParts(jobId: string, from: number, to: number) {
  "use step";
  return buildContainer().splitVideo.makeParts(jobId, from, to);
}
async function finishSplit(jobId: string) {
  "use step";
  return buildContainer().splitVideo.finish(jobId);
}
async function failSplit(jobId: string) {
  "use step";
  return buildContainer().splitVideo.fail(jobId);
}

/** Cut a video into parts for social media, then charge its fixed price. */
export async function splitVideo(jobId: string) {
  "use workflow";
  try {
    const { parts, encode } = await planSplit(jobId);
    const batch = encode ? PARTS_PER_STEP.encode : PARTS_PER_STEP.copy;
    for (let from = 0; from < parts; from += batch) await makeParts(jobId, from, Math.min(parts, from + batch));
    await finishSplit(jobId);
  } catch {
    await failSplit(jobId);
  }
}

/** Apply a template to a video. */
export async function exportVideo(jobId: string) {
  "use workflow";
  await exportStep(jobId);
}

/* ── AI movies ── */

async function movieFrame(id: string, shotId: string) {
  "use step";
  return buildMovies().makeFrame(id, shotId);
}
async function movieStartShot(id: string, shotId: string) {
  "use step";
  return buildMovies().startShot(id, shotId);
}
async function movieCheckShot(id: string, shotId: string) {
  "use step";
  return buildMovies().checkShot(id, shotId);
}
async function movieShotTimeout(id: string, shotId: string) {
  "use step";
  return buildMovies().shotTimedOut(id, shotId);
}
async function movieJoin(id: string) {
  "use step";
  return buildMovies().join(id);
}
async function movieFinish(id: string) {
  "use step";
  return buildMovies().finish(id);
}
async function movieFail(id: string) {
  "use step";
  return buildMovies().failMovie(id, "Making the movie didn’t work. All held credits were returned.");
}
async function movieFinishRemake(id: string, shotId: string) {
  "use step";
  return buildMovies().finishRemake(id, shotId);
}

async function movieFallback(id: string, shotId: string) {
  "use step";
  return buildMovies().fallbackShot(id, shotId);
}

/** One try at a shot: first frame, then the video model; waits between checks without holding a function. */
async function tryShot(id: string, shotId: string): Promise<"done" | "blocked" | "failed"> {
  if (!(await movieFrame(id, shotId))) return "blocked";
  if (!(await movieStartShot(id, shotId))) return "blocked";
  for (let i = 0; i < 90; i++) { // up to ~15 minutes
    await sleep("10s");
    const r = await movieCheckShot(id, shotId);
    if (r !== "running") return r;
  }
  await movieShotTimeout(id, shotId);
  return "failed";
}

/**
 * One shot. With `fallback`, a shot the safety filter refused gets one more try on the
 * fallback model. Remakes don't, as their held credits are settled at the shot's model.
 */
async function makeShot(id: string, shotId: string, fallback = false) {
  if ((await tryShot(id, shotId)) === "blocked" && fallback && (await movieFallback(id, shotId))) await tryShot(id, shotId);
}

/** Make every shot of a movie (two at a time), join them, then charge what was made. */
export async function makeMovie(id: string, shotIds: string[]) {
  "use workflow";
  try {
    for (let i = 0; i < shotIds.length; i += 2) await Promise.all(shotIds.slice(i, i + 2).map((s) => makeShot(id, s, true)));
    await movieJoin(id);
    await movieFinish(id);
  } catch {
    await movieFail(id);
  }
}

/** Make one shot of a finished movie again. */
export async function remakeMovieShot(id: string, shotId: string) {
  "use workflow";
  try {
    await makeShot(id, shotId);
  } finally {
    await movieFinishRemake(id, shotId);
  }
}
