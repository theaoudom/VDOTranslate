"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Clapperboard, Heart, Images, LoaderCircle, OctagonAlert, ShieldCheck, WandSparkles } from "lucide-react";
import { CLIP_CONSENT, CLIP_LENGTHS, CLIP_SCENES, CLIP_MODELS, fitDuration, MODELS, MOVIE_COST, STYLES, type ModelTier, type MovieRatio, type MovieStyle } from "@/domain/movie/Movie";
import { useToast } from "../../Toast";
import { CostTable } from "../bits";
import { fmt } from "../format";
import { sendFile } from "../sendFile";
import { useOpenSettings } from "../Settings";
import { api } from "./parts";

export type MakeMode = "template" | "clip" | "movie";

/** "What do you want to make?": Template, Quick clip or Movie. */
export function ModeSwitch({ mode, onChange }: { mode: MakeMode; onChange: (m: MakeMode) => void }) {
  return (
    <div className="panel" style={{ marginBottom: "var(--sp-4)" }}><div className="panel-body"><div className="field">
      <span className="label">What do you want to make?</span>
      <div className="opts">
        <button className="opt" aria-pressed={mode === "template"} onClick={() => onChange("template")}><span className="t"><Images />Template</span><span className="d">Pick a ready-made video and add your photos. Nothing to write.</span><span className="p">from {fmt(4 * MODELS.draft.rate)} cr</span></button>
        <button className="opt" aria-pressed={mode === "clip"} onClick={() => onChange("clip")}><span className="t"><WandSparkles />Quick clip</span><span className="d">One short video from your photos and one sentence.</span><span className="p">from {fmt(4 * MODELS.draft.rate)} cr</span></button>
        <button className="opt" aria-pressed={mode === "movie"} onClick={() => onChange("movie")}><span className="t"><Clapperboard />Movie</span><span className="d">A story with scenes, characters and shots.</span><span className="p">from about {fmt(10 * MODELS.draft.rate * 1.1 + MOVIE_COST.script)} cr</span></button>
      </div>
    </div></div></div>
  );
}

/** Balance before / after. */
function MeterAfter({ cost, credits }: { cost: number; credits: number }) {
  const cap = Math.max(credits, 6000), short = cost > credits, left = Math.max(0, credits - cost);
  return (
    <div className="meter">
      <div className="meter-row t-small"><span className="muted">Your balance</span><span className="num">{fmt(credits)} cr</span></div>
      <div className={"meter-bar" + (short ? " over" : "")}><span style={{ width: (short ? 100 : (left / cap) * 100) + "%" }} />{!short && <span className="reserve" style={{ width: (cost / cap) * 100 + "%" }} />}</div>
      <div className="meter-row t-small"><span className="muted">{short ? "Missing" : "Left after this movie"}</span><span className="num" style={short ? { color: "var(--rec)" } : undefined}>{fmt(short ? cost - credits : left)} cr</span></div>
    </div>
  );
}

type Photo = { key: string; name: string; url: string };

/** A failed clip to start from ("Change and try again"). */
export interface ClipStart { prompt: string; photos: Photo[]; sec: number; model: ModelTier; ratio: MovieRatio; style: MovieStyle }

const DRAFT_KEY = "samesay-clip-draft";

/** Quick clip: who's in it (optional photos), what happens, length, frame, look, quality.
 *  As a template: pick a ready-made scene, add its photos, choose quality. Nothing to write. */
export function ClipForm({ credits, from, template = false }: { credits: number; from?: ClipStart | null; template?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const openSettings = useOpenSettings();
  const [photos, setPhotos] = useState<Photo[]>(from?.photos ?? []);
  const [uploading, setUploading] = useState<number | null>(null);
  const [consent, setConsent] = useState(false);
  const [prompt, setPrompt] = useState(from?.prompt ?? "");
  const [sec, setSec] = useState(from?.sec ?? 10);
  const [ratio, setRatio] = useState<MovieRatio>(from?.ratio ?? "9:16");
  const [style, setStyle] = useState<MovieStyle>(from?.style ?? "cinematic");
  const [model, setModel] = useState<ModelTier>(from?.model ?? (template ? "standard" : "draft"));
  const [sceneId, setSceneId] = useState(CLIP_SCENES[0].id);
  const scene = template ? CLIP_SCENES.find((c) => c.id === sceneId)! : null;

  // keep what was typed if the page is closed before making it (this browser only)
  useEffect(() => {
    if (from || template) return;
    try { const saved = localStorage.getItem(DRAFT_KEY); if (saved) setPrompt(saved); } catch {}
  }, [from, template]);
  useEffect(() => {
    if (template) return;
    try { if (prompt.trim()) localStorage.setItem(DRAFT_KEY, prompt); else localStorage.removeItem(DRAFT_KEY); } catch {}
  }, [prompt, template]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const real = fitDuration(scene?.sec ?? sec, model), m = MODELS[model], sub = real * m.rate, buf = Math.ceil(sub * MOVIE_COST.buffer), total = sub + buf, short = total > credits;

  async function addPhoto(i: number, f: File | undefined) {
    if (!f) return;
    setUploading(i);
    try {
      const r = await sendFile<{ key: string; name: string }>("movie", f);
      const next = [...photos];
      next[i] = { key: r.key, name: f.name, url: URL.createObjectURL(f) };
      setPhotos(next.filter(Boolean));
    } catch (e) { toast((e as Error).message, true); }
    setUploading(null);
  }

  async function make() {
    setError(null);
    if (scene && photos.length < scene.people) { setError(scene.people === 2 ? "Add both photos first." : "Add a photo first."); return; }
    if (!scene && !prompt.trim()) { setError("Say what happens first."); return; }
    if (photos.length && !consent) { setError("Tick the box to confirm you may use these photos."); return; }
    setBusy(true);
    try {
      const keys = photos.map((p) => p.key);
      const r = await api("/api/movies/clip", "POST", scene ? { scene: scene.id, photos: keys, consent, model } : { prompt, photos: keys, consent, sec, model, ratio, style });
      if (!scene) try { localStorage.removeItem(DRAFT_KEY); } catch {}
      toast(`Started. ${fmt(r.held)} cr held.`);
      router.push(`/app/movie/${r.id}/make`);
      router.refresh();
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  return (
    <div className="grid g-2-1">
      <div className="stack">
        <div className="panel"><div className="panel-body stack" style={{ gap: "var(--sp-5)" }}>
          {scene && (
            <div className="field">
              <span className="label">1. Pick a template</span>
              <div className="tpl-grid">
                {CLIP_SCENES.map((c) => (
                  <button key={c.id} className="tpl" aria-pressed={c.id === scene.id} onClick={() => { setSceneId(c.id); setError(null); }} style={{ background: c.swatch }}>
                    <video className="tpl-video" src={c.preview} poster={c.poster} autoPlay muted loop playsInline preload="metadata" aria-hidden />
                    <span className="tpl-meta"><b>{c.name}</b><span>{c.people} {c.people === 1 ? "photo" : "photos"} · {c.sec} s</span></span>
                  </button>
                ))}
              </div>
              <span className="hint">{scene.desc}</span>
            </div>
          )}
          <div className="field">
            {scene
              ? <span className="label">2. Add {scene.people === 2 ? "both people’s photos" : "your photo"}</span>
              : <span className="label">Who’s in it <span className="faint t-xs" style={{ fontWeight: 400 }}>· optional, up to 2 people</span></span>}
            <div className="two">
              {[0, 1].map((i) => {
                const ph = photos[i];
                return (
                  <label key={i} className="mv-upload" htmlFor={`clip-ph-${i}`}>
                    <div className={"mv-portrait" + (ph ? " photo" : "")} style={{ "--h": i ? 330 : 28, width: 64, height: 64, ...(ph ? { backgroundImage: `url(${ph.url})` } : {}) } as React.CSSProperties}>
                      <span>{i + 1}</span>{ph && <span className="tag">Photo</span>}
                    </div>
                    <div className="stack" style={{ gap: 2, minWidth: 0 }}>
                      <b className="t-small">{uploading === i ? "Uploading…" : ph ? ph.name : `Person ${i + 1}`}</b>
                      <span className="faint t-xs">{ph ? <button className="linkbtn" onClick={(e) => { e.preventDefault(); const next = photos.filter((_, k) => k !== i); setPhotos(next); if (!next.length) setConsent(false); }}>Remove</button> : "Add a photo · one face, good light"}</span>
                    </div>
                    <input type="file" id={`clip-ph-${i}`} accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { addPhoto(Math.min(i, photos.length), e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                );
              })}
            </div>
            {photos.length
              ? <label className="check" style={{ alignItems: "flex-start" }}><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>{CLIP_CONSENT}</span></label>
              : <span className="hint">{scene ? (scene.people === 2 ? "Person 1 and Person 2 · one face each, good light." : "One face, good light.") : "No photos? We make up the people from your words."}</span>}
            {scene && error && <span className="hint err">{error}</span>}
          </div>
          {!scene && <>
          <div className="field">
            <label className="label" htmlFor="clip-prompt">What happens</label>
            <textarea className={"textarea" + (error ? " invalid" : "")} id="clip-prompt" rows={4} placeholder="Who does what, where? e.g. They dance in the rain on a city street at night." value={prompt} onChange={(e) => setPrompt(e.target.value)} />
            {error ? <span className="hint err">{error}</span> : <span className="hint">One or two sentences. Say where, what they do and the mood.</span>}
          </div>
          <div className="note"><Heart /><div>Sweet and romantic is fine, up to hugs and kisses. Nudity and sexual scenes can’t be made.</div></div>
          <div className="two">
            <div className="field">
              <span className="label">Length</span>
              <div className="seg">{CLIP_LENGTHS.map((x) => <button key={x} aria-pressed={sec === x} onClick={() => setSec(x)}>{x} s</button>)}</div>
              {real !== sec && <span className="hint">{m.name} makes {real} s videos.</span>}
            </div>
            <div className="field"><span className="label">Frame</span><div className="seg">{(["9:16", "16:9"] as MovieRatio[]).map((r) => <button key={r} aria-pressed={ratio === r} onClick={() => setRatio(r)}>{r}{r === "9:16" ? " · phone" : " · wide"}</button>)}</div></div>
          </div>
          <div className="field"><span className="label">Look</span><div className="seg">{(Object.keys(STYLES) as MovieStyle[]).map((k) => <button key={k} aria-pressed={style === k} onClick={() => setStyle(k)}>{STYLES[k]}</button>)}</div></div>
          </>}
          <div className="field">
            <span className="label">{scene ? "3. Quality" : "Quality"}</span>
            {photos.length > 0 && <span className="hint">With photos, Standard and Lead face keep faces closest to the photos.</span>}
            <div className="opts" style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>
              {CLIP_MODELS.map((k) => {
                const mm = MODELS[k], s2 = fitDuration(scene?.sec ?? sec, k);
                return <button key={k} className="opt" aria-pressed={model === k} onClick={() => setModel(k)}><span className="t">{mm.name}{k === "lead" && <span className="badge ok">Best faces</span>}</span><span className="d">{mm.desc}</span><span className="p">{s2} s · {fmt(s2 * mm.rate)} cr</span></button>;
              })}
            </div>
          </div>
        </div></div>
      </div>
      <div className="stack sticky"><div className="panel"><div className="panel-head"><h3>Price</h3></div><div className="panel-body stack">
        <CostTable lines={[{ label: m.model, detail: `${real} s × ${m.rate} cr`, credits: sub }]} total={total} buffer={buf} label="Held while it’s made" />
        <MeterAfter cost={total} credits={credits} />
        <div className="note accent"><ShieldCheck /><div>If the video is <b>blocked by the safety filter</b> or fails, all credits come back.</div></div>
        {short && <div className="note rec"><OctagonAlert /><div><b>Not enough credits.</b> <a href="#" onClick={(e) => { e.preventDefault(); openSettings("billing"); }}>Top up</a>, or choose Draft.</div></div>}
        <button className="btn primary block lg" disabled={short || busy || uploading !== null} onClick={make}>{busy ? <><LoaderCircle />Starting…</> : <><WandSparkles />Make the video · {fmt(total)} cr</>}</button>
        <span className="faint t-xs">Takes 1–3 minutes. You can leave this page.</span>
      </div></div></div>
    </div>
  );
}
