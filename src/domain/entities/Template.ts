export type FrameRatio = "16:9" | "9:16" | "1:1";
export type LayerType = "image" | "video" | "text";

/**
 * One thing placed on the video. Position and size are percentages of the output frame
 * (x, y = top-left corner; w = width, or text size for text layers).
 */
export interface TemplateLayer {
  id: string;
  type: LayerType;
  name: string;
  x: number;
  y: number;
  w: number;
  /** opacity 10–100 */
  op: number;
  /** "all" = whole video; "part" = between `from` and `to` */
  range: "all" | "part";
  /** count `from`/`to` from the start of the video, or as seconds before the end */
  anchor: "start" | "end";
  from: number;
  to: number;
  /** uploaded image / video clip (asset id) */
  asset?: string | null;
  /** width ÷ height of the asset */
  ar: number;
  text?: string | null;
  style?: "dark" | "light" | "brand";
  /** play the video clip's own sound */
  sound?: boolean;
}

export interface Template {
  id: string;
  userId: string;
  name: string;
  ratio: FrameRatio;
  /** crop position 0–100 when the video doesn't fit the frame */
  pan: number;
  layers: TemplateLayer[];
  createdAt: Date;
  updatedAt: Date;
}

/** Start and end (seconds) of a layer on a video of `duration` seconds. */
export function layerSpan(L: Pick<TemplateLayer, "range" | "anchor" | "from" | "to">, duration: number): [number, number] {
  if (L.range !== "part") return [0, duration];
  let a = L.anchor === "end" ? duration - L.from : L.from;
  let b = L.anchor === "end" ? duration - L.to : L.to;
  a = Math.max(0, Math.min(duration, a));
  b = Math.max(a, Math.min(duration, b));
  return [a, b];
}

/** Output size for a frame ratio, keeping the source's quality where possible. */
export function frameSize(ratio: FrameRatio, srcW: number, srcH: number): { w: number; h: number } {
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  if (ratio === "16:9") return srcW / srcH >= 16 / 9 - 0.01 ? { w: even(Math.min(srcW, 1920)), h: even(Math.min(srcW, 1920) * 9 / 16) } : { w: 1920, h: 1080 };
  if (ratio === "9:16") return { w: 1080, h: 1920 };
  return { w: 1080, h: 1080 };
}

export const TEXT_STYLES = ["dark", "light", "brand"] as const;

/** Keeps only valid, bounded values (input comes from the browser). */
export function sanitizeLayers(input: unknown): TemplateLayer[] {
  if (!Array.isArray(input)) return [];
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  return input.slice(0, 30).flatMap((raw): TemplateLayer[] => {
    const l = raw as Partial<TemplateLayer>;
    if (!l || !["image", "video", "text"].includes(l.type as string)) return [];
    return [{
      id: String(l.id ?? "").slice(0, 40) || Math.random().toString(36).slice(2),
      type: l.type as LayerType,
      name: String(l.name ?? "Layer").slice(0, 60),
      x: num(l.x, 0, 100, 5), y: num(l.y, 0, 100, 5), w: num(l.w, 2, 100, 20), op: num(l.op, 10, 100, 100),
      range: l.range === "part" ? "part" : "all",
      anchor: l.anchor === "end" ? "end" : "start",
      from: num(l.from, 0, 36000, 0), to: num(l.to, 0, 36000, 10),
      asset: typeof l.asset === "string" && /^[0-9a-f-]{36}$/i.test(l.asset) ? l.asset : null,
      ar: num(l.ar, 0.05, 20, 1),
      text: l.type === "text" ? String(l.text ?? "").slice(0, 200) : null,
      style: TEXT_STYLES.includes(l.style as (typeof TEXT_STYLES)[number]) ? l.style : "dark",
      sound: Boolean(l.sound),
    }];
  });
}
