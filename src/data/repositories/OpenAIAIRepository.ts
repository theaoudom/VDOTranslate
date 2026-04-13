import OpenAI from "openai";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import type { IAIRepository, TranscriptionResult, TranscriptionSegment } from "@/domain/repositories/IAIRepository";
import { createClient } from "@deepgram/sdk";
import axios from "axios";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const DEFAULT_OPENAI_VOICE_MALE = "onyx" as const;
const DEFAULT_OPENAI_VOICE_FEMALE = "nova" as const;

// 11Labs best multingual voices
const ELEVENLABS_MALE_VOICE_ID = "pNInz6obpgDQGcFmaJcg"; // Adam
const ELEVENLABS_FEMALE_VOICE_ID = "EXAVITQu4vr4xnSDxMaL"; // Bella

export class OpenAIAIRepository implements IAIRepository {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async transcribe(audioPath: string): Promise<TranscriptionResult> {
    // If user provided Deepgram API key in .env, use Deepgram with diaraization
    if (process.env.DEEPGRAM_API_KEY) {
      console.log(`[Transcription] Using Deepgram for speaker diarization...`);
      return this.transcribeWithDeepgram(audioPath);
    }

    console.log(`[Transcription] Deepgram key missing, falling back to OpenAI Whisper (No Diarization)`);
    return this.transcribeWithOpenAI(audioPath);
  }

  private async transcribeWithDeepgram(audioPath: string): Promise<TranscriptionResult> {
    const deepgram = createClient(process.env.DEEPGRAM_API_KEY!);
    const audioBuffer = fs.readFileSync(audioPath);
    
    // Call deepgram
    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(audioBuffer, {
      model: "nova-2",
      smart_format: true,
      diarize: true,
      detect_language: true,
      punctuate: true,
    });

    if (error) {
      throw new Error(`Deepgram transcription failed: ${JSON.stringify(error)}`);
    }

    const channel = result.results.channels[0];
    const language = result.results.channels[0].detected_language || "en";
    
    // Extract paragraphs/sentences
    const segments: TranscriptionSegment[] = [];
    const fullTextArr: string[] = [];
    
    const paragraphs = channel.alternatives[0]?.paragraphs?.paragraphs || [];
    
    // Deepgram organizes speech into paragraphs with speaker labels.
    for (const p of paragraphs) {
      const text = p.sentences.map(s => s.text).join(" ");
      segments.push({
        text,
        start: p.start, // seconds
        end: p.end, // seconds
        speaker: `Speaker ${p.speaker}`,
      });
      fullTextArr.push(text);
    }

    // Fallback if paragraphs aren't generated properly but we have words
    if (segments.length === 0 && channel.alternatives[0]?.words) {
      const words = channel.alternatives[0].words;
      const text = words.map(w => w.punctuated_word || w.word).join(" ");
      segments.push({ text, start: words[0].start, end: words[words.length-1].end, speaker: "Speaker 0" });
      fullTextArr.push(text);
    }

    return {
      text: fullTextArr.join("\n\n"),
      language,
      segments
    };
  }

  private async transcribeWithOpenAI(audioPath: string): Promise<TranscriptionResult> {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const response = await this.client.audio.transcriptions.create({
          model: "whisper-1",
          file: fs.createReadStream(audioPath),
          response_format: "verbose_json", // Using verbose JSON gives text, but NOT speaker diarization natively in normal API
        }, { timeout: 300000 });

        const language = (response as { language?: string }).language ?? "en";
        
        // We extract the time-stamped segments so the audio plays at the 
        // correct time, even without Deepgram's speaker separation.
        const rawSegments = (response as any).segments || [];
        const parsedSegments: TranscriptionSegment[] = [];

        if (rawSegments.length > 0) {
          rawSegments.forEach((seg: any) => {
            parsedSegments.push({
              text: seg.text,
              start: seg.start,
              end: seg.end,
              speaker: "Speaker",
              gender: "unknown",
            });
          });
        } else {
          // Fallback if segments are completely missing for some reason
          parsedSegments.push({
            text: response.text,
            start: 0,
            end: (response as any).duration || 60,
            speaker: "Speaker",
            gender: "unknown",
          });
        }

        return {
          text: response.text,
          language,
          segments: parsedSegments
        };
      } catch (err: any) {
        attempt++;
        if (attempt >= maxRetries) throw err;
        await new Promise(r => setTimeout(r, attempt * 2000));
      }
    }
    throw new Error("Failed to transcribe after retries.");
  }

  async translate(segments: TranscriptionSegment[], targetLanguage: string): Promise<TranscriptionSegment[]> {
    if (segments.length === 0) return [];
    
    const COMPLEX_SCRIPT_LANGUAGES = new Set(["km", "lo", "my", "th", "ar", "hi", "fa"]);
    const model = COMPLEX_SCRIPT_LANGUAGES.has(targetLanguage) ? "gpt-4o" : "gpt-4o-mini";

    console.log(`[Translation] Batch Translating ${segments.length} segments to ${targetLanguage} using ${model}...`);

    // Group segments for a single LLM request to maintain context and infer gender
    const payload = segments.map((s, idx) => ({
      id: idx,
      speaker: s.speaker,
      original_text: s.text
    }));

    // Example schema ensuring LLM knows exactly what to return
    const systemPrompt = `You are an expert video translator and sentiment/demographic analyzer.
Target language code: ${targetLanguage}.
You will receive a JSON list of dialogue segments from a video transcription.
Your task:
1. Translate each segment naturally into the target language. Keep the length roughly similar.
2. Based *only* on the dialogue context, guess if each speaker corresponds to a 'male' or 'female' voice. If completely unsure, default to 'male'.
Return strict JSON exactly matching this format: { "results": [ { "id": number, "translated_text": string, "gender": "male" | "female" } ] }`;

    const response = await this.client.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify({ segments: payload }) },
      ],
      temperature: 0.1,
    });

    try {
      const parsed = JSON.parse(response.choices[0]?.message?.content || '{"results":[]}');
      const results = parsed.results || [];
      
      const translatedSegments = segments.map((seg, idx) => {
        const matched = results.find((r: any) => r.id === idx);
        
        let cleanedText = matched?.translated_text || seg.text;
        // Strip leaked CJK if target is not CJK
        if (!["zh", "zh-TW", "ja", "ko"].includes(targetLanguage)) {
          cleanedText = cleanedText.replace(/[\u3000-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\u3040-\u30FF]/g, "").trim();
        }

        return {
          ...seg,
          text: cleanedText,
          gender: matched?.gender || "male",
        };
      });

      return translatedSegments;
    } catch (e) {
      console.error("Failed to parse batch translation json, returning original segments", e);
      return segments;
    }
  }

  async synthesize(segments: TranscriptionSegment[], language: string, outputPath: string): Promise<void> {
    console.log(`[TTS] Synthesizing ${segments.length} segments for final audio...`);

    const hasElevenLabs = !!process.env.ELEVENLABS_API_KEY;
    const tempDir = path.dirname(outputPath);
    const audioFiles: string[] = [];

    // Synthesize each segment
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const tempFile = path.join(tempDir, `temp_seg_${i}_${Date.now()}.mp3`);
        
        try {
          if (hasElevenLabs) {
             await this.synthesizeWithElevenLabs(seg, language, tempFile);
          } else {
             await this.synthesizeWithOpenAI(seg, language, tempFile);
          }
          audioFiles.push(tempFile);
        } catch (e) {
          console.error(`Error synthesizing segment ${i}:`, e);
          // Create dummy empty file to prevent ffmpeg completely breaking
          fs.writeFileSync(tempFile, Buffer.alloc(0));
          audioFiles.push(tempFile);
        }
    }

    if (audioFiles.length === 0) {
      throw new Error("No audio segments synthesized.");
    }

    // If only one segment that starts at 0, just rename it
    if (audioFiles.length === 1 && segments[0].start <= 0.1) {
       fs.renameSync(audioFiles[0], outputPath);
       return;
    }

    // Stitch together using amix
    console.log(`[TTS] Stitching segments back together with proper timestamps...`);
    await this.stitchAudioSegments(segments, audioFiles, outputPath);

    // Cleanup temp files
    for (const file of audioFiles) {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }

  private async synthesizeWithElevenLabs(seg: TranscriptionSegment, language: string, outputPath: string): Promise<void> {
    const voiceId = seg.gender === "female" ? ELEVENLABS_FEMALE_VOICE_ID : ELEVENLABS_MALE_VOICE_ID;
    
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        text: seg.text,
        model_id: "eleven_multilingual_v2", // Multilingual model is perfect for non-English
      },
      {
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        responseType: "arraybuffer", // Important to receive binary
      }
    );

    fs.writeFileSync(outputPath, response.data);
  }

  private async synthesizeWithOpenAI(seg: TranscriptionSegment, language: string, outputPath: string): Promise<void> {
     // Languages where OpenAI TTS produces gibberish — route to Google Translate TTS instead.
     const GOOGLE_TTS_LANGS = new Set(["km", "lo", "my"]);

     if (GOOGLE_TTS_LANGS.has(language)) {
       await this.synthesizeWithGoogleTTS(seg.text, language, outputPath, seg.gender || "male");
       return;
     }

     // OpenAI TTS fallback for supported languages
     const voice = seg.gender === "female" ? DEFAULT_OPENAI_VOICE_FEMALE : DEFAULT_OPENAI_VOICE_MALE;
     
     const mp3 = await this.client.audio.speech.create({
      model: "tts-1",
      voice,
      input: seg.text,
      response_format: "mp3",
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);
  }

  private async synthesizeWithGoogleTTS(
    text: string,
    language: string,
    outputPath: string,
    gender: string
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

    const tempPath = outputPath.replace(/\.mp3$/, "_slow.mp3");
    fs.writeFileSync(tempPath, finalBuffer);

    // Exact 1.0x standard speed
    let filter = "atempo=1.0";
    
    // If male, we lower the pitch of the female Google voice using asetrate, 
    // and compensate the tempo slowdown exactly so it remains at 1.0x speed.
    if (gender === "male") {
      console.log(`[TTS] Applying male pitch-shift to Google TTS...`);
      // 0.75x sample rate lowers the pitch deeply. 
      // Pace compensation: 1.0 (target) / 0.75 (slowdown from asetrate) = 1.3333
      filter = "asetrate=44100*0.75,aresample=44100,atempo=1.3333";
    }

    await new Promise<void>((resolve, reject) => {
      ffmpeg(tempPath)
        .audioFilter(filter)
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
  }

  private async stitchAudioSegments(segments: TranscriptionSegment[], files: string[], outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const command = ffmpeg();
      const filterGroups: string[] = [];

      files.forEach((file, index) => {
        // Skip 0-byte fallbacks
        if (fs.statSync(file).size > 0) {
           command.input(file);
           const delayMs = Math.max(0, Math.round(segments[index].start * 1000));
           filterGroups.push(`[${index}:a]adelay=${delayMs}|${delayMs}[a${index}]`);
        }
      });

      if (filterGroups.length === 0) {
         reject(new Error("No valid valid audio to stitch"));
         return;
      }

      // amix requires all streams mapped
      const mixInputs = filterGroups.map((_, i) => `[a${i}]`).join('');
      // amix automatically divides the overall volume by the number of inputs (1/N).
      // Since we had to remove normalize=0, we must manually multiply the volume 
      // by N after mixing to perfectly restore it to 100% loudness!
      filterGroups.push(`${mixInputs}amix=inputs=${filterGroups.length}:duration=longest[mixed];[mixed]volume=${filterGroups.length}[out]`);

      command.complexFilter(filterGroups.join('; '), 'out')
        .outputOptions('-ac 2') // stereo
        .save(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => {
          console.error(`Error during audio mix:`, err.message);
          reject(err);
        });
    });
  }
}
