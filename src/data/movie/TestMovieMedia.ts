import "server-only";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import ffmpegPath from "ffmpeg-static";
import type { ModelTier, MovieRatio } from "@/domain/movie/Movie";
import { BlockedContentError, type IMovieMedia, type ShotCheck } from "@/domain/movie/ports";

/*
 * Free test mode (MOVIE_TEST_MODE=1): pictures and clips are made locally with ffmpeg
 * instead of by the AI models, so the whole flow can be tried without spending money.
 * Put "TEST-BLOCK" in a shot to see how a blocked shot behaves.
 */
const FFMPEG = ffmpegPath as unknown as string;
const run = (args: string[]) => new Promise<void>((resolve, reject) => {
  const p = spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], { windowsHide: true });
  let err = "";
  p.stderr.on("data", (d) => (err += d));
  p.on("error", reject);
  p.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`ffmpeg (test media) failed: ${err.slice(-300)}`))));
});
const hueOf = (s: string) => Array.from(s).reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
const size = (ratio: MovieRatio) => (ratio === "9:16" ? "720x1280" : "1280x720");
const color = (h: number) => {
  const f = (n: number) => { const k = (n + h / 30) % 12; const v = 0.45 - 0.3 * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(v * 255).toString(16).padStart(2, "0"); };
  return `0x${f(0)}${f(8)}${f(4)}`;
};

export class TestMovieMedia implements IMovieMedia {
  async portrait(prompt: string, outPath: string) {
    if (prompt.includes("TEST-BLOCK")) throw new BlockedContentError("The picture was blocked by the safety filter.");
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await run(["-f", "lavfi", "-i", `color=c=${color(hueOf(prompt))}:s=512x512`, "-vf", "vignette=PI/4", "-frames:v", "1", outPath]);
  }

  async frame(prompt: string, _refs: string[], ratio: MovieRatio, outPath: string) {
    if (prompt.includes("TEST-BLOCK")) throw new BlockedContentError("The picture was blocked by the safety filter.");
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await run(["-f", "lavfi", "-i", `color=c=${color(hueOf(prompt))}:s=${size(ratio)}`, "-vf", "vignette=PI/4", "-frames:v", "1", outPath]);
  }

  usesReferences() {
    return false;
  }

  async startShot(tier: ModelTier, prompt: string, _framePath: string | null, sec: number, ratio: MovieRatio) {
    if (prompt.includes("TEST-BLOCK")) throw new BlockedContentError("The shot was blocked by the safety filter.");
    return `test|${tier}|${sec}|${ratio}|${Date.now()}`;
  }

  async checkShot(_tier: ModelTier, requestId: string, outPath: string): Promise<ShotCheck> {
    const [, , sec, ratio, at] = requestId.split("|");
    if (Date.now() - Number(at) < 3000) return { state: "running" }; // pretend it takes a moment
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await run(["-f", "lavfi", "-i", `testsrc2=s=${size(ratio as MovieRatio)}:r=24:d=${sec}`, "-f", "lavfi", "-i", `sine=f=${220 + (hueOf(requestId) % 300)}:d=${sec}`,
      "-shortest", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", outPath]);
    return { state: "done", file: outPath };
  }
}
