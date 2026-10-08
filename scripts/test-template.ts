// Renders a generated 16:9 clip through a 9:16 template (crop, image, video clip with sound,
// Khmer text, outro text timed from the end, subtitles). Nothing leaves this computer.
// Run: npx tsx scripts/test-template.ts
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import ffmpegPath from "ffmpeg-static";
import { FFmpegMediaRepository } from "../src/data/repositories/FFmpegMediaRepository";

const FF = ffmpegPath as unknown as string;
const ff = (...args: string[]) => {
  const r = spawnSync(FF, ["-hide_banner", "-loglevel", "error", "-y", ...args]);
  if (r.status !== 0) throw new Error(r.stderr.toString());
};

async function main() {
  const out = path.join(process.cwd(), "out", "template-test");
  fs.mkdirSync(out, { recursive: true });
  const src = path.join(out, "wide.mp4"), logo = path.join(out, "logo.png"), ad = path.join(out, "ad.mp4");
  ff("-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30:duration=12", "-f", "lavfi", "-i", "sine=frequency=220:duration=12", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", src);
  ff("-f", "lavfi", "-i", "color=c=0xFFB020:s=300x300,format=rgba", "-vf", "drawbox=x=60:y=60:w=180:h=180:color=0x1A1200@1:t=fill", "-frames:v", "1", logo);
  ff("-f", "lavfi", "-i", "smptebars=size=640x360:rate=30:duration=3", "-f", "lavfi", "-i", "sine=frequency=880:duration=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", ad);

  const m = new FFmpegMediaRepository();
  const result = path.join(out, "templated.mp4");
  await m.render(src, src, result, {
    language: "km",
    subtitles: [{ start: 0.5, end: 6, text: "ថ្ងៃនេះយើងសាកល្បងម្ហូបតាមផ្លូវ។" }],
    template: {
      ratio: "9:16", pan: 20,
      layers: [
        { id: "a", type: "image", name: "Logo", x: 5, y: 3, w: 18, op: 90, range: "all", anchor: "start", from: 0, to: 0, ar: 1, file: logo },
        { id: "b", type: "video", name: "Ad", x: 10, y: 45, w: 80, op: 100, range: "part", anchor: "start", from: 0, to: 4, ar: 16 / 9, file: ad, sound: true, hasAudio: true },
        { id: "c", type: "text", name: "Banner", x: 7, y: 80, w: 70, op: 100, range: "all", anchor: "start", from: 0, to: 0, ar: 1, text: "តាមដាន @sokhaeats", style: "brand" },
        { id: "d", type: "text", name: "Outro", x: 20, y: 40, w: 60, op: 100, range: "part", anchor: "end", from: 3, to: 0, ar: 1, text: "Thanks for watching!", style: "light" },
      ],
    },
  });
  const info = await m.probe(result);
  console.log("rendered:", `${info.width}x${info.height}`, info.durationSec.toFixed(2) + "s", "audio:", info.hasAudio);
  ff("-ss", "2", "-i", result, "-frames:v", "1", "-vf", "scale=270:-1", path.join(out, "f2.png"));
  ff("-ss", "10.5", "-i", result, "-frames:v", "1", "-vf", "scale=270:-1", path.join(out, "f10.png"));
  ff("-i", path.join(out, "f2.png"), "-i", path.join(out, "f10.png"), "-filter_complex", "hstack", path.join(out, "frames.png"));
  console.log("frames:", path.join(out, "frames.png"));
}
main().catch((e) => { console.error(e); process.exit(1); });
