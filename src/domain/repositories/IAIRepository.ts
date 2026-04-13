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

export interface IAIRepository {
  transcribe(audioPath: string): Promise<TranscriptionResult>;
  translate(segments: TranscriptionSegment[], targetLanguage: string): Promise<TranscriptionSegment[]>;
  synthesize(segments: TranscriptionSegment[], language: string, outputPath: string): Promise<void>;
}
