import type { FrameRatio, TemplateLayer } from "@/domain/entities/Template";

export interface MediaInfo {
  durationSec: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

export interface RenderOptions {
  /** Start this many seconds into the video (cutting out one part). */
  startSec?: number;
  /** Only keep the first N seconds of the video (after `startSec`). */
  trimSec?: number | null;
  /** Blur the band where burned-in subtitles usually sit. */
  blurSubtitles?: boolean;
  /** Burn these translated subtitles into the picture. */
  subtitles?: SubtitleCue[];
  /** Language of the subtitles (picks a font that covers its script). */
  language?: string;
  /** Brand template: frame crop plus image / video / text layers. */
  template?: RenderTemplate;
}

/** A template ready to render: asset layers carry their local file. */
export interface RenderTemplate {
  /** "source" keeps the video's own frame (only layers are added) */
  ratio: FrameRatio | "source";
  pan: number;
  layers: (TemplateLayer & { file?: string; hasAudio?: boolean })[];
}

/** Audio/video work done with ffmpeg. */
export interface IMediaRepository {
  probe(filePath: string): Promise<MediaInfo>;
  extractAudio(videoPath: string, outputPath: string, trimSec?: number | null): Promise<void>;
  /** Lay the new voices over the original music and sounds. */
  mixVoiceOverBackground(voicesPath: string, backgroundPath: string, outputPath: string): Promise<void>;
  /** Final video: original picture (+ blur, + subtitles) with the new audio track. */
  render(videoPath: string, audioPath: string, outputPath: string, options?: RenderOptions): Promise<void>;
  /** Quiet stretches in the sound track (for cutting between words). */
  findPauses(videoPath: string): Promise<{ start: number; end: number }[]>;
  /** A part of the video in its own frame (quick encode, exact cut points). */
  cut(videoPath: string, from: number, to: number, outputPath: string): Promise<void>;
}
