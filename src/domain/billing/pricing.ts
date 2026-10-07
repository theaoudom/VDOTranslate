// Credit pricing for Samesay. Rates are credits per minute of video and follow
// what each AI step really costs. Values come from the confirmed prototype and
// are placeholders until real prices are decided.

export type VoiceKind = "cloned" | "natural" | "standard";
export type PlanId = "free" | "creator" | "studio";

export const RATES = {
  transcribe: 1,
  translate: 1,
  render: 1,
  separate: 1,
  voice: { cloned: 30, natural: 25, standard: 4 } as Record<VoiceKind, number>,
  splitCut: 0.2,
  splitEncode: 1,
};

/** Translation jobs hold the estimate plus this buffer and return what isn't used. */
export const BUFFER = 0.1;

export interface Plan {
  id: PlanId;
  name: string;
  price: number;
  monthly: number;
  /** true when the credits are given once instead of every month */
  once?: boolean;
  maxMin: number;
  res: "720p" | "1080p";
  clone: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
  free: { id: "free", name: "Free", price: 0, monthly: 60, once: true, maxMin: 5, res: "720p", clone: false },
  creator: { id: "creator", name: "Creator", price: 12, monthly: 1500, maxMin: 30, res: "1080p", clone: true },
  studio: { id: "studio", name: "Studio", price: 39, monthly: 6000, maxMin: 120, res: "1080p", clone: true },
};

export const PLAN_ORDER: PlanId[] = ["free", "creator", "studio"];

export const PACKS = [
  { cr: 500, price: 5 },
  { cr: 1500, price: 14 },
  { cr: 5000, price: 42 },
];

/** Credits per minute of a translation (with buffer), without background separation. */
export function dubCreditsPerMinute(voice: VoiceKind): number {
  return (RATES.transcribe + RATES.translate + RATES.voice[voice] + RATES.render) * (1 + BUFFER);
}

/** Rows of the "What things cost" table, in display order. */
export function rateRows(): [string, number][] {
  return [
    ["Transcription and speaker detection", RATES.transcribe],
    ["Translation", RATES.translate],
    ["Standard AI voices", RATES.voice.standard],
    ["Natural AI voices", RATES.voice.natural],
    ["Their own voice (cloning)", RATES.voice.cloned],
    ["Keep background music and sounds", RATES.separate],
    ["Render (dubbed video, logo, subtitles)", RATES.render],
    ["Auto-split, cut only", RATES.splitCut],
    ["Auto-split with reframe, labels or logo", RATES.splitEncode],
  ];
}
