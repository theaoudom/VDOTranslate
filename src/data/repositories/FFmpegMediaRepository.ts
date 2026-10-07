import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import ffmpegPath from "ffmpeg-static";
import type { IMediaRepository, MediaInfo, RenderOptions, SubtitleCue } from "@/domain/repositories/IMediaRepository";

// ffmpeg 6 build with libass + HarfBuzz: needed so Khmer (and other complex scripts)
// subtitles are shaped correctly. The bundled font covers Khmer on any host.
const FFMPEG = ffmpegPath as unknown as string;
const FONTS_DIR = path.join(process.cwd(), "assets", "fonts");

function run(args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, ["-hide_banner", "-y", ...args], { cwd, windowsHide: true });
    let err = "";
    p.stderr.on("data", (d) => { err += d.toString(); if (err.length > 200_000) err = err.slice(-100_000); });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(err) : reject(new Error(`ffmpeg failed (${code}): ${err.slice(-800)}`))));
  });
}

export class FFmpegMediaRepository implements IMediaRepository {
  async probe(filePath: string): Promise<MediaInfo> {
    // ffmpeg -i always exits non-zero without an output; the info is on stderr.
    const out = await new Promise<string>((resolve) => {
      const p = spawn(FFMPEG, ["-hide_banner", "-i", filePath], { windowsHide: true });
      let s = "";
      p.stderr.on("data", (d) => (s += d.toString()));
      p.on("close", () => resolve(s));
      p.on("error", () => resolve(s));
    });
    const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(out);
    const v = /Video:.*?,\s*(\d{2,5})x(\d{2,5})/.exec(out);
    if (!d) throw new Error("This file doesn't look like a video we can read.");
    return {
      durationSec: +d[1] * 3600 + +d[2] * 60 + parseFloat(d[3]),
      width: v ? +v[1] : 0,
      height: v ? +v[2] : 0,
    };
  }

  async extractAudio(videoPath: string, outputPath: string, trimSec?: number | null): Promise<void> {
    await run(["-i", videoPath, ...(trimSec ? ["-t", String(trimSec)] : []), "-vn", "-ac", "2", "-ar", "44100", "-c:a", "libmp3lame", "-q:a", "2", outputPath]);
  }

  async mixVoiceOverBackground(voicesPath: string, backgroundPath: string, outputPath: string): Promise<void> {
    await run([
      "-i", voicesPath, "-i", backgroundPath,
      "-filter_complex", "[0:a][1:a]amix=inputs=2:duration=longest:normalize=0[a]",
      "-map", "[a]", "-ac", "2", "-c:a", "libmp3lame", "-q:a", "2", outputPath,
    ]);
  }

  async render(videoPath: string, audioPath: string, outputPath: string, options: RenderOptions = {}): Promise<void> {
    // ffmpeg runs inside the output folder (see below), so every path must be absolute.
    videoPath = path.resolve(videoPath);
    audioPath = path.resolve(audioPath);
    outputPath = path.resolve(outputPath);
    const workDir = path.dirname(outputPath);
    const filters: string[] = [];
    if (options.blurSubtitles) {
      // Frosted band over where burned-in subtitles usually sit (60%–72% of the height).
      filters.push("split[v1][v2];[v1]crop=iw:ih*0.12:0:ih*0.60,boxblur=40[band];[v2][band]overlay=0:H*0.60");
    }
    if (options.subtitles?.length) {
      const info = await this.probe(videoPath);
      fs.writeFileSync(path.join(workDir, "subtitles.ass"), buildAss(options.subtitles, info.width || 1920, info.height || 1080, subtitleFont(options.language)), "utf8");
      // Relative names + cwd avoid Windows drive-letter escaping inside the filter string.
      const fontsRel = path.relative(workDir, FONTS_DIR).split(path.sep).join("/");
      filters.push(`ass=subtitles.ass:fontsdir='${fontsRel}':shaping=complex`);
    }
    const trim = options.trimSec ? ["-t", String(options.trimSec)] : [];
    const video = filters.length
      ? ["-filter_complex", `[0:v]${filters.join(",")}[v]`, "-map", "[v]", "-c:v", "libx264", "-preset", "fast", "-crf", "21", "-pix_fmt", "yuv420p"]
      : ["-map", "0:v:0", "-c:v", "copy"];
    await run(["-i", videoPath, "-i", audioPath, ...trim, ...video, "-map", "1:a:0", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", path.basename(outputPath)], workDir);
  }
}

/** Subtitles as ASS: white text on a soft dark box, sized to the video. */
/**
 * One font per script so every character matches. Khmer uses the bundled Noto font;
 * the others are standard Windows fonts (bundle Noto CJK etc. before hosting on Linux).
 */
export function subtitleFont(language?: string): string {
  const base = (language ?? "").split("-")[0];
  const fonts: Record<string, string> = {
    km: "Noto Sans Khmer", lo: "Leelawadee UI", my: "Myanmar Text",
    zh: language === "zh-TW" ? "Microsoft JhengHei" : "Microsoft YaHei", ja: "Yu Gothic", ko: "Malgun Gothic",
    hi: "Nirmala UI", ar: "Segoe UI", fa: "Segoe UI",
  };
  return fonts[base] ?? "Segoe UI";
}

export function buildAss(cues: SubtitleCue[], width: number, height: number, font = "Noto Sans Khmer"): string {
  const size = Math.round(height * 0.048);
  const margin = Math.round(height * 0.06);
  const t = (s: number) => {
    const cs = Math.max(0, Math.round(s * 100));
    const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), sec = Math.floor((cs % 6000) / 100), c = cs % 100;
    return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
  };
  const clean = (s: string) => s.replace(/[{}]/g, "").replace(/\r?\n/g, "\\N");
  return [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${width}`, `PlayResY: ${height}`, "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,${font},${size},&H00FFFFFF,&H00FFFFFF,&H64000000,&H64000000,0,0,0,0,100,100,0,0,3,${Math.max(2, Math.round(size * 0.22))},0,2,${margin},${margin},${margin},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...cues.filter((c) => c.text.trim()).map((c) => `Dialogue: 0,${t(c.start)},${t(Math.max(c.end, c.start + 0.8))},Default,,0,0,0,,${clean(c.text)}`),
    "",
  ].join("\n");
}
