import { RATES } from "@/domain/billing/pricing";

/** Cutting one long video into parts for social media. */
export type SplitPresetId = "tiktok" | "reels" | "shorts" | "facebook" | "custom";

export const SPLIT_PRESETS: Record<SplitPresetId, { name: string; len: number }> = {
  tiktok: { name: "TikTok", len: 60 },
  reels: { name: "Reels", len: 90 },
  shorts: { name: "Shorts", len: 60 },
  facebook: { name: "Facebook", len: 180 },
  custom: { name: "Custom", len: 45 },
};
export const SPLIT_PRESET_ORDER: SplitPresetId[] = ["tiktok", "reels", "shorts", "facebook", "custom"];

export interface SplitSettings {
  preset: SplitPresetId;
  /** "length" = every part up to `len` seconds; "count" = `count` equal parts */
  mode: "length" | "count";
  len: number;
  count: number;
  /** move each cut up to 4 s earlier so it lands on a pause */
  silence: boolean;
  /** crop to vertical 9:16 */
  reframe: boolean;
  /** "Part 1/12" on each part */
  label: boolean;
}

export const DEFAULT_SPLIT: SplitSettings = { preset: "tiktok", mode: "length", len: 60, count: 10, silence: true, reframe: true, label: true };

export interface SplitPart {
  from: number;
  to: number;
  /** storage key once made */
  file?: string;
}

/** What a split job remembers. */
export type SplitJob = SplitSettings & { parts: SplitPart[] };

export const MAX_PARTS = 50;
/** How far a cut may move to land on a pause. */
export const PAUSE_SHIFT = 4;

/** Clean up settings that came from the browser. */
export function sanitizeSplit(s: Partial<SplitSettings> | null | undefined): SplitSettings {
  const d = DEFAULT_SPLIT;
  const preset = s?.preset && s.preset in SPLIT_PRESETS ? s.preset : d.preset;
  return {
    preset,
    mode: s?.mode === "count" ? "count" : "length",
    len: Math.max(10, Math.min(600, Math.round(Number(s?.len) || SPLIT_PRESETS[preset].len))),
    count: Math.max(2, Math.min(MAX_PARTS, Math.round(Number(s?.count) || d.count))),
    silence: s?.silence ?? d.silence,
    reframe: s?.reframe ?? d.reframe,
    label: s?.label ?? d.label,
  };
}

/** Where the cuts go before looking for pauses. */
export function planParts(durationSec: number, s: SplitSettings): SplitPart[] {
  const dur = Math.max(0, durationSec);
  const n = s.mode === "count" ? s.count : Math.min(MAX_PARTS, Math.max(1, Math.ceil(dur / s.len - 1e-6)));
  const len = s.mode === "count" ? dur / n : Math.max(dur / MAX_PARTS, s.len);
  const parts: SplitPart[] = [];
  for (let i = 0; i < n; i++) parts.push({ from: i * len, to: i === n - 1 ? dur : Math.min(dur, (i + 1) * len) });
  return parts.filter((p) => p.to - p.from > 0.05);
}

/**
 * Moves each cut to the middle of a pause that ends at most PAUSE_SHIFT seconds before it
 * (cutting earlier keeps parts within the platform's length), so nobody is cut off mid-word.
 */
export function snapToPauses(parts: SplitPart[], pauses: { start: number; end: number }[]): SplitPart[] {
  const out = parts.map((p) => ({ ...p }));
  for (let i = 0; i < out.length - 1; i++) {
    const cut = out[i].to;
    const minCut = out[i].from + 1; // keep every part at least a second long
    let best: number | null = null;
    for (const s of pauses) {
      const mid = (s.start + s.end) / 2;
      const at = Math.min(mid, cut);
      if (s.start <= cut && at >= cut - PAUSE_SHIFT && at > minCut && (best == null || at > best)) best = at;
    }
    if (best != null) {
      out[i].to = best;
      out[i + 1].from = best;
    }
  }
  return out;
}

/** Re-encoding is needed for 9:16, part labels or a template; otherwise parts are plain cuts. */
export const splitNeedsEncode = (s: Pick<SplitSettings, "reframe" | "label">, hasTemplate: boolean) => s.reframe || s.label || hasTemplate;

/** Fixed price of a split, charged when it's done (held while it runs). */
export function splitEstimate(durationSec: number, s: Pick<SplitSettings, "reframe" | "label">, hasTemplate: boolean) {
  const encode = splitNeedsEncode(s, hasTemplate);
  const min = durationSec / 60;
  const rate = encode ? RATES.splitEncode : RATES.splitCut;
  const extras = [s.reframe && "reframe 9:16", s.label && "part labels", hasTemplate && "template"].filter(Boolean).join(", ");
  const total = Math.max(1, Math.ceil(min * rate));
  return {
    encode,
    total,
    lines: [{ label: encode ? "Cut and re-encode" : "Cut only", detail: `${min.toFixed(1)} min × ${rate} cr${encode && extras ? " · " + extras : ""}`, credits: total }],
  };
}
