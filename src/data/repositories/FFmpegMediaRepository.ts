import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import ffmpegPath from "ffmpeg-static";
import { frameSize, layerSpan, type TemplateLayer } from "@/domain/entities/Template";
import type { IMediaRepository, MediaInfo, RenderOptions, RenderTemplate, SubtitleCue } from "@/domain/repositories/IMediaRepository";

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
    if (!d && !v) throw new Error("This file doesn't look like a video or image we can read.");
    return {
      durationSec: d ? +d[1] * 3600 + +d[2] * 60 + parseFloat(d[3]) : 0,
      width: v ? +v[1] : 0,
      height: v ? +v[2] : 0,
      hasAudio: /Stream #.*Audio:/.test(out),
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

  /**
   * Final video. Order: original picture → blur old subtitles → crop to the template frame →
   * image / video-clip layers → text layers + translated subtitles (libass, complex shaping).
   */
  async render(videoPath: string, audioPath: string, outputPath: string, options: RenderOptions = {}): Promise<void> {
    // ffmpeg runs inside the output folder (see below), so every path must be absolute.
    videoPath = path.resolve(videoPath);
    audioPath = path.resolve(audioPath);
    outputPath = path.resolve(outputPath);
    const workDir = path.dirname(outputPath);
    const info = await this.probe(videoPath);
    const duration = Math.min(info.durationSec, options.trimSec ?? Infinity);
    const tpl = options.template;
    const size = tpl ? frameSize(tpl.ratio, info.width || 1920, info.height || 1080) : { w: info.width || 1920, h: info.height || 1080 };

    const inputs = ["-i", videoPath, "-i", audioPath];
    const graph: string[] = [];
    let v = "[0:v]";
    const step = (filter: string) => { const out = `[v${graph.length}]`; graph.push(`${v}${filter}${out}`); v = out; };

    if (options.blurSubtitles) {
      // Frosted band over where burned-in subtitles usually sit (60%–72% of the height).
      graph.push(`${v}split[bs1][bs2]`, "[bs1]crop=iw:ih*0.12:0:ih*0.60,boxblur=40[band]", "[bs2][band]overlay=0:H*0.60[vb]");
      v = "[vb]";
    }
    if (tpl) {
      const p = Math.max(0, Math.min(100, tpl.pan)) / 100;
      step(`scale=${size.w}:${size.h}:force_original_aspect_ratio=increase,crop=${size.w}:${size.h}:(in_w-${size.w})*${p}:(in_h-${size.h})*${p},setsar=1`);
    }

    // Image and video-clip layers.
    const audioClips: string[] = [];
    let inputIndex = 2;
    for (const L of tpl?.layers ?? []) {
      if (L.type === "text" || !L.file) continue;
      const [a, b] = layerSpan(L, duration);
      if (b <= a) continue;
      const w = Math.max(2, Math.round((L.w / 100) * size.w / 2) * 2);
      const h = Math.max(2, Math.round(w / (L.ar || 1) / 2) * 2);
      const x = Math.round((L.x / 100) * size.w), y = Math.round((L.y / 100) * size.h);
      const i = inputIndex++;
      if (L.type === "image") inputs.push("-loop", "1", "-t", String(duration), "-i", L.file);
      else inputs.push("-i", L.file);
      const shift = L.type === "video" ? `,setpts=PTS-STARTPTS+${a.toFixed(3)}/TB` : "";
      graph.push(`[${i}:v]scale=${w}:${h},format=rgba,colorchannelmixer=aa=${(L.op / 100).toFixed(2)}${shift}[ly${i}]`);
      const out = `[v${graph.length}]`;
      graph.push(`${v}[ly${i}]overlay=${x}:${y}:enable='between(t,${a.toFixed(2)},${b.toFixed(2)})':eof_action=pass${out}`);
      v = out;
      if (L.type === "video" && L.sound && L.hasAudio) {
        const ms = Math.round(a * 1000);
        graph.push(`[${i}:a]atrim=0:${(b - a).toFixed(2)},adelay=${ms}|${ms}[la${i}]`);
        audioClips.push(`[la${i}]`);
      }
    }

    // Text layers + translated subtitles, both through libass so Khmer is shaped correctly.
    const texts = (tpl?.layers ?? []).filter((L) => L.type === "text" && L.text?.trim());
    if (texts.length || options.subtitles?.length) {
      fs.writeFileSync(path.join(workDir, "subtitles.ass"), buildAss({
        cues: options.subtitles ?? [], width: size.w, height: size.h, font: subtitleFont(options.language), textLayers: texts, duration,
      }), "utf8");
      // Relative names + cwd avoid Windows drive-letter escaping inside the filter string.
      const fontsRel = path.relative(workDir, FONTS_DIR).split(path.sep).join("/");
      step(`ass=subtitles.ass:fontsdir='${fontsRel}':shaping=complex`);
    }

    let audioMap = ["-map", "1:a:0?"];
    if (audioClips.length) {
      graph.push(`[1:a]${audioClips.join("")}amix=inputs=${audioClips.length + 1}:duration=first:normalize=0[aout]`);
      audioMap = ["-map", "[aout]"];
    }

    const trim = options.trimSec ? ["-t", String(options.trimSec)] : [];
    const video = graph.length
      ? ["-filter_complex", graph.join(";"), "-map", v, "-c:v", "libx264", "-preset", "fast", "-crf", "21", "-pix_fmt", "yuv420p"]
      : ["-map", "0:v:0", "-c:v", "copy"];
    await run([...inputs, ...trim, ...video, ...audioMap, "-c:a", "aac", "-b:a", "192k", "-t", String(duration.toFixed(3)), "-movflags", "+faststart", path.basename(outputPath)], workDir);
  }
}

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

/** Font for a template text, picked from the characters it uses. */
function fontForText(text: string): string {
  if (/[ក-៿]/.test(text)) return "Noto Sans Khmer";
  if (/[຀-໿]/.test(text)) return "Leelawadee UI";
  if (/[က-႟]/.test(text)) return "Myanmar Text";
  if (/[぀-ヿ]/.test(text)) return "Yu Gothic";
  if (/[가-힯]/.test(text)) return "Malgun Gothic";
  if (/[一-鿿]/.test(text)) return "Microsoft YaHei";
  return "Segoe UI";
}

const assTime = (s: number) => {
  const cs = Math.max(0, Math.round(s * 100));
  const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), sec = Math.floor((cs % 6000) / 100), c = cs % 100;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
};
const clean = (s: string) => s.replace(/[{}]/g, "").replace(/\r?\n/g, "\\N");
const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0").toUpperCase();

// Text layer styles from the prototype: dark = white on rgba(0,0,0,.66), light = #111 on white, brand = #1A1200 on #FFB020.
// Colours are written as RGB here and converted to ASS order (&HBBGGRR) below.
const TEXT_STYLE: Record<string, { text: string; box: string; boxOpacity: number }> = {
  dark: { text: "FFFFFF", box: "000000", boxOpacity: 0.66 },
  light: { text: "111111", box: "FFFFFF", boxOpacity: 1 },
  brand: { text: "1A1200", box: "FFB020", boxOpacity: 1 },
};
const bgr = (rgb: string) => rgb.slice(4, 6) + rgb.slice(2, 4) + rgb.slice(0, 2);

/** Translated subtitles (bottom centre) and template text layers (placed like in the editor). */
export function buildAss(o: { cues: SubtitleCue[]; width: number; height: number; font?: string; textLayers?: TemplateLayer[]; duration?: number }): string {
  const size = Math.round(o.height * 0.048);
  const margin = Math.round(o.height * 0.06);
  const lines = [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${o.width}`, `PlayResY: ${o.height}`, "WrapStyle: 2", "ScaledBorderAndShadow: yes", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,${o.font ?? "Noto Sans Khmer"},${size},&H00FFFFFF,&H00FFFFFF,&H64000000,&H64000000,0,0,0,0,100,100,0,0,3,${Math.max(2, Math.round(size * 0.22))},0,2,${margin},${margin},${margin},1`,
    `Style: Layer,Segoe UI,${size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,3,4,0,7,0,0,0,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  for (const L of o.textLayers ?? []) {
    const [a, b] = layerSpan(L, o.duration ?? 36000);
    if (b <= a) continue;
    const st = TEXT_STYLE[L.style ?? "dark"] ?? TEXT_STYLE.dark;
    const fs = Math.max(8, Math.round((L.w * 0.07 / 100) * o.width)); // same as the editor: w × 0.07 cqw
    const pad = Math.round(fs * 0.45);
    const op = L.op / 100;
    const x = Math.round((L.x / 100) * o.width + pad), y = Math.round((L.y / 100) * o.height + pad);
    const textAlpha = hex2((1 - op) * 255), boxAlpha = hex2((1 - op * st.boxOpacity) * 255);
    const tags = `{\\an7\\pos(${x},${y})\\fn${fontForText(L.text ?? "")}\\fs${fs}\\bord${pad}\\1c&H${bgr(st.text)}&\\3c&H${bgr(st.box)}&\\1a&H${textAlpha}&\\3a&H${boxAlpha}&}`;
    lines.push(`Dialogue: 1,${assTime(a)},${assTime(b)},Layer,,0,0,0,,${tags}${clean(L.text ?? "")}`);
  }
  for (const c of o.cues) {
    if (!c.text.trim()) continue;
    lines.push(`Dialogue: 0,${assTime(c.start)},${assTime(Math.max(c.end, c.start + 0.8))},Default,,0,0,0,,${clean(c.text)}`);
  }
  lines.push("");
  return lines.join("\n");
}
