// Voices one line with the natural (ElevenLabs) voice. Run: npx tsx scripts/test-eleven.ts [lang] [text]
import fs from "fs";
import path from "path";
import { OpenAIAIRepository } from "../src/data/repositories/OpenAIAIRepository";

async function main() {
  const lang = process.argv[2] ?? "vi";
  const text = process.argv[3] ?? "Hôm nay chúng ta thử đồ ăn đường phố ở Phnom Penh.";
  const repo = new OpenAIAIRepository();
  console.log("availability for", lang, repo.voiceAvailability(lang));
  const out = path.join(process.cwd(), "out", "eleven-test");
  fs.mkdirSync(out, { recursive: true });
  const files = await repo.synthesizeSegments([{ start: 0, end: 4, speaker: "Speaker 0", gender: "male", text }], lang, out, { voice: "natural" });
  console.log("file:", files[0], fs.statSync(files[0]).size, "bytes");
}
main().catch((e) => { console.error(e?.response?.data ? Buffer.from(e.response.data).toString() : e); process.exit(1); });
