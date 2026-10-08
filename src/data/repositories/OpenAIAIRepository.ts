import OpenAI from "openai";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import type { IAIRepository, TranscriptionResult, TranscriptionSegment, SynthesizeOptions, VoiceAvailability } from "@/domain/repositories/IAIRepository";
import { createClient } from "@deepgram/sdk";
import axios from "axios";
import { AZURE_LOCALES, azureConfigured, synthesizeWithAzure } from "./AzureSpeech";

ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);

// Voice pools — each detected speaker gets their own voice so characters sound distinct.
const OPENAI_MALE_VOICES = ["onyx", "echo", "fable"] as const;
const OPENAI_FEMALE_VOICES = ["nova", "shimmer", "alloy"] as const;

// ElevenLabs voices come from the account (GET /v1/voices): the old fixed premade
// ids were retired. Fallbacks are only used if the list can't be read.
const ELEVENLABS_FALLBACK = { male: ["JBFqnCBsd6RMkjVDRZzb"], female: ["EXAVITQu4vr4xnSDxMaL"] };
const ELEVENLABS_MODEL = "eleven_v4";

/**
 * Target languages eleven_v4 speaks (from ElevenLabs' model docs). Khmer is NOT supported:
 * tested 2026-10-08, it comes out as gibberish, so Khmer stays on the standard voice.
 */
export const ELEVENLABS_LANGUAGES = new Set([
  "en", "zh", "zh-TW", "vi", "ja", "ko", "fr", "de", "es", "pt", "ar", "hi", "ru", "id", "ms",
  "tr", "nl", "pl", "it", "uk", "fa", "lo", "my", "sw",
]);

let elevenVoiceCache: { at: number; male: string[]; female: string[] } | null = null;
async function elevenVoices(): Promise<{ male: string[]; female: string[] }> {
  if (elevenVoiceCache && Date.now() - elevenVoiceCache.at < 3600_000) return elevenVoiceCache;
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "" } });
    if (!res.ok) throw new Error(`voices ${res.status}`);
    const { voices } = (await res.json()) as { voices: { voice_id: string; name: string; category?: string; labels?: { gender?: string } }[] };
    const pick = (g: string) => voices.filter((v) => v.category === "premade" && v.labels?.gender === g).sort((a, b) => a.name.localeCompare(b.name)).map((v) => v.voice_id);
    const male = pick("male"), female = pick("female");
    elevenVoiceCache = { at: Date.now(), male: male.length ? male : ELEVENLABS_FALLBACK.male, female: female.length ? female : ELEVENLABS_FALLBACK.female };
  } catch (e) {
    console.error("[TTS] Couldn't list ElevenLabs voices, using fallbacks:", e instanceof Error ? e.message : e);
    return ELEVENLABS_FALLBACK;
  }
  return elevenVoiceCache;
}

// Google TTS only has one voice per language, so we pitch-shift it per speaker
// (rate < 1.0 = deeper, > 1.0 = brighter). Pace is compensated so speed stays 1.0x.
const GOOGLE_PITCH_MALE = [0.75, 0.82, 0.7];
const GOOGLE_PITCH_FEMALE = [1.0, 1.05, 0.95];

// Whisper reports language as an English name; Deepgram wants a BCP-47 code.
// Languages missing here (Khmer, Lao, Burmese...) aren't supported by Deepgram —
// they fall back to Whisper-only transcription without speaker separation.
const WHISPER_TO_DEEPGRAM_LANG: Record<string, string> = {
  chinese: "zh-CN",
  english: "en",
  spanish: "es",
  french: "fr",
  german: "de",
  japanese: "ja",
  korean: "ko",
  portuguese: "pt",
  russian: "ru",
  hindi: "hi",
  indonesian: "id",
  turkish: "tr",
  dutch: "nl",
  italian: "it",
  polish: "pl",
  ukrainian: "uk",
  vietnamese: "vi",
  thai: "th",
  malay: "ms",
};

interface SpeakerVoiceProfile {
  gender: "male" | "female";
  openaiVoice: string;
  elevenLabsVoiceId: string;
  googlePitch: number;
  /** this speaker's number among speakers of the same gender */
  genderIndex: number;
  isCloned: boolean;
}

export class OpenAIAIRepository implements IAIRepository {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }

  async transcribe(audioPath: string): Promise<TranscriptionResult> {
    // If user provided Deepgram API key in .env, use Deepgram with diaraization
    if (process.env.DEEPGRAM_API_KEY) {
      console.log(`[Transcription] Using Deepgram for speaker diarization...`);
      try {
        const result = await this.transcribeWithDeepgram(audioPath);
        if (result.segments.length > 0 && result.text.trim().length > 0) {
          return result;
        }
        // Deepgram's language auto-detect fails on some languages (e.g. Chinese),
        // returning zero words. Fall through to hybrid mode below.
        console.log(`[Transcription] Deepgram auto-detect returned no speech — switching to hybrid mode (Whisper text + Deepgram speakers)`);
      } catch (e) {
        console.error(`[Transcription] Deepgram failed, switching to hybrid mode:`, e instanceof Error ? e.message : e);
      }
      return this.transcribeHybrid(audioPath);
    }

    console.log(`[Transcription] Deepgram key missing, falling back to OpenAI Whisper (No Diarization)`);
    return this.transcribeWithOpenAI(audioPath);
  }

  /**
   * Hybrid transcription: Whisper produces the transcript (better accuracy on
   * languages Deepgram can't auto-detect, like Chinese), while Deepgram — given
   * the language Whisper detected — supplies the speaker timeline. Each Whisper
   * segment is then labeled with the speaker who talks most during its time range.
   */
  private async transcribeHybrid(audioPath: string): Promise<TranscriptionResult> {
    const whisperResult = await this.transcribeWithOpenAI(audioPath);

    const dgLang = WHISPER_TO_DEEPGRAM_LANG[whisperResult.language.toLowerCase()];
    if (!dgLang) {
      console.log(`[Transcription] Deepgram doesn't support "${whisperResult.language}" — using Whisper only (no speaker separation)`);
      return whisperResult;
    }

    try {
      const deepgram = createClient(process.env.DEEPGRAM_API_KEY!);
      const audioBuffer = fs.readFileSync(audioPath);
      const { result, error } = await deepgram.listen.prerecorded.transcribeFile(audioBuffer, {
        model: "nova-2",
        diarize: true,
        punctuate: true,
        language: dgLang,
      });
      if (error) throw new Error(JSON.stringify(error));

      const words = (result.results.channels[0]?.alternatives[0]?.words || []) as Array<{
        start: number; end: number; speaker?: number;
      }>;
      if (words.length === 0) return whisperResult;

      // Speakers with a tiny share of the speech (brief interjections, diarization
      // noise) don't earn their own voice — their words count toward the main
      // speaker. Constant flipping on weak evidence sounds worse than one voice.
      const speakerTotals = new Map<number, number>();
      for (const w of words) {
        if (w.speaker === undefined) continue;
        speakerTotals.set(w.speaker, (speakerTotals.get(w.speaker) || 0) + 1);
      }
      let dominantSpeaker = 0;
      let dominantCount = 0;
      speakerTotals.forEach((count, speaker) => {
        if (count > dominantCount) { dominantCount = count; dominantSpeaker = speaker; }
      });
      const totalWords = words.length;
      const realSpeaker = (s: number) =>
        (speakerTotals.get(s) || 0) / totalWords >= 0.15 ? s : dominantSpeaker;

      // Label each Whisper segment. Switching away from the current speaker requires
      // a clear majority (>=70% of the segment's words) — weak or empty evidence
      // keeps the current voice, so it never flips mid-speech on a stray word.
      let currentSpeaker = dominantSpeaker;
      for (const seg of whisperResult.segments) {
        const counts = new Map<number, number>();
        let overlapTotal = 0;
        for (const w of words) {
          if (w.speaker === undefined) continue;
          if (w.end > seg.start && w.start < seg.end) {
            const s = realSpeaker(w.speaker);
            counts.set(s, (counts.get(s) || 0) + 1);
            overlapTotal++;
          }
        }
        let best = currentSpeaker;
        let bestCount = 0;
        counts.forEach((count, speaker) => {
          if (count > bestCount) { bestCount = count; best = speaker; }
        });
        if (overlapTotal > 0 && best !== currentSpeaker && bestCount / overlapTotal >= 0.7) {
          currentSpeaker = best;
        }
        seg.speaker = `Speaker ${currentSpeaker}`;
      }

      const speakerCount = new Set(whisperResult.segments.map(s => s.speaker)).size;
      console.log(`[Transcription] Hybrid mode: Whisper transcript + Deepgram found ${speakerCount} speaker(s)`);
      return whisperResult;
    } catch (e) {
      console.error(`[Transcription] Deepgram speaker pass failed, using Whisper only:`, e instanceof Error ? e.message : e);
      return whisperResult;
    }
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
    if (segments.length === 0 && channel.alternatives[0]?.words?.length) {
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
2. Based *only* on the dialogue context, guess if each speaker corresponds to a 'male' or 'female' voice. Segments sharing the same "speaker" label are the SAME character — keep their gender consistent across all their segments. If completely unsure, default to 'male'.
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

      // Majority-vote gender per speaker so one character never flips voice mid-video
      const votes = new Map<string, { male: number; female: number }>();
      for (const seg of translatedSegments) {
        const v = votes.get(seg.speaker) || { male: 0, female: 0 };
        v[seg.gender === "female" ? "female" : "male"]++;
        votes.set(seg.speaker, v);
      }
      for (const seg of translatedSegments) {
        const v = votes.get(seg.speaker)!;
        seg.gender = v.female > v.male ? "female" : "male";
      }

      return translatedSegments;
    } catch (e) {
      console.error("Failed to parse batch translation json, returning original segments", e);
      return segments;
    }
  }

  /**
   * standard → OpenAI / Google voices (always)
   * natural  → Azure neural voices (incl. Khmer), needs AZURE_SPEECH_KEY + AZURE_SPEECH_REGION
   * cloned   → ElevenLabs voice cloning (no Khmer), needs ELEVENLABS_API_KEY
   */
  voiceAvailability(language?: string): VoiceAvailability {
    const langs = this.voiceLanguages();
    const has = (list: string[]) => list.length > 0 && (!language || list.includes(language));
    return { standard: true, natural: has(langs.natural), cloned: has(langs.cloned) };
  }

  voiceLanguages() {
    return {
      natural: azureConfigured() ? Object.keys(AZURE_LOCALES) : [],
      cloned: process.env.ELEVENLABS_API_KEY ? Array.from(ELEVENLABS_LANGUAGES) : [],
    };
  }

  /**
   * Synthesizes each segment into its own file (outDir/seg_<i>.mp3) with the voice kind the
   * user chose. Files are kept so one corrected line can be re-voiced later.
   * Returns one path per segment ("" when a segment couldn't be voiced).
   */
  async synthesizeSegments(segments: TranscriptionSegment[], language: string, outDir: string, options: SynthesizeOptions): Promise<string[]> {
    const voice = options.voice;
    const useEleven = voice === "cloned";
    if (voice !== "standard" && !this.voiceAvailability(language)[voice]) {
      throw new Error(`The ${voice} voice isn't available for "${language}".`);
    }
    const only = options.onlyIndex;
    console.log(`[TTS] Synthesizing ${only == null ? segments.length + " segments" : "segment " + only} (${voice})...`);

    // Profiles come from all segments so every speaker keeps the same voice as before.
    const voiceProfiles = await this.buildSpeakerVoiceProfiles(segments, {
      hasElevenLabs: useEleven,
      cloneVoices: voice === "cloned",
      sourceAudioPath: options.sourceAudioPath ?? null,
      tempDir: outDir,
      onlySpeaker: only == null ? undefined : segments[only]?.speaker,
    });

    const files: string[] = [];
    try {
      for (let i = 0; i < segments.length; i++) {
        if (only != null && i !== only) { files.push(""); continue; }
        const seg = segments[i];
        const profile = voiceProfiles.get(seg.speaker)!;
        const file = path.join(outDir, `seg_${i}.mp3`);
        try {
          if (voice === "natural") await synthesizeWithAzure(seg.text, language, profile.gender, profile.genderIndex, file);
          else if (useEleven) await this.synthesizeWithElevenLabs(seg, profile, file);
          else await this.synthesizeWithOpenAI(seg, language, profile, file);
          files.push(file);
        } catch (e) {
          console.error(`Error synthesizing segment ${i}:`, e);
          if (only != null) throw e;
          files.push("");
        }
      }
    } finally {
      // Cloned voices are job-scoped — delete them from the ElevenLabs account when done
      await this.deleteClonedVoices(voiceProfiles);
    }
    if (only == null && files.every((f) => !f)) throw new Error("No audio segments synthesized.");
    return files;
  }

  /**
   * Assigns a voice to every detected speaker. With cloning enabled (and ElevenLabs
   * available), each speaker's real voice is cloned from the original audio so the
   * dub keeps the character's own voice. Otherwise voices are dealt round-robin
   * from gender-matched pools so no two characters share a voice.
   */
  private async buildSpeakerVoiceProfiles(
    segments: TranscriptionSegment[],
    opts: { hasElevenLabs: boolean; cloneVoices: boolean; sourceAudioPath: string | null; tempDir: string; onlySpeaker?: string },
  ): Promise<Map<string, SpeakerVoiceProfile>> {
    const profiles = new Map<string, SpeakerVoiceProfile>();
    const speakerSegments = new Map<string, TranscriptionSegment[]>();

    for (const seg of segments) {
      if (!speakerSegments.has(seg.speaker)) speakerSegments.set(seg.speaker, []);
      speakerSegments.get(seg.speaker)!.push(seg);
    }

    console.log(`[TTS] Detected ${speakerSegments.size} distinct speaker(s): ${Array.from(speakerSegments.keys()).join(", ")}`);

    const eleven = opts.hasElevenLabs ? await elevenVoices() : ELEVENLABS_FALLBACK;
    let maleCount = 0;
    let femaleCount = 0;

    for (const [speaker, segs] of Array.from(speakerSegments.entries())) {
      const gender: "male" | "female" = segs[0].gender === "female" ? "female" : "male";
      const idx = gender === "female" ? femaleCount++ : maleCount++;

      const profile: SpeakerVoiceProfile = {
        gender,
        openaiVoice: gender === "female"
          ? OPENAI_FEMALE_VOICES[idx % OPENAI_FEMALE_VOICES.length]
          : OPENAI_MALE_VOICES[idx % OPENAI_MALE_VOICES.length],
        elevenLabsVoiceId: gender === "female"
          ? eleven.female[idx % eleven.female.length]
          : eleven.male[idx % eleven.male.length],
        googlePitch: gender === "female"
          ? GOOGLE_PITCH_FEMALE[idx % GOOGLE_PITCH_FEMALE.length]
          : GOOGLE_PITCH_MALE[idx % GOOGLE_PITCH_MALE.length],
        genderIndex: idx,
        isCloned: false,
      };

      // Try to clone the speaker's real voice from the original audio
      if (opts.cloneVoices && opts.hasElevenLabs && opts.sourceAudioPath && (!opts.onlySpeaker || opts.onlySpeaker === speaker)) {
        try {
          const samplePath = path.join(opts.tempDir, `voice_sample_${speaker.replace(/\W/g, "_")}_${Date.now()}.mp3`);
          await this.extractSpeakerSample(opts.sourceAudioPath, segs, samplePath);
          const voiceId = await this.createElevenLabsClone(`tvdo_${speaker.replace(/\W/g, "_")}`, samplePath);
          if (fs.existsSync(samplePath)) fs.unlinkSync(samplePath);

          profile.elevenLabsVoiceId = voiceId;
          profile.isCloned = true;
          console.log(`[TTS] Cloned real voice for "${speaker}" -> ${voiceId}`);
        } catch (e) {
          console.error(`[TTS] Voice clone failed for "${speaker}", falling back to preset voice:`, e instanceof Error ? e.message : e);
        }
      }

      profiles.set(speaker, profile);
    }

    return profiles;
  }

  /**
   * Cuts this speaker's spoken parts out of the original audio and joins them
   * into a single clean sample (~10-45s) to feed the voice cloner.
   */
  private async extractSpeakerSample(sourceAudioPath: string, segs: TranscriptionSegment[], outputPath: string): Promise<void> {
    // Prefer the longest segments — more speech, better clone quality
    const sorted = [...segs].sort((a, b) => (b.end - b.start) - (a.end - a.start));
    const chosen: TranscriptionSegment[] = [];
    let total = 0;

    for (const s of sorted) {
      const dur = s.end - s.start;
      if (dur < 1) continue; // too short to be useful
      chosen.push(s);
      total += dur;
      if (total >= 45) break; // ElevenLabs instant clone works well with ~30-60s
    }

    if (total < 5) {
      throw new Error(`Not enough speech (${total.toFixed(1)}s) to clone this speaker`);
    }

    chosen.sort((a, b) => a.start - b.start);
    const selectExpr = chosen
      .map(s => `between(t,${s.start.toFixed(2)},${s.end.toFixed(2)})`)
      .join("+");

    await new Promise<void>((resolve, reject) => {
      ffmpeg(sourceAudioPath)
        .audioFilter(`aselect='${selectExpr}',asetpts=N/SR/TB`)
        .save(outputPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(err));
    });
  }

  private async createElevenLabsClone(name: string, samplePath: string): Promise<string> {
    const form = new FormData();
    form.append("name", name);
    form.append(
      "files",
      new Blob([new Uint8Array(fs.readFileSync(samplePath))], { type: "audio/mpeg" }),
      "sample.mp3",
    );

    const res = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
      body: form,
    });

    if (!res.ok) {
      throw new Error(`ElevenLabs voice clone failed (${res.status}): ${await res.text()}`);
    }

    const data = (await res.json()) as { voice_id: string };
    return data.voice_id;
  }

  private async deleteClonedVoices(profiles: Map<string, SpeakerVoiceProfile>): Promise<void> {
    for (const profile of Array.from(profiles.values())) {
      if (!profile.isCloned) continue;
      try {
        await fetch(`https://api.elevenlabs.io/v1/voices/${profile.elevenLabsVoiceId}`, {
          method: "DELETE",
          headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
        });
      } catch (e) {
        console.error(`[TTS] Failed to delete cloned voice ${profile.elevenLabsVoiceId}:`, e);
      }
    }
  }

  private async synthesizeWithElevenLabs(seg: TranscriptionSegment, profile: SpeakerVoiceProfile, outputPath: string): Promise<void> {
    const voiceId = profile.elevenLabsVoiceId;

    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        text: seg.text,
        model_id: ELEVENLABS_MODEL,
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

  private async synthesizeWithOpenAI(seg: TranscriptionSegment, language: string, profile: SpeakerVoiceProfile, outputPath: string): Promise<void> {
     // Languages where OpenAI TTS produces gibberish — route to Google Translate TTS instead.
     const GOOGLE_TTS_LANGS = new Set(["km", "lo", "my"]);

     if (GOOGLE_TTS_LANGS.has(language)) {
       await this.synthesizeWithGoogleTTS(seg.text, language, outputPath, profile.googlePitch);
       return;
     }

     // Each speaker gets their own voice from the pool so characters sound distinct
     const voice = profile.openaiVoice;

     const mp3 = await this.client.audio.speech.create({
      model: "tts-1",
      voice: voice as "onyx",
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
    pitch: number
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

    // Google only has one voice per language, so each speaker gets a different
    // pitch-shift via asetrate (< 1.0 = deeper/male, > 1.0 = brighter), with the
    // tempo change compensated exactly so playback stays at 1.0x speed.
    if (pitch !== 1.0) {
      console.log(`[TTS] Applying pitch-shift ${pitch}x to Google TTS voice...`);
      const tempoCompensation = (1 / pitch).toFixed(4);
      filter = `asetrate=44100*${pitch},aresample=44100,atempo=${tempoCompensation}`;
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

  /** Places every voiced segment at its original start time in one track. */
  async stitch(segments: TranscriptionSegment[], files: string[], outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const command = ffmpeg();
      const filterGroups: string[] = [];

      let inputIdx = 0;
      files.forEach((file, index) => {
        // Skip 0-byte fallbacks — inputIdx tracks ffmpeg's input numbering,
        // which diverges from `index` once any file is skipped
        if (file && fs.existsSync(file) && fs.statSync(file).size > 0) {
           command.input(file);
           const delayMs = Math.max(0, Math.round(segments[index].start * 1000));
           filterGroups.push(`[${inputIdx}:a]adelay=${delayMs}|${delayMs}[a${inputIdx}]`);
           inputIdx++;
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
