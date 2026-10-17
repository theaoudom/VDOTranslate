import "server-only";
import fs from "fs";
import path from "path";
import { fal } from "@fal-ai/client";
import type { ModelTier, MovieRatio } from "@/domain/movie/Movie";
import { BlockedContentError, type IMovieMedia, type ShotCheck } from "@/domain/movie/ports";

/*
 * Pictures and video clips through fal.ai (FAL_KEY). One account reaches every model,
 * so a tier can move to a cheaper model by changing one line below.
 */
const PORTRAIT = "fal-ai/flux-2";
/** first frames from the people's pictures: Nano Banana keeps faces closest */
const FRAME = "fal-ai/nano-banana-2/edit";

type Builder = (a: { prompt: string; image: string; sec: number; ratio: MovieRatio }) => Record<string, unknown>;
const veo: Builder = ({ prompt, image, sec, ratio }) => ({ prompt, image_url: image, duration: `${sec}s`, aspect_ratio: ratio, resolution: "720p", generate_audio: true });
const VIDEO: Record<ModelTier, { endpoint: string; input: Builder }> = {
  draft: { endpoint: "fal-ai/veo3.1/lite/image-to-video", input: veo },
  standard: { endpoint: "alibaba/wan-3.0/image-to-video", input: ({ prompt, image, sec, ratio }) => ({ prompt, start_image_url: image, duration: sec, aspect_ratio: ratio, resolution: "720p", audio: true }) },
  action: { endpoint: "fal-ai/kling-video/v3/pro/image-to-video", input: ({ prompt, image, sec }) => ({ prompt, start_image_url: image, duration: String(sec), generate_audio: true }) },
  lead: { endpoint: "bytedance/seedance-2.0/image-to-video", input: ({ prompt, image, sec, ratio }) => ({ prompt, image_url: image, duration: String(sec), aspect_ratio: ratio, resolution: "720p", generate_audio: true }) },
  cinematic: { endpoint: "fal-ai/veo3.1/image-to-video", input: veo },
};

/** Our fal.ai account problems (no balance, bad key) — for the server log, not the customer. */
function explain(e: unknown) {
  const body = JSON.stringify((e as { body?: unknown })?.body ?? "");
  if (/exhausted balance|locked/i.test(body)) console.error("[fal] The fal.ai account is out of balance. Top up at fal.ai/dashboard/billing.");
  else if ((e as { status?: number })?.status === 401) console.error("[fal] FAL_KEY was refused. Check the key in .env.local / Vercel.");
}

/** Reference mode: the video model sees the people's photos directly (no first frame). */
type RefBuilder = (a: { prompt: string; refs: string[]; sec: number; ratio: MovieRatio }) => Record<string, unknown>;
const REFERENCE: Partial<Record<ModelTier, { endpoint: string; input: RefBuilder }>> = {
  standard: {
    endpoint: "alibaba/wan-3.0/reference-to-video",
    input: ({ prompt, refs, sec, ratio }) => ({ prompt: `${prompt} The people are the people in the reference images: keep their faces, hair and skin exactly.`, reference_image_urls: refs, duration: sec, aspect_ratio: ratio, resolution: "720p", audio: true }),
  },
  lead: {
    endpoint: "bytedance/seedance-2.0/reference-to-video",
    input: ({ prompt, refs, sec, ratio }) => ({ prompt: `The people are ${refs.map((_, i) => `@Image${i + 1}`).join(" and ")}; keep their faces exactly. ${prompt}`, image_urls: refs, duration: String(sec), aspect_ratio: ratio, resolution: "720p", generate_audio: true }),
  },
};

let configured = false;
function client() {
  if (!configured) {
    if (!process.env.FAL_KEY) throw new Error("FAL_KEY is missing.");
    fal.config({ credentials: process.env.FAL_KEY });
    configured = true;
  }
  return fal;
}

/** fal reports refused content as a 422 / "content policy" / safety error. */
function isBlocked(e: unknown) {
  const err = e as { status?: number; body?: unknown; message?: string };
  const text = `${err?.message ?? ""} ${JSON.stringify(err?.body ?? "")}`.toLowerCase();
  const blocked = /content[ _-]?policy|safety|nsfw|moderation|prohibited|sensitive|not allowed|flagged/.test(text);
  if (blocked) console.warn("[fal] refused by the model's content filter:", text.slice(0, 400));
  return blocked;
}

async function upload(file: string): Promise<string> {
  const type = /\.png$/i.test(file) ? "image/png" : /\.webp$/i.test(file) ? "image/webp" : "image/jpeg";
  return client().storage.upload(new Blob([new Uint8Array(fs.readFileSync(file))], { type }));
}

async function download(url: string, outPath: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't download the result (${res.status})`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
}

async function image(endpoint: string, input: Record<string, unknown>, outPath: string) {
  try {
    const { data } = await client().subscribe(endpoint, { input });
    const d = data as { images?: { url: string }[]; has_nsfw_concepts?: boolean[] };
    if (d.has_nsfw_concepts?.[0]) throw new BlockedContentError("The picture was blocked by the safety filter.");
    if (!d.images?.[0]?.url) throw new Error("No picture came back.");
    await download(d.images[0].url, outPath);
  } catch (e) {
    if (e instanceof BlockedContentError) throw e;
    if (isBlocked(e)) throw new BlockedContentError("The picture was blocked by the safety filter.");
    explain(e);
    throw e;
  }
}

export class FalMovieMedia implements IMovieMedia {
  async portrait(prompt: string, outPath: string) {
    await image(PORTRAIT, { prompt, image_size: "square_hd", output_format: "jpeg", enable_safety_checker: true }, outPath);
  }

  async frame(prompt: string, references: string[], ratio: MovieRatio, outPath: string) {
    const size = ratio === "9:16" ? "portrait_16_9" : "landscape_16_9";
    if (!references.length) {
      await image(PORTRAIT, { prompt, image_size: size, output_format: "jpeg", enable_safety_checker: true }, outPath);
      return;
    }
    const urls = await Promise.all(references.slice(0, 4).map(upload));
    await image(FRAME, { prompt, image_urls: urls, aspect_ratio: ratio, resolution: "1K", output_format: "jpeg" }, outPath);
  }

  usesReferences(tier: ModelTier) {
    return Boolean(REFERENCE[tier]);
  }

  async startShot(tier: ModelTier, prompt: string, framePath: string | null, sec: number, ratio: MovieRatio, references: string[]) {
    const ref = REFERENCE[tier];
    try {
      if (ref && references.length) {
        const refs = await Promise.all(references.slice(0, 4).map(upload));
        const { request_id } = await client().queue.submit(ref.endpoint, { input: ref.input({ prompt, refs, sec, ratio }) });
        return `ref|${request_id}`;
      }
      const m = VIDEO[tier];
      const imageUrl = await upload(framePath!);
      const { request_id } = await client().queue.submit(m.endpoint, { input: m.input({ prompt, image: imageUrl, sec, ratio }) });
      return request_id;
    } catch (e) {
      if (isBlocked(e)) throw new BlockedContentError("The shot was blocked by the safety filter.");
      explain(e);
      throw e;
    }
  }

  async checkShot(tier: ModelTier, requestId: string, outPath: string): Promise<ShotCheck> {
    const isRef = requestId.startsWith("ref|");
    const m = isRef ? REFERENCE[tier]! : VIDEO[tier];
    requestId = isRef ? requestId.slice(4) : requestId;
    const st = await client().queue.status(m.endpoint, { requestId, logs: false });
    if (st.status !== "COMPLETED") return { state: "running" };
    try {
      const { data } = await client().queue.result(m.endpoint, { requestId });
      const url = (data as { video?: { url?: string } }).video?.url;
      if (!url) return { state: "failed", reason: "No video came back." };
      await download(url, outPath);
      return { state: "done", file: outPath };
    } catch (e) {
      if (isBlocked(e)) return { state: "blocked", reason: "Blocked by the safety filter." };
      return { state: "failed", reason: e instanceof Error ? e.message.slice(0, 200) : "The model failed." };
    }
  }
}
