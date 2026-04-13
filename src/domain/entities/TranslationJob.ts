export type TranslationJobStatus =
  | "pending"
  | "extracting"
  | "transcribing"
  | "translating"
  | "synthesizing"
  | "merging"
  | "completed"
  | "failed";

export interface TranslationJob {
  id: string;
  status: TranslationJobStatus;
  progress: number; // 0–100
  sourceLanguage: string | null; // detected language code, e.g. "zh"
  targetLanguage: string; // requested target language code, e.g. "km"
  originalVideoPath: string;
  extractedAudioPath: string | null;
  translatedAudioPath: string | null;
  translatedVideoPath: string | null;
  transcript: string | null;
  translatedText: string | null;
  error: string | null;
  blurSubtitles: boolean;
  createdAt: Date;
  updatedAt: Date;
}
