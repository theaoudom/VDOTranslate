"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FolderOpen, Upload } from "lucide-react";
import { estimateDub } from "@/domain/billing/estimate";
import { PLANS, RATES, type PlanId, type VoiceKind } from "@/domain/billing/pricing";
import { fmt, LANG_OPTIONS, VOICE_INFO, VOICE_ORDER } from "./format";
import { UploadDrop } from "./UploadDrop";

export type VoiceLanguages = { natural: string[]; cloned: string[] };

/** Natural and own voices only speak some languages (own voice: not Khmer yet). */
export function voicesFor(langs: VoiceLanguages, lang: string): Record<VoiceKind, boolean> {
  return { standard: true, natural: langs.natural.includes(lang), cloned: langs.cloned.includes(lang) };
}

/** Explains why a voice card is greyed out for this language. */
export function voiceHint(langs: VoiceLanguages, lang: string) {
  const name = (LANG_OPTIONS.find((l) => l.code === lang)?.label ?? lang).split(" (")[0];
  const v = voicesFor(langs, lang);
  if (!v.natural && !v.cloned) return langs.natural.length || langs.cloned.length ? `Natural and own voices don’t speak ${name} yet.` : "Natural and own-voice dubbing aren’t switched on for this site yet.";
  if (!v.cloned) return langs.cloned.length ? `Their own voice doesn’t speak ${name} yet.` : null;
  if (!v.natural) return langs.natural.length ? `The natural voice doesn’t speak ${name} yet.` : null;
  return null;
}

export function defaultVoice(planId: PlanId, available: Record<VoiceKind, boolean>): VoiceKind {
  if (PLANS[planId].clone && available.cloned) return "cloned";
  if (available.natural) return "natural";
  return "standard";
}

export function StartCard({ plan, voiceLanguages }: { plan: PlanId; voiceLanguages: VoiceLanguages }) {
  const router = useRouter();
  const p = PLANS[plan];
  const [to, setTo] = useState("km");
  const available = voicesFor(voiceLanguages, to);
  const [voice, setVoice] = useState<VoiceKind>(defaultVoice(plan, available));
  useEffect(() => { if (!voicesFor(voiceLanguages, to)[voice]) setVoice("standard"); }, [to, voice, voiceLanguages]);
  const perMin = estimateDub(60, { voice, keepBackground: false, burnSubtitles: true, blurSubtitles: false }, plan).total;

  return (
    <div className="panel start-card">
      <UploadDrop className="drop" onUploaded={(v) => router.push(`/app/new?upload=${v.uploadId}&to=${to}&voice=${voice}`)}>
        <span className="ic-box" style={{ width: 44, height: 44, margin: 0 }}><Upload style={{ width: 20, height: 20 }} /></span>
        <div className="t-h3">Translate a video</div>
        <div className="t-small muted">Drop it here or choose a file. MP4, MOV or WEBM, up to {p.maxMin} min on {p.name}.</div>
        <span className="btn primary"><FolderOpen />Choose video</span>
      </UploadDrop>
      <div className="quick">
        <span className="eyebrow">Translate to</span>
        <select className="select" aria-label="Translate to" value={to} onChange={(e) => setTo(e.target.value)}>
          {LANG_OPTIONS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
        <span className="eyebrow" style={{ marginTop: "var(--sp-2)" }}>Voice</span>
        <div className="vlist">
          {VOICE_ORDER.map((k) => {
            const locked = k === "cloned" && !p.clone;
            const off = !available[k];
            return (
              <button key={k} className="opt" aria-pressed={voice === k} disabled={locked || off} onClick={() => setVoice(k)}>
                <span className="t">{VOICE_INFO[k].name}
                  {k === "cloned" && !off && (locked ? <span className="badge accent">Creator+</span> : <span className="badge ok">Best match</span>)}
                  {off && <span className="badge">Not available yet</span>}
                </span>
                <span className="p">{RATES.voice[k]} cr / min of voice</span>
              </button>
            );
          })}
        </div>
        {voiceHint(voiceLanguages, to) && <span className="hint">{voiceHint(voiceLanguages, to)}</span>}
        <span className="faint t-xs">About {fmt(perMin)} cr per minute of video. You’ll see the exact price before it starts.</span>
      </div>
    </div>
  );
}
