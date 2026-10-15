"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Clapperboard, Coins, LoaderCircle, OctagonAlert, PiggyBank, ShieldCheck } from "lucide-react";
import { autoModel, estimateMovie, fitDuration, MODEL_ORDER, MODELS, MOVIE_COST, shotCost, type ModelTier, type MovieQuality, type PublicMovie } from "@/domain/movie/Movie";
import { useToast } from "../../Toast";
import { CostTable } from "../bits";
import { fmt, mmss } from "../format";
import { useOpenSettings } from "../Settings";
import { api, Frame, PageHead, Stepper } from "./parts";

type Shot = PublicMovie["shots"][number];

/** Balance before / after the movie (cap: plan's monthly credits or the balance). */
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

/** Step 4: quality per movie or per shot, and the price before anything is made. */
export function MovieShots({ initial, credits }: { initial: PublicMovie; credits: number }) {
  const router = useRouter();
  const toast = useToast();
  const openSettings = useOpenSettings();
  const [m, setM] = useState(initial);
  const [planning, setPlanning] = useState(Boolean(initial.settings.shotsStale));
  const [starting, setStarting] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();

  // the script changed: plan the shots again first
  useEffect(() => {
    if (!initial.settings.shotsStale) return;
    api(`/api/movies/${initial.id}/plan`).then(setM).catch((e) => toast((e as Error).message, true)).finally(() => setPlanning(false));
  }, [initial.id, initial.settings.shotsStale, toast]);

  function change(quality: MovieQuality, shots: Shot[]) {
    setM((x) => ({ ...x, quality, shots }));
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api(`/api/movies/${m.id}`, "PATCH", { quality, shots: shots.map((s) => ({ id: s.id, sec: s.sec, model: s.model })) }).catch((e) => toast((e as Error).message, true));
    }, 500);
  }
  const setQuality = (q: MovieQuality) => change(q, m.shots.map((sh) => { const model = autoModel(sh, q); return { ...sh, model, sec: fitDuration(sh.sec, model) }; }));
  const setShot = (id: string, patch: Partial<Shot>) => change("custom", m.shots.map((s) => {
    if (s.id !== id) return s;
    const next = { ...s, ...patch };
    return { ...next, sec: fitDuration(next.sec, next.model) };
  }));

  async function make() {
    clearTimeout(saveTimer.current);
    setStarting(true);
    try {
      await api(`/api/movies/${m.id}`, "PATCH", { quality: m.quality, shots: m.shots.map((s) => ({ id: s.id, sec: s.sec, model: s.model })) });
      const next = await api(`/api/movies/${m.id}/make`);
      toast(`Started. ${fmt(next.held)} cr held.`);
      router.push(`/app/movie/${m.id}/make`);
      router.refresh();
    } catch (e) { toast((e as Error).message, true); setStarting(false); }
  }

  if (planning) {
    return (
      <section>
        <PageHead title="Shots and price" sub="Choose the quality for the whole movie, or for each shot. The price updates as you go." />
        <Stepper at="shots" movieId={m.id} />
        <div className="panel"><div className="panel-body hstack"><LoaderCircle />Planning the shots from your script…</div></div>
      </section>
    );
  }

  const e = estimateMovie(m.shots), sec = m.shots.reduce((a, s) => a + s.sec, 0), short = e.total > credits;
  const priceFor = (q: Exclude<MovieQuality, "custom">) => m.shots.reduce((a, sh) => { const model = autoModel(sh, q); return a + fitDuration(sh.sec, model) * MODELS[model].rate; }, 0) * (1 + MOVIE_COST.buffer);
  const hueOf = (sh: Shot) => m.cast.find((c) => c.id === sh.cast[0])?.hue ?? 200;
  const budget = Math.ceil(priceFor("budget"));

  return (
    <section>
      <PageHead title="Shots and price" sub="Choose the quality for the whole movie, or for each shot. The price updates as you go." />
      <Stepper at="shots" movieId={m.id} />
      <div className="grid g-2-1">
        <div className="stack">
          <div className="panel"><div className="panel-body stack"><div className="field">
            <span className="label">Quality</span>
            <div className="opts" id="mv-quality">
              {([["budget", "Budget", "Draft model for every shot. Good for testing an idea."], ["balanced", "Balanced", "The right model per shot: action for fights, lead face for close-ups."], ["premium", "Premium", "Cinematic model everywhere. Best picture, highest price."]] as [Exclude<MovieQuality, "custom">, string, string][]).map(([q, name, d]) => (
                <button key={q} className="opt" aria-pressed={m.quality === q} onClick={() => setQuality(q)}>
                  <span className="t">{name}{q === "balanced" && <span className="badge ok">Recommended</span>}</span><span className="d">{d}</span><span className="p">about {fmt(priceFor(q))} cr</span>
                </button>
              ))}
            </div>
            {m.quality === "custom" && <span className="hint">You changed some shots by hand.</span>}
          </div></div></div>

          <div className="panel">
            <div className="panel-head"><h3>{m.shots.length} shots</h3><span className="faint t-xs num">{mmss(sec)} in total</span></div>
            <div className="rows">
              {m.shots.map((sh, i) => (
                <div key={sh.id} className="row mv-shot">
                  <Frame movieId={m.id} shot={sh} no={i + 1} hue={hueOf(sh)} />
                  <div className="main">
                    <div className="title"><span className="faint num">{i + 1}</span> {sh.title}</div>
                    <div className="meta">{sh.desc}</div>
                    <div className="meta">{sh.cast.map((id) => m.cast.find((c) => c.id === id)?.name).filter(Boolean).join(", ")}</div>
                  </div>
                  <div className="mv-shot-ctl">
                    <select className="select" value={sh.sec} aria-label={`Length of shot ${i + 1}`} onChange={(ev) => setShot(sh.id, { sec: +ev.target.value })}>
                      {MODELS[sh.model].durations.map((s) => <option key={s} value={s}>{s} s</option>)}
                    </select>
                    <select className="select" value={sh.model} aria-label={`Model for shot ${i + 1}`} onChange={(ev) => setShot(sh.id, { model: ev.target.value as ModelTier })}>
                      {MODEL_ORDER.map((k) => <option key={k} value={k}>{MODELS[k].name} · {MODELS[k].rate} cr/s</option>)}
                    </select>
                    <span className="num t-xs faint" style={{ textAlign: "right" }}>{fmt(shotCost(sh))} cr</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="stack sticky"><div className="panel"><div className="panel-head"><h3>Price</h3></div><div className="panel-body stack">
          <CostTable lines={e.lines} total={e.total} buffer={e.buffer} label="Held while it’s made" />
          <MeterAfter cost={e.total} credits={credits} />
          <div className="note accent"><ShieldCheck /><div>You pay only for shots that are made. If a shot is <b>blocked by the safety filter</b> or fails, its credits come back.</div></div>
          {short && <>
            <div className="note rec"><OctagonAlert /><div><b>Not enough credits.</b> You need {fmt(e.total)} and have {fmt(credits)}. Nothing has been charged.</div></div>
            <div className="stack" style={{ gap: 6 }}>
              {m.quality !== "budget" && <button className="btn block" onClick={() => { setQuality("budget"); toast("Switched to Budget quality"); }}><PiggyBank />Use Budget quality · {fmt(budget)} cr</button>}
              <button className="btn block" onClick={() => openSettings("billing")}><Coins />Top up credits</button>
            </div>
          </>}
          <button className="btn primary block lg" disabled={short || starting || !m.shots.length} onClick={make}>{starting ? <><LoaderCircle />Starting…</> : <><Clapperboard />Make the movie · {fmt(e.total)} cr</>}</button>
          <span className="faint t-xs">Takes about {Math.max(3, Math.round(m.shots.length * 0.8))} minutes. You can leave this page.</span>
        </div></div></div>
      </div>
    </section>
  );
}
