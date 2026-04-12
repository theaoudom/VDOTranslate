import OpenAI from "openai";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import type { IAIRepository, TranscriptionResult } from "@/domain/repositories/IAIRepository";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Map BCP-47 target language code to an OpenAI TTS voice that best suits it.
// OpenAI TTS voices are multilingual; we pick one that sounds natural per region.
const TTS_VOICE_MAP: Record<string, "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"> = {
  en: "nova",
  zh: "echo",
  "zh-TW": "echo",
  ja: "shimmer",
  ko: "nova",
  fr: "fable",
  de: "onyx",
  es: "nova",
  pt: "nova",
  ar: "echo",
  hi: "shimmer",
  ru: "onyx",
  id: "nova",
  ms: "nova",
  tr: "echo",
  nl: "fable",
  pl: "onyx",
  it: "fable",
  uk: "onyx",
  fa: "echo",
  th: "shimmer",
  vi: "shimmer",
  km: "shimmer",
  lo: "shimmer",
  my: "shimmer",
  sw: "nova",
};

const DEFAULT_VOICE = "nova" as const;

export class OpenAIAIRepository implements IAIRepository {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async transcribe(audioPath: string): Promise<TranscriptionResult> {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const response = await this.client.audio.transcriptions.create({
          model: "whisper-1",
          file: fs.createReadStream(audioPath),
          response_format: "verbose_json",
        }, { timeout: 300000 }); // 5 minutes timeout for large files

        return {
          text: response.text,
          language: (response as { language?: string }).language ?? "en",
        };
      } catch (err: any) {
        attempt++;
        console.error(`Transcription attempt ${attempt} failed:`, err.message);
        if (attempt >= maxRetries) throw err;
        // Wait exponentially before retry
        await new Promise(r => setTimeout(r, attempt * 2000));
      }
    }
    throw new Error("Failed to transcribe after retries.");
  }

  async translate(text: string, targetLanguage: string): Promise<string> {
    // Map BCP-47 codes to full language names for clearer model instructions
    const LANGUAGE_NAMES: Record<string, string> = {
      en: "English",
      zh: "Simplified Chinese",
      "zh-TW": "Traditional Chinese",
      ja: "Japanese",
      ko: "Korean",
      fr: "French",
      de: "German",
      es: "Spanish",
      pt: "Portuguese",
      ar: "Arabic",
      hi: "Hindi",
      ru: "Russian",
      id: "Indonesian",
      ms: "Malay",
      tr: "Turkish",
      nl: "Dutch",
      pl: "Polish",
      it: "Italian",
      uk: "Ukrainian",
      fa: "Persian",
      th: "Thai",
      vi: "Vietnamese",
      km: "Khmer",
      lo: "Lao",
      my: "Burmese",
      sw: "Swahili",
    };

    // Languages that use complex Unicode combining-character scripts.
    // gpt-4o-mini does NOT reliably generate correct diacritics/subscripts for these —
    // use the full gpt-4o model to get proper Unicode sequences.
    const COMPLEX_SCRIPT_LANGUAGES = new Set(["km", "lo", "my", "th", "ar", "hi", "fa"]);
    const model = COMPLEX_SCRIPT_LANGUAGES.has(targetLanguage) ? "gpt-4o" : "gpt-4o-mini";

    const targetLanguageName = LANGUAGE_NAMES[targetLanguage] ?? targetLanguage;

    // Build language-specific few-shot hint to anchor correct script output
    const scriptHint = targetLanguage === "km"
      ? `\nExample correct Khmer: "ខ្ញុំនៅទីណា?" (NOT "ខញំទាណា?"). Always use the correct subscript consonants (e.g., ្) and vowel signs.`
      : "";

    const response = await this.client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: [
            `You are a professional video speech translator with expert knowledge of ${targetLanguageName} script and orthography.`,
            `Translate the given text into ${targetLanguageName} (language code: ${targetLanguage}).`,
            `CRITICAL RULES:`,
            `1. Output ONLY the translated text in ${targetLanguageName} script — no characters from any other language.`,
            `2. Use correct Unicode combining characters, subscript consonants, and diacritics as required by ${targetLanguageName} orthography.`,
            `3. Do NOT include any characters, words, or punctuation from the source language.`,
            `4. Do NOT add explanations, notes, or conversational filler.`,
            `5. Keep the tone, emotion, and approximate length similar to the original for video pacing.`,
            `6. If the source contains untranslatable filler sounds or interjections (e.g. Chinese "嗯", "哎呀", "哎") that have no natural equivalent in ${targetLanguageName}, translate them to the closest ${targetLanguageName} natural equivalent (e.g. "អូយ", "អ៊ូ") — do NOT phonetically transcribe their foreign pronunciation.`,
            scriptHint,
          ].join("\n"),
        },
        { role: "user", content: text },
      ],
      temperature: 0.1,
    });

    let result = response.choices[0]?.message?.content?.trim() ?? text;

    // Post-process: strip any leaked CJK / Han characters that the model may have left in
    // (covers CJK Unified Ideographs, CJK Extension A/B, Hangul, Katakana, Hiragana)
    if (!["zh", "zh-TW", "ja", "ko"].includes(targetLanguage)) {
      result = result.replace(/[\u3000-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\u3040-\u30FF]/g, "").trim();
    }

    console.log(`[Translation] model=${model} lang=${targetLanguage}`);
    return result;
  }

  async synthesize(text: string, language: string, outputPath: string): Promise<void> {
    // Languages where OpenAI TTS produces gibberish — route to Google Translate TTS instead.
    const GOOGLE_TTS_LANGS = new Set(["km", "lo", "my"]);

    if (GOOGLE_TTS_LANGS.has(language)) {
      await this.synthesizeWithGoogleTTS(text, language, outputPath);
      return;
    }

    // All other languages: use OpenAI TTS (well-supported)
    const voice = TTS_VOICE_MAP[language] ?? DEFAULT_VOICE;
    const mp3 = await this.client.audio.speech.create({
      model: "tts-1",
      voice,
      input: text,
      response_format: "mp3",
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);
  }

  /**
   * Synthesize speech using google-tts-api (Google Translate TTS engine).
   * Completely free, no API keys required, natively supports Khmer/Lao/Burmese.
   * Returns base64 chunks of MP3 audio which are concatenated and saved.
   */
  private async synthesizeWithGoogleTTS(
    text: string,
    language: string,
    outputPath: string,
  ): Promise<void> {
    console.log(`[TTS] Using Google TTS fallback for language: ${language}`);
    
    // google-tts-api splits text > 200 chars automatically and returns chunks
    const googleTTS = await import("google-tts-api");
    const audioChunks = await googleTTS.getAllAudioBase64(text, {
      lang: language,
      slow: false,
      host: "https://translate.google.com",
    });

    const buffers = audioChunks.map(chunk => Buffer.from(chunk.base64, "base64"));
    const finalBuffer = Buffer.concat(buffers);

    // Save the raw slow Google TTS to a temp file
    const tempPath = outputPath.replace(/\.mp3$/, "_slow.mp3");
    fs.writeFileSync(tempPath, finalBuffer);

    // Speed up the audio by 1.35x to match normal conversational pacing
    console.log(`[TTS] Adjusting tempo (1.35x speed)...`);
    await new Promise<void>((resolve, reject) => {
      ffmpeg(tempPath)
        .audioFilter("atempo=1.35")
        .save(outputPath)
        .on("end", () => {
          try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
          resolve();
        })
        .on("error", (err) => {
          try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
          reject(err);
        });
    });

    console.log(`[TTS] Google synthesis & tempo adjustment complete → ${path.basename(outputPath)}`);
  }
}
