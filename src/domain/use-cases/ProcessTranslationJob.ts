import * as fs from "fs";
import * as path from "path";
import { actualDubCost, estimateDub } from "@/domain/billing/estimate";
import type { SpeakerInfo, TranscriptLine, TranslationJob } from "@/domain/entities/TranslationJob";
import type { IAIRepository, TranscriptionSegment } from "@/domain/repositories/IAIRepository";
import type { IAudioSeparator } from "@/domain/repositories/IAudioSeparator";
import type { ICreditRepository } from "@/domain/repositories/ICreditRepository";
import type { IMediaRepository } from "@/domain/repositories/IMediaRepository";
import type { ITranslationJobRepository } from "@/domain/repositories/ITranslationJobRepository";

export class ProcessTranslationJobUseCase {
  constructor(
    private readonly jobs: ITranslationJobRepository,
    private readonly credits: ICreditRepository,
    private readonly media: IMediaRepository,
    private readonly ai: IAIRepository,
    private readonly separator: IAudioSeparator,
  ) {}

  async execute(jobId: string): Promise<void> {
    const job = await this.jobs.findById(jobId);
    if (!job) throw new Error(`Job ${jobId} not found`);
    const dir = job.files.dir!;
    const files = { ...job.files };

    try {
      // 1. Audio (only the part being translated)
      await this.jobs.updateStatus(jobId, "extracting", 6);
      files.audio = path.join(dir, "audio.mp3");
      await this.media.extractAudio(files.original!, files.audio, job.trimSec);

      // 2. Split voices from music and sounds
      let speechAudio = files.audio;
      if (job.keepBackground) {
        await this.jobs.updateStatus(jobId, "separating", 14);
        const sep = await this.separator.separate(files.audio, dir);
        files.vocals = sep.vocalsPath;
        files.background = sep.backgroundPath;
        speechAudio = sep.vocalsPath; // cleaner speech → better transcription and cloning
      }

      // 3. Transcribe + find speakers
      await this.jobs.updateStatus(jobId, "transcribing", 28);
      const transcript = await this.ai.transcribe(speechAudio);
      const language = transcript.language;
      const segments = collapseRepeats(transcript.segments);
      if (!segments.length) throw new UserFacingError("We couldn’t find any speech in the audio track.");
      await this.jobs.update(jobId, { sourceLanguage: language, files });

      // 4. Translate
      await this.jobs.updateStatus(jobId, "translating", 45);
      const translated = await this.ai.translate(segments, job.targetLanguage);

      // 5. Voices
      await this.jobs.updateStatus(jobId, "synthesizing", 60);
      files.segments = await this.ai.synthesizeSegments(translated, job.targetLanguage, dir, { voice: job.voice, sourceAudioPath: speechAudio });

      // 6. Mix + render
      await this.jobs.updateStatus(jobId, "merging", 85);
      const lines = toLines(segments, translated);
      await this.renderVideo(job, files, lines, translated);

      const used = this.finalCost(job, lines);
      await this.credits.settle(job.userId, job.held, used, job.name);
      await this.jobs.update(jobId, { status: "completed", progress: 100, used, lines, speakers: speakerShares(lines), files, error: null });
    } catch (err) {
      const message = err instanceof UserFacingError ? err.message : "Something went wrong while processing. All held credits were returned.";
      console.error(`[ProcessJob ${jobId}]`, err);
      await this.credits.settle(job.userId, job.held, 0, job.name).catch((e) => console.error("[ProcessJob] refund failed", e));
      await this.jobs.update(jobId, { status: "failed", error: message, files }).catch(() => {});
    }
  }

  /** Stitches the voiced lines, lays them over the background, and renders the final video. */
  async renderVideo(job: TranslationJob, files: TranslationJob["files"], lines: TranscriptLine[], segments: TranscriptionSegment[]) {
    const dir = files.dir!;
    files.voices = path.join(dir, "voices.mp3");
    await this.ai.stitch(segments, files.segments ?? [], files.voices);
    let finalAudio = files.voices;
    if (files.background) {
      files.mixed = path.join(dir, "mixed.mp3");
      await this.media.mixVoiceOverBackground(files.voices, files.background, files.mixed);
      finalAudio = files.mixed;
    }
    // New name each render: the previous file may still be streaming to the browser.
    const previous = files.video;
    files.video = path.join(dir, `translated-${Date.now()}.mp4`);
    await this.media.render(files.original!, finalAudio, files.video, {
      trimSec: job.trimSec,
      blurSubtitles: job.blurSubtitles,
      subtitles: job.burnSubtitles ? lines.map((l) => ({ start: l.start, end: l.end, text: l.text })) : undefined,
      language: job.targetLanguage,
    });
    if (previous && previous !== files.video) setTimeout(() => fs.rm(previous, { force: true }, () => {}), 60_000);
  }

  private finalCost(job: TranslationJob, lines: TranscriptLine[]) {
    const opts = { voice: job.voice, keepBackground: job.keepBackground, burnSubtitles: job.burnSubtitles, blurSubtitles: job.blurSubtitles };
    const speechSec = lines.reduce((a, l) => a + Math.max(0, l.end - l.start), 0);
    const heldSubtotal = estimateDub(job.durationSec, opts, "studio").subtotal; // plan doesn't change the subtotal
    return Math.min(actualDubCost(job.durationSec, speechSec, opts, heldSubtotal), job.held);
  }
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
