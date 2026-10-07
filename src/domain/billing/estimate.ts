import { BUFFER, PLANS, RATES, type PlanId, type VoiceKind } from "./pricing";

export interface DubOptions {
  voice: VoiceKind;
  keepBackground: boolean;
  burnSubtitles: boolean;
  blurSubtitles: boolean;
}

export interface EstimateLine {
  label: string;
  detail: string;
  credits: number;
}

export interface DubEstimate {
  sec: number;
  lines: EstimateLine[];
  subtotal: number;
  buffer: number;
  total: number;
  /** The video (after trimming) is longer than the plan allows. */
  overLength: boolean;
}

const VOICE_NAME: Record<VoiceKind, string> = { cloned: "Their own voice", natural: "Natural AI voice", standard: "Standard AI voice" };
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * Credits to hold before a translation starts (same math as the confirmed prototype):
 * every step is charged per minute of video, rounded up, plus a 10% buffer.
 */
export function estimateDub(durationSec: number, opts: DubOptions, planId: PlanId, trimSec?: number | null): DubEstimate {
  const plan = PLANS[planId];
  const sec = trimSec ? Math.min(durationSec, trimSec) : durationSec;
  const min = sec / 60;
  const vr = RATES.voice[opts.voice];
  const lines: EstimateLine[] = [
    { label: "Transcription & speakers", detail: `${min.toFixed(1)} min × ${RATES.transcribe} cr`, credits: Math.ceil(min * RATES.transcribe) },
    { label: "Translation", detail: `about ${fmt(min * 150)} words`, credits: Math.ceil(min * RATES.translate) },
    { label: "Voices", detail: `${min.toFixed(1)} min × ${vr} cr · ${VOICE_NAME[opts.voice]}`, credits: Math.ceil(min * vr) },
  ];
  if (opts.keepBackground) {
    lines.push({ label: "Keep background sound", detail: `separate voices from music · ${min.toFixed(1)} min × ${RATES.separate} cr`, credits: Math.ceil(min * RATES.separate) });
  }
  lines.push({
    label: "Render",
    detail: plan.res + (opts.burnSubtitles ? " + subtitles" : "") + (opts.blurSubtitles ? " + blur old subtitles" : ""),
    credits: Math.ceil(min * RATES.render),
  });
  const subtotal = lines.reduce((a, l) => a + l.credits, 0);
  const buffer = Math.ceil(subtotal * BUFFER);
  return { sec, lines, subtotal, buffer, total: subtotal + buffer, overLength: min > plan.maxMin + 1e-9 };
}

/**
 * What a finished translation really costs: the same per-minute rates on the seconds
 * processed, but voices are charged only for the time people actually speak.
 * Never more than the subtotal that was held.
 */
export function actualDubCost(processedSec: number, speechSec: number, opts: DubOptions, heldSubtotal: number): number {
  const min = processedSec / 60;
  const voiced = Math.min(speechSec, processedSec) / 60;
  const cost =
    Math.ceil(min * RATES.transcribe) +
    Math.ceil(min * RATES.translate) +
    Math.ceil(voiced * RATES.voice[opts.voice]) +
    (opts.keepBackground ? Math.ceil(min * RATES.separate) : 0) +
    Math.ceil(min * RATES.render);
  return Math.min(cost, heldSubtotal);
}

/** Longest start of the video (in 5-second steps) whose estimate fits the balance. */
export function maxAffordableSec(durationSec: number, opts: DubOptions, planId: PlanId, credits: number): number {
  for (let s = Math.floor(durationSec / 5) * 5; s >= 5; s -= 5) {
    if (estimateDub(durationSec, opts, planId, s).total <= credits) return s;
  }
  return 0;
}

/** Fixed price for re-voicing one corrected line. */
export const REVOICE_LINE_CREDITS = 1;
