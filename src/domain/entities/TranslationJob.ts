import type { VoiceKind } from "@/domain/billing/pricing";
import type { RenderTemplate } from "@/domain/repositories/IMediaRepository";

export type TranslationJobStatus =
  | "pending"
  | "extracting"
  | "separating"
  | "transcribing"
  | "translating"
  | "synthesizing"
  | "merging"
  | "completed"
  | "failed";

/** One translated line, kept so people can review, fix and re-voice it. */
export interface TranscriptLine {
  start: number;
  end: number;
  speaker: string;
  gender: "male" | "female" | "unknown";
  original: string;
  text: string;
}

export interface SpeakerInfo {
  id: string;
  gender: "male" | "female" | "unknown";
  /** share of total speaking time, 0–1 */
  share: number;
}

/** Local files for a job (server only, never sent to the browser). */
export interface JobFiles {
  dir?: string;
  original?: string;
  audio?: string;
  vocals?: string;
  background?: string;
  segments?: string[];
  voices?: string;
  mixed?: string;
  video?: string;
}

export type JobKind = "dub" | "edit" | "split";

/** The template used for a job, copied when it started (with local asset files). */
export type JobTemplate = RenderTemplate & { id: string; name: string };

export interface TranslationJob {
  id: string;
  userId: string;
  kind: JobKind;
  name: string;
  durationSec: number;
  status: TranslationJobStatus;
  progress: number; // 0–100
  sourceLanguage: string | null;
  targetLanguage: string;
  voice: VoiceKind;
  keepBackground: boolean;
  burnSubtitles: boolean;
  blurSubtitles: boolean;
  trimSec: number | null;
  /** credits held when the job started (estimate + buffer) */
  held: number;
  /** credits finally charged */
  used: number;
  lines: TranscriptLine[] | null;
  speakers: SpeakerInfo[] | null;
  error: string | null;
  template: JobTemplate | null;
  files: JobFiles;
  createdAt: Date;
  updatedAt: Date;
}

/** What the browser may see about a job. */
export type PublicJob = Omit<TranslationJob, "files" | "userId" | "template"> & {
  hasVideo: boolean;
  template: { name: string; ratio: JobTemplate["ratio"] } | null;
};

export function toPublicJob(job: TranslationJob): PublicJob {
  const { files, userId: _userId, template, ...rest } = job;
  return { ...rest, hasVideo: Boolean(files.video), template: template ? { name: template.name, ratio: template.ratio } : null };
}
