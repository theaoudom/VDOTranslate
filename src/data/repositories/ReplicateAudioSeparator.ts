import fs from "fs";
import path from "path";
import type { IAudioSeparator, SeparatedAudio } from "@/domain/repositories/IAudioSeparator";

// Demucs (htdemucs) on Replicate: https://replicate.com/ryan5453/demucs
// With isolate_stem "vocals" it returns { vocals, no_vocals } file URLs.
const DEMUCS_VERSION = "ff5ad47d2685b27c0f820ee134c4394140804f08fa755cb20c846459faa4b337";
const API = "https://api.replicate.com/v1";
const POLL_MS = 2000;
const TIMEOUT_MS = 15 * 60 * 1000;

export class ReplicateAudioSeparator implements IAudioSeparator {
  private readonly token = process.env.REPLICATE_API_TOKEN ?? "";

  get available() {
    return Boolean(this.token);
  }

  async separate(audioPath: string, outDir: string): Promise<SeparatedAudio> {
    if (!this.available) throw new Error("Background separation isn't set up (REPLICATE_API_TOKEN is missing).");

    const audioUrl = await this.upload(audioPath);
    let prediction = await this.request("POST", "/predictions", {
      version: DEMUCS_VERSION,
      input: { audio: audioUrl, isolate_stem: "vocals", format: "mp3" },
    });

    const started = Date.now();
    while (["starting", "processing"].includes(prediction.status)) {
      if (Date.now() - started > TIMEOUT_MS) throw new Error("Background separation took too long.");
      await new Promise((r) => setTimeout(r, POLL_MS));
      prediction = await this.request("GET", `/predictions/${prediction.id}`);
    }
    if (prediction.status !== "succeeded") {
      throw new Error(`Background separation failed: ${prediction.error ?? prediction.status}`);
    }

    const out = prediction.output as { vocals?: string; no_vocals?: string };
    if (!out?.vocals || !out?.no_vocals) throw new Error("Background separation returned no audio.");

    const vocalsPath = path.join(outDir, "vocals.mp3");
    const backgroundPath = path.join(outDir, "background.mp3");
    await Promise.all([this.download(out.vocals, vocalsPath), this.download(out.no_vocals, backgroundPath)]);
    return { vocalsPath, backgroundPath };
  }

  private async upload(filePath: string): Promise<string> {
    const form = new FormData();
    form.append("content", new Blob([fs.readFileSync(filePath)], { type: "audio/mpeg" }), path.basename(filePath));
    const res = await fetch(`${API}/files`, { method: "POST", headers: { Authorization: `Bearer ${this.token}` }, body: form });
    if (!res.ok) throw new Error(`Couldn't upload audio for separation (${res.status}): ${await res.text()}`);
    const file = await res.json();
    return file.urls.get as string;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async request(method: "GET" | "POST", url: string, body?: unknown): Promise<any> {
    const res = await fetch(API + url, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Replicate ${method} ${url} failed (${res.status}): ${await res.text()}`);
    return res.json();
  }

  private async download(url: string, to: string) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${this.token}` } });
    if (!res.ok) throw new Error(`Couldn't download separated audio (${res.status}).`);
    fs.writeFileSync(to, Buffer.from(await res.arrayBuffer()));
  }
}
