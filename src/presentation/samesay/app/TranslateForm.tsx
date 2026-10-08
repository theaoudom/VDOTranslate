"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowUpCircle, ChevronDown, Coins, Mic, OctagonAlert, ReceiptText, RefreshCw, Scissors, SlidersHorizontal, Sparkles } from "lucide-react";
import { estimateDub, maxAffordableSec, type DubOptions } from "@/domain/billing/estimate";
import { PLANS, RATES, type PlanId, type VoiceKind } from "@/domain/billing/pricing";
import { useToast } from "../Toast";
import { CostTable, MeterAfter } from "./bits";
import { fmt, LANG_OPTIONS, mb, mmss, VOICE_INFO, VOICE_ORDER } from "./format";
import { defaultVoice, voiceHint, voicesFor, type VoiceLanguages } from "./StartCard";

export interface TranslateFormProps {
  upload: { uploadId: string; name: string; size: number; durationSec: number };
  plan: PlanId;
  credits: number;
  ready: boolean;
  available: { voiceLanguages: VoiceLanguages; background: boolean };
  initial: { to?: string; voice?: VoiceKind };
  templates: { id: string; name: string; ratio: string }[];
}

export function TranslateForm({ upload, plan, credits, ready, available, initial, templates }: TranslateFormProps) {
  const router = useRouter();
  const toast = useToast();
  const p = PLANS[plan];
  const [to, setTo] = useState(LANG_OPTIONS.some((l) => l.code === initial.to) ? initial.to! : "km");
  const voices = voicesFor(available.voiceLanguages, to);
  const voiceOk = (v?: VoiceKind) => v && voices[v] && (v !== "cloned" || p.clone);
  const [from, setFrom] = useState("auto");
  const [voice, setVoice] = useState<VoiceKind>(voiceOk(initial.voice) ? initial.voice! : defaultVoice(plan, voices));
  // switching to a language these voices can't speak falls back to the standard voice
  useEffect(() => { if (!voicesFor(available.voiceLanguages, to)[voice]) setVoice("standard"); }, [to, voice, available.voiceLanguages]);
  const [bg, setBg] = useState(available.background);
  const [subs, setSubs] = useState(true);
  const [blur, setBlur] = useState(false);
  const [trim, setTrim] = useState<number | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [starting, setStarting] = useState(false);

  const opts: DubOptions = { voice, keepBackground: bg, burnSubtitles: subs, blurSubtitles: blur };
  const e = estimateDub(upload.durationSec, opts, plan, trim);
  const short = e.total > credits;
  const blocked = e.overLength || short || !ready;
  const billingSoon = () => toast("Top-ups and plans are coming in the next update");

  async function start() {
    setStarting(true);
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadId: upload.uploadId, targetLanguage: to, sourceLanguage: from, voice, keepBackground: bg, burnSubtitles: subs, blurSubtitles: blur, trimSec: trim, templateId: templateId || undefined }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setStarting(false); toast(body.error ?? "Couldn’t start. Please try again.", true); return; }
    toast(`Started. ${fmt(body.held)} cr held.`);
    router.push(`/app/videos/${body.jobId}`);
    router.refresh();
  }

  let fixes = null;
  if (e.overLength) {
    fixes = (
      <>
        <div className="note rec"><OctagonAlert /><div><b>Too long for the {p.name} plan.</b> It handles videos up to {p.maxMin} min, and this one is {mmss(upload.durationSec)}.</div></div>
        <div className="stack" style={{ gap: 6 }}>
          <button className="btn block" onClick={() => setTrim(p.maxMin * 60)}><Scissors />Translate the first {p.maxMin}:00</button>
          <button className="btn block" onClick={billingSoon}><ArrowUpCircle />Upgrade plan</button>
        </div>
      </>
    );
  } else if (short && ready) {
    const alt = voice !== "standard" ? estimateDub(upload.durationSec, { ...opts, voice: "standard" }, plan, trim) : null;
    const fit = maxAffordableSec(upload.durationSec, opts, plan, credits);
    fixes = (
      <>
        <div className="note rec"><OctagonAlert /><div><b>Not enough credits.</b> You need {fmt(e.total)} and have {fmt(credits)}. Nothing has been charged.</div></div>
        <div className="stack" style={{ gap: 6 }}>
          {alt && alt.total <= credits && <button className="btn block" onClick={() => { setVoice("standard"); toast("Switched to standard voices"); }}><Mic />Use standard voice · {fmt(alt.total)} cr</button>}
          {fit >= 30 && <button className="btn block" onClick={() => { setTrim(fit); toast(`Only the first ${mmss(fit)} will be translated`); }}><Scissors />Translate the first {mmss(fit)}</button>}
          <button className="btn block" onClick={billingSoon}><Coins />Top up credits</button>
        </div>
      </>
    );
  }

  return (
    <section>
      <div className="page-head"><div><h1 className="t-h2">Translate video</h1><p className="sub">Choose a language and a voice. The price updates as you go.</p></div></div>
      <div className="grid g-2-1">
        <div className="stack">
          <div className="panel">
            <div className="row" style={{ border: 0 }}>
              <div className="thumb"><span className="dur">{mmss(upload.durationSec)}</span></div>
              <div className="main"><div className="title">{upload.name}</div><div className="meta">{mb(upload.size)} · {mmss(upload.durationSec)}</div></div>
              <Link className="btn ghost sm" href="/app/new"><RefreshCw />Replace</Link>
            </div>
          </div>
          <div className="panel">
            <div className="panel-body stack" style={{ gap: "var(--sp-5)" }}>
              <div className="field">
                <label className="label" htmlFor="d-to">Translate to</label>
                <select className="select select-lg" id="d-to" value={to} onChange={(ev) => setTo(ev.target.value)}>
                  {LANG_OPTIONS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </div>
              <div className="field">
                <span className="label">Voice</span>
                <div className="opts">
                  {VOICE_ORDER.map((k) => {
                    const locked = k === "cloned" && !p.clone;
                    const off = !voices[k];
                    return (
                      <button key={k} className="opt" aria-pressed={voice === k} disabled={locked || off} onClick={() => setVoice(k)}>
                        <span className="t">{VOICE_INFO[k].name}
                          {k === "cloned" && !off && (locked ? <span className="badge accent">Creator+</span> : <span className="badge ok">Best match</span>)}
                          {off && <span className="badge">Not available yet</span>}
                        </span>
                        <span className="d">{VOICE_INFO[k].desc}</span>
                        <span className="p">{RATES.voice[k]} cr per minute</span>
                      </button>
                    );
                  })}
                </div>
                {!p.clone && voices.cloned && <span className="hint">Their own voice comes with Creator and Studio. <a href="#" onClick={(ev) => { ev.preventDefault(); billingSoon(); }}>Compare plans</a></span>}
                {voiceHint(available.voiceLanguages, to) && <span className="hint">{voiceHint(available.voiceLanguages, to)}</span>}
              </div>
              <div className="field">
                <label className="label" htmlFor="d-tpl">Brand template</label>
                <select className="select" id="d-tpl" value={templateId} onChange={(ev) => setTemplateId(ev.target.value)}>
                  <option value="">None</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.ratio}</option>)}
                </select>
                <span className="hint">Adds your logo, text and clips to the translated video. <Link href="/app/templates">Edit templates</Link></span>
              </div>
              <details className="more">
                <summary><SlidersHorizontal />More options<span className="faint t-xs" style={{ fontWeight: 400 }}>spoken language, background, subtitles</span><ChevronDown /></summary>
                <div className="stack" style={{ paddingTop: "var(--sp-4)" }}>
                  <div className="field">
                    <label className="label" htmlFor="d-from">Spoken language</label>
                    <select className="select" id="d-from" value={from} onChange={(ev) => setFrom(ev.target.value)}>
                      <option value="auto">Auto-detect</option>
                      {LANG_OPTIONS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
                    </select>
                  </div>
                  <label className="switch" style={!available.background ? { opacity: 0.55 } : undefined}>
                    <input type="checkbox" checked={bg} disabled={!available.background} onChange={(ev) => setBg(ev.target.checked)} /><span className="track" />Keep background music and sounds
                    {!available.background && <span className="faint t-xs">· not available yet</span>}
                  </label>
                  <label className="switch"><input type="checkbox" checked={subs} onChange={(ev) => setSubs(ev.target.checked)} /><span className="track" />Add translated subtitles to the video</label>
                  <label className="switch"><input type="checkbox" checked={blur} onChange={(ev) => setBlur(ev.target.checked)} /><span className="track" />Blur the original subtitles</label>
                </div>
              </details>
            </div>
          </div>
        </div>
        <div className="panel sticky">
          <div className="panel-body stack">
            <div>
              <div className="muted t-small">Price</div>
              <div className="price-big">{fmt(e.total)} <span>credits</span></div>
              <div className="faint t-xs">{mmss(e.sec)}{trim ? " of " + mmss(upload.durationSec) : ""} of video · {VOICE_INFO[voice].name}</div>
            </div>
            <MeterAfter cost={e.total} credits={credits} cap={p.monthly} />
            <details className="more">
              <summary><ReceiptText />See breakdown<ChevronDown /></summary>
              <div style={{ paddingTop: "var(--sp-3)" }}>
                <CostTable lines={e.lines} total={e.total} buffer={e.buffer} label="Held now" />
              </div>
            </details>
            {trim && (
              <div className="note"><Scissors /><div>Only the first <b>{mmss(trim)}</b> will be translated. <button className="linkbtn" onClick={() => setTrim(null)}>Use the full video</button></div></div>
            )}
            {blocked ? fixes : (
              <>
                <p className="faint t-xs">We hold this while it runs. You pay only what it uses and the rest comes back.</p>
                <button className="btn primary block lg" onClick={start} disabled={starting}><Sparkles />{starting ? "Starting…" : "Translate now"}</button>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
