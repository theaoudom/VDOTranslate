/**
 * Test: 2-speaker dubbing.
 * 1. Builds a small test video with two distinct TTS voices talking (scripts/out/two_speakers.mp4)
 * 2. Feeds diarized-style 2-speaker segments directly into translate() + synthesize()
 *    to verify each character gets their own voice.
 * Run: npx tsx scripts/test-two-speakers.ts
 */
import fs from "fs";
import path from "path";

// Load .env.local (we run outside Next.js)
const envPath = path.join(process.cwd(), ".env.local");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  if (line.trim().startsWith("#")) continue;
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

async function main() {
  const ffmpeg = (await import("fluent-ffmpeg")).default;
  const installer = (await import("@ffmpeg-installer/ffmpeg")).default;
  ffmpeg.setFfmpegPath(installer.path);

  const { OpenAIAIRepository } = await import("../src/data/repositories/OpenAIAIRepository");
  const repo = new OpenAIAIRepository();

  const outDir = path.join(process.cwd(), "scripts", "out");
  fs.mkdirSync(outDir, { recursive: true });

  // ---------- 1. Build a 2-speaker source video ----------
  const lines = [
    { speaker: "Speaker 0", voice: "echo",    text: "Hey Sara, did you watch the movie I sent you last night?", start: 0.5 },
    { speaker: "Speaker 1", voice: "shimmer", text: "Yes! I loved it. The story was amazing and the music was beautiful.", start: 5.0 },
    { speaker: "Speaker 0", voice: "echo",    text: "I knew you would like it. We should watch the sequel together this weekend.", start: 10.5 },
    { speaker: "Speaker 1", voice: "shimmer", text: "That sounds like a great plan. I will bring the popcorn!", start: 16.0 },
  ];

  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const clipPaths: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const clip = path.join(outDir, `src_clip_${i}.mp3`);
    if (!fs.existsSync(clip)) {
      const mp3 = await client.audio.speech.create({
        model: "tts-1",
        voice: lines[i].voice as "echo",
        input: lines[i].text,
        response_format: "mp3",
      });
      fs.writeFileSync(clip, Buffer.from(await mp3.arrayBuffer()));
      console.log(`[make] synthesized source clip ${i} (${lines[i].voice})`);
    }
    clipPaths.push(clip);
  }

  // Mix the clips at their start times into one dialogue track
  const dialoguePath = path.join(outDir, "dialogue.mp3");
  await new Promise<void>((resolve, reject) => {
    const cmd = ffmpeg();
    const filters: string[] = [];
    clipPaths.forEach((p, i) => {
      cmd.input(p);
      const ms = Math.round(lines[i].start * 1000);
      filters.push(`[${i}:a]adelay=${ms}|${ms}[a${i}]`);
    });
    const mixIn = clipPaths.map((_, i) => `[a${i}]`).join("");
    filters.push(`${mixIn}amix=inputs=${clipPaths.length}:duration=longest[mixed];[mixed]volume=${clipPaths.length}[out]`);
    cmd.complexFilter(filters.join("; "), "out")
      .outputOptions("-ac 2")
      .save(dialoguePath)
      .on("end", () => resolve())
      .on("error", reject);
  });

  const videoPath = path.join(outDir, "two_speakers.mp4");
  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input("color=c=0x1e293b:s=640x360:d=22")
      .inputFormat("lavfi")
      .input(dialoguePath)
      .outputOptions(["-shortest", "-c:v libx264", "-pix_fmt yuv420p", "-c:a aac"])
      .save(videoPath)
      .on("end", () => resolve())
      .on("error", reject);
  });
  console.log(`[make] test video ready: ${videoPath}`);

  // ---------- 2. Direct pipeline test with diarized segments ----------
  // These segments have the exact shape Deepgram returns for a 2-person conversation.
  const segments = lines.map((l) => ({
    text: l.text,
    start: l.start,
    end: l.start + 4,
    speaker: l.speaker,
  }));

  console.log("\n[test] Translating 2-speaker segments to Spanish...");
  const translated = await repo.translate(segments, "es");
  translated.forEach((s) => console.log(`  ${s.speaker} [${s.gender}]: ${s.text}`));

  const genders = new Set(translated.map((s) => `${s.speaker}=${s.gender}`));
  console.log(`\n[test] Per-speaker genders: ${Array.from(genders).join(", ")}`);

  const outAudio = path.join(outDir, "translated_two_voices.mp3");
  console.log("\n[test] Synthesizing with per-speaker voices...");
  const segFiles = await repo.synthesizeSegments(translated, "es", outDir, { voice: process.env.ELEVENLABS_API_KEY ? "natural" : "standard" });
  await repo.stitch(translated, segFiles, outAudio);
  console.log(`\n[test] DONE -> ${outAudio} (${(fs.statSync(outAudio).size / 1024).toFixed(0)} KB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
