export interface SeparatedAudio {
  vocalsPath: string;
  backgroundPath: string;
}

/** Splits an audio track into the voices and everything else (music, ambience, effects). */
export interface IAudioSeparator {
  readonly available: boolean;
  separate(audioPath: string, outDir: string): Promise<SeparatedAudio>;
}
