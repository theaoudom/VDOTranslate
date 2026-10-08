// Voices one line to check a voice setup.
// Run: npx tsx scripts/test-voice.ts <lang> <standard|natural|cloned> [text] [male|female]
import fs from "fs";
import path from "path";
import { OpenAIAIRepository } from "../src/data/repositories/OpenAIAIRepository";

async function main() {
  const [lang = "km", voice = "natural", text = "ថ្ងៃនេះយើងសាកល្បងម្ហូបតាមផ្លូវនៅភ្នំពេញ។", gender = "male"] = process.argv.slice(2);
  const repo = new OpenAIAIRepository();
  console.log("availability for", lang, repo.voiceAvailability(lang));
  const out = path.join(process.cwd(), "out", "voice-test", `${lang}-${voice}-${gender}`);
  fs.mkdirSync(out, { recursive: true });
  const files = await repo.synthesizeSegments([{ start: 0, end: 4, speaker: "Speaker 0", gender: gender as "male" | "female", text }], lang, out, { voice: voice as "natural" });
  console.log("file:", files[0], fs.statSync(files[0]).size, "bytes");
}
main().catch((e) => { console.error(e?.response?.data ? Buffer.from(e.response.data).toString() : e); process.exit(1); });
