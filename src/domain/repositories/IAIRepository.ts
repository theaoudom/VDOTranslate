import type { VoiceKind } from "@/domain/billing/pricing";

export interface TranscriptionSegment {
  text: string;
  start: number;
  end: number;
  speaker: string;
  gender?: "male" | "female" | "unknown";
}

export interface TranscriptionResult {
  text: string;
  language: string; // detected language code
  segments: TranscriptionSegment[];
}

export interface SynthesizeOptions {
  /** standard = OpenAI/Google voices, natural = ElevenLabs preset voices, cloned = each speaker's own voice */
  voice: VoiceKind;
  /** Original speech audio, used to cut per-speaker samples for cloning */
  sourceAudioPath?: string | null;
  /** Only voice this segment (re-voicing one corrected line) */
  onlyIndex?: number;
  /** Only voice segments from..to-1 (long videos are voiced in batches) */
  range?: [number, number];
}

export type VoiceAvailability = Record<VoiceKind, boolean>;

export interface IAIRepository {
  transcribe(audioPath: string): Promise<TranscriptionResult>;
  translate(segments: TranscriptionSegment[], targetLanguage: string): Promise<TranscriptionSegment[]>;
  synthesizeSegments(segments: TranscriptionSegment[], language: string, outDir: string, options: SynthesizeOptions): Promise<string[]>;
  stitch(segments: TranscriptionSegment[], files: string[], outputPath: string): Promise<void>;
  /** Which voices can speak this target language (all voices when no language given). */
  voiceAvailability(language?: string): VoiceAvailability;
  /** Target languages the natural and own voices support. */
  voiceLanguages(): { natural: string[]; cloned: string[] };
}
