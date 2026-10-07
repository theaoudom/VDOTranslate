export interface MediaInfo {
  durationSec: number;
  width: number;
  height: number;
}

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

export interface RenderOptions {
  /** Only keep the first N seconds of the video. */
  trimSec?: number | null;
  /** Blur the band where burned-in subtitles usually sit. */
  blurSubtitles?: boolean;
  /** Burn these translated subtitles into the picture. */
  subtitles?: SubtitleCue[];
  /** Language of the subtitles (picks a font that covers its script). */
  language?: string;
}

/** Audio/video work done with ffmpeg. */
export interface IMediaRepository {
  probe(filePath: string): Promise<MediaInfo>;
  extractAudio(videoPath: string, outputPath: string, trimSec?: number | null): Promise<void>;
  /** Lay the new voices over the original music and sounds. */
  mixVoiceOverBackground(voicesPath: string, backgroundPath: string, outputPath: string): Promise<void>;
  /** Final video: original picture (+ blur, + subtitles) with the new audio track. */
  render(videoPath: string, audioPath: string, outputPath: string, options?: RenderOptions): Promise<void>;
}
