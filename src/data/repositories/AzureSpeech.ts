import fs from "fs";

// Azure neural text-to-speech: the "Natural AI voice" (incl. Khmer: km-KH-PisethNeural / SreymomNeural).
// Docs: https://learn.microsoft.com/azure/ai-services/speech-service/rest-text-to-speech

/** Our language codes → Azure locales. */
export const AZURE_LOCALES: Record<string, string> = {
  km: "km-KH", lo: "lo-LA", my: "my-MM", vi: "vi-VN", zh: "zh-CN", "zh-TW": "zh-TW", en: "en-US", ja: "ja-JP",
  ko: "ko-KR", fr: "fr-FR", de: "de-DE", es: "es-ES", pt: "pt-BR", ar: "ar-SA", hi: "hi-IN", ru: "ru-RU",
  id: "id-ID", ms: "ms-MY", tr: "tr-TR", nl: "nl-NL", pl: "pl-PL", it: "it-IT", uk: "uk-UA", fa: "fa-IR", sw: "sw-KE",
};

// When a language has fewer voices than speakers of one gender, extra speakers reuse a
// voice with a slightly different pitch. Kept subtle so they still sound natural.
const PITCH_VARIANTS = ["+0%", "-5%", "+5%", "-9%"];

const key = () => process.env.AZURE_SPEECH_KEY ?? "";
const region = () => process.env.AZURE_SPEECH_REGION ?? "";
export const azureConfigured = () => Boolean(key() && region());

type VoicePool = { male: string[]; female: string[] };
let voiceCache: { at: number; byLocale: Record<string, VoicePool> } | null = null;

async function voicesFor(locale: string): Promise<VoicePool> {
  if (!voiceCache || Date.now() - voiceCache.at > 6 * 3600_000) {
    const res = await fetch(`https://${region()}.tts.speech.microsoft.com/cognitiveservices/voices/list`, {
      headers: { "Ocp-Apim-Subscription-Key": key() },
    });
    if (!res.ok) throw new Error(`Azure voice list failed (${res.status})`);
    const list = (await res.json()) as { ShortName: string; Locale: string; Gender: string; VoiceType: string }[];
    const byLocale: Record<string, VoicePool> = {};
    for (const v of list) {
      if (v.VoiceType !== "Neural" || /Multilingual|HD|Dragon/i.test(v.ShortName)) continue;
      const pool = (byLocale[v.Locale] ??= { male: [], female: [] });
      (v.Gender === "Female" ? pool.female : pool.male).push(v.ShortName);
    }
    for (const p of Object.values(byLocale)) { p.male.sort(); p.female.sort(); }
    voiceCache = { at: Date.now(), byLocale };
  }
  return voiceCache.byLocale[locale] ?? { male: [], female: [] };
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

/** `index` = this speaker's number among speakers of the same gender (0, 1, 2…). */
export async function synthesizeWithAzure(text: string, language: string, gender: "male" | "female", index: number, outputPath: string): Promise<void> {
  const locale = AZURE_LOCALES[language];
  if (!locale) throw new Error(`No natural voice for "${language}".`);
  const pool = await voicesFor(locale);
  const voices = pool[gender].length ? pool[gender] : pool[gender === "male" ? "female" : "male"];
  if (!voices.length) throw new Error(`Azure has no voices for ${locale}.`);
  const voice = voices[index % voices.length];
  const pitch = PITCH_VARIANTS[Math.floor(index / voices.length) % PITCH_VARIANTS.length];

  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${locale}"><voice name="${voice}"><prosody pitch="${pitch}">${xml(text)}</prosody></voice></speak>`;
  const res = await fetch(`https://${region()}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key(),
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3",
      "User-Agent": "samesay",
    },
    body: ssml,
  });
  if (!res.ok) throw new Error(`Azure TTS failed (${res.status}): ${await res.text()}`);
  fs.writeFileSync(outputPath, Buffer.from(await res.arrayBuffer()));
}
