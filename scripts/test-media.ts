// Smoke test for the ffmpeg media pipeline (no AI calls, nothing leaves this computer).
// Run: npx tsx scripts/test-media.ts <path-to-video>
import fs from "fs";
import path from "path";
import { FFmpegMediaRepository } from "../src/data/repositories/FFmpegMediaRepository";

async function main() {
  const video = process.argv[2];
  if (!video || !fs.existsSync(video)) throw new Error("Pass a video path");
  const out = path.join(process.cwd(), "out", "media-test");
  fs.mkdirSync(out, { recursive: true });
  const m = new FFmpegMediaRepository();

  const info = await m.probe(video);
  console.log("probe:", info);

  const audio = path.join(out, "audio.mp3");
  await m.extractAudio(video, audio, 12);
  console.log("extracted 12s audio:", (await m.probe(audio)).durationSec.toFixed(2), "s");

  // stand-ins: original audio as "background", same audio as "voices"
  const mixed = path.join(out, "mixed.mp3");
  await m.mixVoiceOverBackground(audio, audio, mixed);
  console.log("mixed:", (await m.probe(mixed)).durationSec.toFixed(2), "s");

  const rendered = path.join(out, "translated.mp4");
  await m.render(video, mixed, rendered, {
    trimSec: 12,
    blurSubtitles: true,
    subtitles: [
      { start: 0.5, end: 5, text: "ថ្ងៃនេះយើងសាកល្បងម្ហូបតាមផ្លូវនៅភ្នំពេញ។" },
    ],
  });
  const zh = path.join(out, "translated_zh.mp4");
  await m.render(video, mixed, zh, { trimSec: 12, language: "zh", subtitles: [{ start: 0.5, end: 11, text: "今天我们在金边尝试街头美食。" }] });
  console.log("rendered zh:", (await m.probe(zh)).durationSec.toFixed(2), "s");
  const r = await m.probe(rendered);
  console.log("rendered:", r.durationSec.toFixed(2), "s", `${r.width}x${r.height}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
