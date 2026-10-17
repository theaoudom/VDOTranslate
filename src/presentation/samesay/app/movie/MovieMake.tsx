"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Circle, CircleCheck, Download, Info, LayoutTemplate, Languages, LoaderCircle, OctagonAlert, Pencil, Plus, RefreshCw, Scissors, ShieldAlert } from "lucide-react";
import { estimateMovie, GENRES, MODELS, remakeModels, remakeSec, shotCost, type ModelTier, type PublicMovie } from "@/domain/movie/Movie";
import { Modal } from "../../Modal";
import { useToast } from "../../Toast";
import { CostTable } from "../bits";
import { fmt, mmss } from "../format";
import { api, Frame, PageHead, Stepper } from "./parts";

type Shot = PublicMovie["shots"][number];
const busyShot = (s: Shot) => s.state === "queued" || s.state === "frame" || s.state === "making";

/** Step 5: progress while it's made, then the finished movie. */
export function MovieMake({ initial }: { initial: PublicMovie }) {
  const router = useRouter();
  const [m, setM] = useState(initial);
  const running = m.status === "making" || (m.status === "done" && m.shots.some(busyShot));

  useEffect(() => {
    if (!running) return;
    const t = setTimeout(async () => {
      try {
        const next = await api(`/api/movies/${m.id}`, "GET");
        setM(next);
        if (!(next.status === "making" || (next.status === "done" && next.shots.some(busyShot)))) router.refresh(); // balance changed
      } catch { setM((x) => ({ ...x })); }
    }, 4000);
    return () => clearTimeout(t);
  }, [m, running, router]);

  if (m.status === "making") return <Making m={m} />;
  if (m.status === "failed") return <Failed m={m} onChange={setM} />;
  return <Result m={m} onChange={setM} />;
}

function Making({ m }: { m: PublicMovie }) {
  const done = m.shots.filter((s) => s.state === "done" || s.state === "blocked" || s.state === "failed").length;
  const pct = Math.round((done / Math.max(1, m.shots.length)) * 100);
  const joining = done === m.shots.length;
  const total = m.shots.reduce((a, s) => a + s.sec, 0);
  return (
    <section>
      <PageHead title={m.settings.kind === "clip" ? "Making your video" : "Making your movie"} sub={`${m.settings.kind === "clip" ? "Quick clip" : GENRES[m.settings.genre].name} · ${mmss(total)} · ${m.settings.ratio} · held ${fmt(m.held)} cr`} right={<Link className="btn" href="/app/movie">Back to start</Link>} />
      {m.settings.kind !== "clip" && <Stepper at="making" movieId={m.id} locked />}
      <div className="grid g-2-1">
        <div className="panel"><div className="panel-head"><h3>Working on it</h3><span className="badge accent"><span className="dot live" />{pct}%</span></div><div className="panel-body stack">
          <div className="steps">
            {m.shots.map((sh, i) => {
              const st = sh.state, now = st === "frame" || st === "making";
              return (
                <div key={sh.id} className={"step " + (st === "done" ? "done" : now ? "now" : "")} style={st === "blocked" || st === "failed" ? { color: "var(--rec)" } : undefined}>
                  {st === "done" ? <CircleCheck /> : now ? <LoaderCircle /> : st === "blocked" || st === "failed" ? <ShieldAlert /> : <Circle />}
                  Shot {i + 1} · {sh.title}
                  {st === "blocked" ? <span className="faint t-xs">· blocked by the safety filter, not charged</span>
                    : st === "failed" ? <span className="faint t-xs">· couldn’t be made, not charged</span>
                    : st === "done" ? <span className="faint t-xs">· {MODELS[sh.model].model}</span> : null}
                </div>
              );
            })}
            <div className={"step " + (joining ? "now" : "")}>{joining ? <LoaderCircle /> : <Circle />}Joining shots, adding music and sound</div>
          </div>
          <div className="progress"><span style={{ width: pct + "%" }} /></div>
          <span className="faint t-xs">You can leave this page; we’ll keep going.</span>
        </div></div>
        <div className="panel"><div className="panel-head"><h3>Credits</h3></div><div className="panel-body stack">
          <table className="cost"><tbody><tr><td>Held for this movie</td><td>{fmt(m.held)}</td></tr><tr className="total"><td>Charged so far</td><td>0 cr</td></tr></tbody></table>
          <div className="note accent"><Info /><div>Blocked shots and the unused buffer come back when it finishes.</div></div>
        </div></div>
      </div>
    </section>
  );
}

function Failed({ m, onChange }: { m: PublicMovie; onChange: (m: PublicMovie) => void }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const clip = m.settings.kind === "clip";
  const price = estimateMovie(m.shots).total;
  const refused = m.shots.length > 0 && m.shots.every((s) => s.state === "blocked");
  async function retry() {
    setBusy(true);
    try {
      const next = await api(`/api/movies/${m.id}/retry`);
      if (clip) { toast(`Started again. ${fmt(next.held)} cr held.`); onChange(next); router.refresh(); }
      else router.push(`/app/movie/${m.id}/shots`);
    } catch (e) { toast((e as Error).message, true); setBusy(false); }
  }
  return (
    <section>
      <PageHead title={m.name} sub={`${clip ? "Quick clip" : GENRES[m.settings.genre].name} · ${m.settings.ratio}`} right={<Link className="btn" href="/app/movie"><Plus />{clip ? "New video" : "New movie"}</Link>} />
      <div className="note rec" style={{ marginBottom: "var(--sp-4)" }}><OctagonAlert /><div><b>{clip ? "This video couldn’t be made." : "This movie couldn’t be made."}</b> {m.error ?? "All held credits were returned."}</div></div>
      <div className="panel"><div className="panel-head"><h3>Try again</h3></div><div className="panel-body stack">
        <p className="muted t-small">{clip ? "Everything you entered is kept: the photos, what happens and the settings." : "Your script, characters and shots are kept. Nothing is written again."}</p>
        <div className="hstack">
          {clip && refused ? <Link className="btn primary" href={`/app/movie?from=${m.id}`}><Pencil />Change and try again</Link> : null}
          <button className={"btn" + (clip && refused ? "" : " primary")} disabled={busy} onClick={retry}>{busy ? <><LoaderCircle />Starting…</> : <><RefreshCw />{clip ? `${refused ? "Try the same again" : "Try again"} · ${fmt(price)} cr` : "Try again"}</>}</button>
          {clip && !refused ? <Link className="btn" href={`/app/movie?from=${m.id}`}><Pencil />Change and try again</Link> : null}
        </div>
      </div></div>
    </section>
  );
}

function Result({ m, onChange }: { m: PublicMovie; onChange: (m: PublicMovie) => void }) {
  const toast = useToast();
  const video = useRef<HTMLVideoElement>(null);
  const [at, setAt] = useState(0);
  const [remake, setRemake] = useState<{ i: number; desc: string; model: ModelTier } | null>(null);
  const [shape, setShape] = useState(m.settings.ratio === "9:16" ? "r916" : "");
  const made = m.shots.filter((s) => s.state === "done");
  const blocked = m.shots.filter((s) => s.state === "blocked" || s.state === "failed");
  const dur = made.reduce((a, s) => a + s.sec, 0);
  const blockedBack = blocked.reduce((a, s) => a + shotCost(s), 0);
  const bufferBack = Math.max(0, m.held - m.used - blockedBack);
  const hueOf = (sh: Shot) => m.cast.find((c) => c.id === sh.cast[0])?.hue ?? 200;

  /** Length and price of a remake with this model. */
  function remakeCost(sh: Shot, tier: ModelTier) {
    const sec = tier === sh.model ? sh.sec : remakeSec(m, sh, tier);
    return { sec, cost: shotCost({ sec, model: tier }) };
  }

  /** Jump the player to the start of a shot. */
  function watch(i: number) {
    setAt(i);
    let t = 0;
    for (const s of m.shots.slice(0, i)) if (s.state === "done") t += s.sec;
    if (video.current && m.shots[i].state === "done") { video.current.currentTime = t; video.current.play().catch(() => {}); }
  }

  async function doRemake() {
    if (!remake) return;
    const sh = m.shots[remake.i];
    try {
      onChange(await api(`/api/movies/${m.id}/remake`, "POST", { shotId: sh.id, desc: remake.desc, model: remake.model }));
      toast(`Making shot ${remake.i + 1} again · ${fmt(remakeCost(sh, remake.model).cost)} cr held`);
    } catch (e) { toast((e as Error).message, true); }
    setRemake(null);
  }

  return (
    <section>
      <PageHead title={m.name} sub={`${m.settings.kind === "clip" ? "Quick clip" : GENRES[m.settings.genre].name} · ${mmss(dur)} · ${m.settings.ratio} · ${fmt(m.used)} cr`}
        right={<div className="hstack"><Link className="btn" href="/app/movie"><Plus />{m.settings.kind === "clip" ? "New video" : "New movie"}</Link>{m.hasVideo && <a className="btn primary" href={`/api/movies/${m.id}/files/video?download=1`}><Download />Download MP4</a>}</div>} />
      {blocked.length > 0 && <div className="note rec" style={{ marginBottom: "var(--sp-4)" }}><ShieldAlert /><div><b>{blocked.length} shot{blocked.length > 1 ? "s were" : " was"} blocked by the safety filter</b> and left out. {blocked.length > 1 ? "They weren’t" : "It wasn’t"} charged. Change what happens in {blocked.length > 1 ? "them" : "it"} and make {blocked.length > 1 ? "them" : "it"} again.</div></div>}
      <div className="grid g-2-1">
        <div className="stack">
          <div className={"viewer " + shape}>
            {m.hasVideo
              ? <video ref={video} src={`/api/movies/${m.id}/files/video?v=${new Date(m.updatedAt).getTime()}`} controls playsInline preload="metadata"
                  onLoadedMetadata={(e) => { const r = e.currentTarget.videoWidth / (e.currentTarget.videoHeight || 1); setShape(r < 0.8 ? "r916" : r < 1.25 ? "r11" : ""); }} />
              : m.shots[at] && <Frame movieId={m.id} shot={m.shots[at]} no={at + 1} big hue={hueOf(m.shots[at])} />}
          </div>
          <div className="panel">
            <div className="panel-head"><h3>Shots</h3><span className="faint t-xs">Click to watch · remake any shot on its own</span></div>
            <div className="rows">
              {m.shots.map((sh, i) => {
                const b = sh.state === "blocked" || sh.state === "failed", busy = busyShot(sh);
                return (
                  <div key={sh.id} className={"row mv-shot" + (i === at ? " sel" : "")} style={{ cursor: "pointer" }} onClick={(e) => { if (!(e.target as HTMLElement).closest("button")) watch(i); }}>
                    <Frame movieId={m.id} shot={sh} no={i + 1} hue={hueOf(sh)} />
                    <div className="main">
                      <div className="title"><span className="faint num">{i + 1}</span> {sh.title}</div>
                      <div className="meta">{busy ? <span className="hstack" style={{ gap: 4 }}><LoaderCircle style={{ width: 12, height: 12 }} />Making again…</span> : b ? <span style={{ color: "var(--rec)" }}>Blocked · not charged</span> : `${mmss(sh.sec)} · ${MODELS[sh.model].model}`}</div>
                      {sh.error && sh.state === "done" && <div className="meta">{sh.error}</div>}
                    </div>
                    <button className="btn sm" disabled={busy || m.shots.some(busyShot)} onClick={() => setRemake({ i, desc: sh.desc, model: sh.model })}>{b ? <Pencil /> : <RefreshCw />}{b ? "Edit and make" : "Remake"} · {fmt(shotCost(sh))} cr</button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="stack sticky">
          <div className="panel"><div className="panel-head"><h3>Next</h3></div><div className="panel-body stack" style={{ gap: 8 }}>
            <Link className="btn primary block" href={`/app/new?upload=${m.id}`}><Languages />Dub into Khmer · from 4 cr/min</Link>
            <Link className="btn block" href={`/app/split?upload=${m.id}`}><Scissors />Split into parts</Link>
            <Link className="btn block" href="/app/templates"><LayoutTemplate />Add a template</Link>
          </div></div>
          <div className="panel"><div className="panel-head"><h3>Credits</h3></div><div className="panel-body stack">
            <table className="cost"><tbody>
              <tr><td>Held at start</td><td>{fmt(m.held)}</td></tr>
              {blockedBack > 0 && <tr><td>Blocked shot<span className="sub">not charged</span></td><td style={{ color: "var(--ok)" }}>+{fmt(blockedBack)}</td></tr>}
              <tr><td>Unused buffer</td><td style={{ color: "var(--ok)" }}>+{fmt(bufferBack)}</td></tr>
              <tr className="total"><td>Charged</td><td>{fmt(m.used)} cr</td></tr>
            </tbody></table>
          </div></div>
        </div>
      </div>
      {remake && (() => {
        const sh = m.shots[remake.i], b = sh.state === "blocked" || sh.state === "failed", tier = MODELS[remake.model], { sec, cost } = remakeCost(sh, remake.model);
        return (
          <Modal title={`${b ? "Edit and make shot " : "Remake shot "}${remake.i + 1}?`} okLabel={`Make it · ${fmt(cost)} cr`} onOk={doRemake} onClose={() => setRemake(null)}>
            <div className="stack">
              {b && <div className="note rec"><ShieldAlert /><div>The safety filter stopped this shot. Describe it without injuries or other blocked content.</div></div>}
              <div className="field"><label className="label" htmlFor="rm-desc">What happens</label><textarea className="textarea" id="rm-desc" rows={3} value={remake.desc} onChange={(e) => setRemake({ ...remake, desc: e.target.value })} /></div>
              <div className="field"><span className="label">Quality</span>{sh.cast.length > 0 && <span className="hint">With photos, Standard and Lead face keep faces closest to the photos.</span>}
                <div className="opts" style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>
                  {remakeModels(m).map((k) => {
                    const mm = MODELS[k], c = remakeCost(sh, k);
                    return <button key={k} type="button" className="opt" aria-pressed={remake.model === k} onClick={() => setRemake({ ...remake, model: k })}><span className="t">{mm.name}{k === sh.model && <span className="badge">Now</span>}{k === "lead" && <span className="badge ok">Best faces</span>}</span><span className="d">{mm.desc}</span><span className="p">{c.sec} s · {fmt(c.cost)} cr</span></button>;
                  })}
                </div>
              </div>
              <CostTable lines={[{ label: tier.model, detail: `${sec} s × ${tier.rate} cr`, credits: cost }]} total={cost} label="Price" />
              <p className="faint t-xs">Only this shot is made again. The rest of the movie stays as it is.</p>
            </div>
          </Modal>
        );
      })()}
    </section>
  );
}
