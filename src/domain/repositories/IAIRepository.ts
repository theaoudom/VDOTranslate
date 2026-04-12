export interface TranscriptionResult {
  text: string;
  language: string; // detected language code
}

export interface IAIRepository {
  transcribe(audioPath: string): Promise<TranscriptionResult>;
  translate(text: string, targetLanguage: string): Promise<string>;
  synthesize(text: string, language: string, outputPath: string): Promise<void>;
}
