import * as path from "path";
import { actualDubCost, estimateDub } from "@/domain/billing/estimate";
import type { JobFiles, SpeakerInfo, TranscriptLine, TranslationJob } from "@/domain/entities/TranslationJob";
import type { IAIRepository, TranscriptionSegment } from "@/domain/repositories/IAIRepository";
import type { IAudioSeparator } from "@/domain/repositories/IAudioSeparator";
import type { ICreditRepository } from "@/domain/repositories/ICreditRepository";
import type { IFileStore } from "@/domain/repositories/IFileStore";
import type { IMediaRepository, RenderTemplate } from "@/domain/repositories/IMediaRepository";
import type { ITranslationJobRepository } from "@/domain/repositories/ITranslationJobRepository";

export const GENERIC_FAILURE = "Something went wrong while processing. All held credits were returned.";

/**
 * Translating one video, as separate stages. Each stage loads the job, works on local
 * copies of its files and stores what it made, so stages can run on different machines
 * and be retried. The workflow in src/workflows/translate.ts runs them in order.
 */
export class ProcessTranslationJobUseCase {
  constructor(
    private readonly jobs: ITranslationJobRepository,
    private readonly credits: ICreditRepository,
    private readonly media: IMediaRepository,
    private readonly ai: IAIRepository,
    private readonly separator: IAudioSeparator,
    private readonly store: IFileStore,
  ) {}

  private async load(jobId: string) {
    const job = await this.jobs.findById(jobId);
    if (!job) throw new UserFacingError("This video was removed.");
    return job;
  }

  /** Storage key and local working path for a new file of the job. */
  private out(job: TranslationJob, name: string) {
    const dir = job.files.dir!;
    return { key: `${dir}/${name}`, local: path.join(this.store.workDir(dir), name) };
  }

  /** 1. The audio of the part being translated. */
  async extract(jobId: string): Promise<{ keepBackground: boolean }> {
    const job = await this.load(jobId);
    await this.jobs.updateStatus(jobId, "extracting", 6);
    const audio = this.out(job, "audio.mp3");
    await this.media.extractAudio(await this.store.fetch(job.files.original!), audio.local, job.trimSec);
    await this.store.save(audio.key, audio.local);
    await this.jobs.update(jobId, { files: { ...job.files, audio: audio.key } });
    return { keepBackground: job.keepBackground };
  }

  /** 2. Split voices from music and sounds. */
  async separate(jobId: string) {
    const job = await this.load(jobId);
    await this.jobs.updateStatus(jobId, "separating", 14);
    const sep = await this.separator.separate(await this.store.fetch(job.files.audio!), this.store.workDir(job.files.dir!));
    const vocals = this.out(job, "vocals.mp3"), background = this.out(job, "background.mp3");
    await Promise.all([this.store.save(vocals.key, sep.vocalsPath), this.store.save(background.key, sep.backgroundPath)]);
    await this.jobs.update(jobId, { files: { ...job.files, vocals: vocals.key, background: background.key } });
  }

  /** 3–4. Transcribe, find speakers, translate. Returns how many lines there are to voice. */
  async transcribeAndTranslate(jobId: string): Promise<number> {
    const job = await this.load(jobId);
    await this.jobs.updateStatus(jobId, "transcribing", 28);
    // cleaner speech (no music) → better transcription and cloning
    const transcript = await this.ai.transcribe(await this.store.fetch(job.files.vocals ?? job.files.audio!));
    const segments = collapseRepeats(transcript.segments);
    if (!segments.length) throw new UserFacingError("We couldn’t find any speech in the audio track.");
    await this.jobs.update(jobId, { sourceLanguage: transcript.language });

    await this.jobs.updateStatus(jobId, "translating", 45);
    const translated = await this.ai.translate(segments, job.targetLanguage);
    const lines = toLines(segments, translated);
    await this.jobs.update(jobId, { lines, files: { ...job.files, segments: [] } });
    return lines.length;
  }

  /** 5. Voice lines from..to-1. */
  async synthesize(jobId: string, from: number, to: number) {
    const job = await this.load(jobId);
    const total = job.lines!.length;
    await this.jobs.updateStatus(jobId, "synthesizing", Math.round(60 + (25 * from) / Math.max(1, total)));
    const sourceAudio = job.voice === "cloned" ? await this.store.fetch(job.files.vocals ?? job.files.audio!) : null;
    const made = await this.ai.synthesizeSegments(toSegments(job.lines!), job.targetLanguage, this.store.workDir(job.files.dir!), {
      voice: job.voice, sourceAudioPath: sourceAudio, range: [from, to],
    });
    const segments = Array.from({ length: total }, (_, i) => job.files.segments?.[i] ?? "");
    await Promise.all(made.map(async (file, i) => {
      if (!file) return;
      const key = `${job.files.dir}/${path.basename(file)}`;
      await this.store.save(key, file);
      segments[i] = key;
    }));
    await this.jobs.update(jobId, { files: { ...job.files, segments } });
  }

  /** 6. Mix and render the final video. */
  async render(jobId: string) {
    const job = await this.load(jobId);
    await this.jobs.updateStatus(jobId, "merging", 85);
    if (!job.files.segments?.some(Boolean)) throw new Error("No audio segments synthesized.");
    const files = await this.renderVideo(job, job.lines!);
    await this.jobs.update(jobId, { files });
  }

  /** 7. Charge what was used, give back the rest, and show the result. */
  async finish(jobId: string) {
    const job = await this.load(jobId);
    if (job.status === "completed" || job.status === "failed") return; // already settled
    const lines = job.lines!;
    const used = this.finalCost(job, lines);
    await this.credits.settle(job.userId, job.held, used, job.name);
    await this.jobs.update(jobId, { status: "completed", progress: 100, used, speakers: speakerShares(lines), error: null });
  }

  /** Something failed for good: give every held credit back. */
  async fail(jobId: string, message: string | null) {
    const job = await this.jobs.findById(jobId);
    if (!job || job.status === "completed" || job.status === "failed") return;
    await this.credits.settle(job.userId, job.held, 0, job.name);
    await this.jobs.update(jobId, { status: "failed", error: message ?? GENERIC_FAILURE });
  }

  /**
   * Stitches the voiced lines, lays them over the background, and renders the final video.
   * Returns the job's files with the new ones (the caller saves them).
   */
  async renderVideo(job: TranslationJob, lines: TranscriptLine[]): Promise<JobFiles> {
    const files = { ...job.files };
    const segs = toSegments(lines);
    const segmentFiles = await Promise.all((files.segments ?? []).map((k) => (k ? this.store.fetch(k).catch(() => "") : "")));

    const voices = this.out(job, "voices.mp3");
    await this.ai.stitch(segs, segmentFiles, voices.local);
    await this.store.save(voices.key, voices.local);
    files.voices = voices.key;
    let finalAudio = voices.local;
    delete files.mixed;
    if (files.background) {
      const mixed = this.out(job, "mixed.mp3");
      await this.media.mixVoiceOverBackground(voices.local, await this.store.fetch(files.background), mixed.local);
      await this.store.save(mixed.key, mixed.local);
      files.mixed = mixed.key;
      finalAudio = mixed.local;
    }
    // New name each render: the previous file may still be streaming to the browser.
    const previous = files.video;
    const video = this.out(job, `translated-${Date.now()}.mp4`);
    await this.media.render(await this.store.fetch(files.original!), finalAudio, video.local, {
      trimSec: job.trimSec,
      blurSubtitles: job.blurSubtitles,
      subtitles: job.burnSubtitles ? lines.map((l) => ({ start: l.start, end: l.end, text: l.text })) : undefined,
      language: job.targetLanguage,
      template: job.template ? await localTemplate(this.store, job.template) : undefined,
    });
    await this.store.save(video.key, video.local);
    files.video = video.key;
    if (previous && previous !== files.video) setTimeout(() => this.store.deletePrefix(previous).catch(() => {}), 60_000);
    return files;
  }

  private finalCost(job: TranslationJob, lines: TranscriptLine[]) {
    const opts = { voice: job.voice, keepBackground: job.keepBackground, burnSubtitles: job.burnSubtitles, blurSubtitles: job.blurSubtitles };
    const speechSec = lines.reduce((a, l) => a + Math.max(0, l.end - l.start), 0);
    const heldSubtotal = estimateDub(job.durationSec, opts, "studio").subtotal; // plan doesn't change the subtotal
    return Math.min(actualDubCost(job.durationSec, speechSec, opts, heldSubtotal), job.held);
  }
}

/** The template with local copies of its images and clips, for ffmpeg. */
export async function localTemplate(store: IFileStore, t: RenderTemplate): Promise<RenderTemplate> {
  return {
    ...t,
    layers: await Promise.all(t.layers.map(async (L) => (L.file ? { ...L, file: await store.fetch(L.file).catch(() => undefined) } : L))),
  };
}

/** An error whose message is safe and useful to show to the user. */
export class UserFacingError extends Error {}

/**
 * Speech recognition sometimes repeats the last phrase over and over in short chunks
 * (music, noise or silence). Merge consecutive identical lines from the same speaker
 * that follow each other within a second; real repeats with a pause are kept.
 */
export function collapseRepeats(segments: TranscriptionSegment[]): TranscriptionSegment[] {
  const norm = (t: string) => t.replace(/[\s.,!?;:'"“”‘’。，！？；：、…~·()（）\-—]+/g, "").toLowerCase();
  const out: TranscriptionSegment[] = [];
  for (const seg of segments) {
    const prev = out[out.length - 1];
    if (prev && prev.speaker === seg.speaker && norm(prev.text) === norm(seg.text) && norm(seg.text) && seg.start - prev.end < 1) {
      prev.end = Math.max(prev.end, seg.end);
      continue;
    }
    out.push({ ...seg });
  }
  return out;
}

export function toLines(original: TranscriptionSegment[], translated: TranscriptionSegment[]): TranscriptLine[] {
  return translated.map((t, i) => ({
    start: t.start, end: t.end, speaker: t.speaker,
    gender: (t.gender ?? original[i]?.gender ?? "unknown") as TranscriptLine["gender"],
    original: original[i]?.text ?? "", text: t.text,
  }));
}

export function toSegments(lines: TranscriptLine[]): TranscriptionSegment[] {
  return lines.map((l) => ({ start: l.start, end: l.end, speaker: l.speaker, gender: l.gender, text: l.text }));
}

function speakerShares(lines: TranscriptLine[]): SpeakerInfo[] {
  const time = new Map<string, { t: number; gender: TranscriptLine["gender"] }>();
  let total = 0;
  for (const l of lines) {
    const d = Math.max(0, l.end - l.start);
    total += d;
    const s = time.get(l.speaker) ?? { t: 0, gender: l.gender };
    s.t += d;
    time.set(l.speaker, s);
  }
  return Array.from(time.entries())
    .map(([id, s]) => ({ id, gender: s.gender, share: total ? s.t / total : 0 }))
    .sort((a, b) => b.share - a.share);
}
