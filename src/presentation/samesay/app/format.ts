import { SUPPORTED_LANGUAGES } from "@/domain/entities/Language";
import type { VoiceKind } from "@/domain/billing/pricing";

export const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

export function mmss(s: number) {
  s = Math.max(0, Math.round(s));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

export function tcode(s: number) {
  const m = Math.floor(s / 60), x = Math.floor(s % 60), c = Math.floor((s % 1) * 100);
  return String(m).padStart(2, "0") + ":" + String(x).padStart(2, "0") + "." + String(c).padStart(2, "0");
}

export const mb = (b: number) => (b / 1048576).toFixed(1) + " MB";
export const code = (l: string | null) => (l ? l.toUpperCase() : "AUTO");

export const VOICE_INFO: Record<VoiceKind, { name: string; desc: string }> = {
  cloned: { name: "Their own voice", desc: "Each speaker keeps their real voice. Closest to the original." },
  natural: { name: "Natural AI voice", desc: "Human-like voices with emotion" },
  standard: { name: "Standard AI voice", desc: "Clear voices, male or female per speaker" },
};
export const VOICE_ORDER: VoiceKind[] = ["cloned", "natural", "standard"];

/** "Khmer (ភាសាខ្មែរ)" style labels, like the prototype. */
export const LANG_OPTIONS = SUPPORTED_LANGUAGES.map((l) => ({
  code: l.code,
  label: l.nativeName && l.nativeName !== l.name ? `${l.name} (${l.nativeName})` : l.name,
}));

export function relativeDay(d: Date) {
  const now = new Date();
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (d.toDateString() === now.toDateString()) return "Today " + time;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Yesterday " + time;
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit" });
}
