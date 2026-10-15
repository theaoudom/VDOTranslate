"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, CircleCheck, LoaderCircle, OctagonAlert, Plus, Printer, RefreshCw, Sparkles, Trash2, Users, X } from "lucide-react";
import { GENRES, MOVIE_COST, sceneSec, scriptSec, STYLES, TIMES, type PublicMovie, type Scene } from "@/domain/movie/Movie";
import { Modal } from "../../Modal";
import { useToast } from "../../Toast";
import { mmss } from "../format";
import { api, PageHead, Stepper } from "./parts";

const TONES: [string, string][] = [["funnier", "Funnier"], ["action", "More action"], ["emotional", "More emotional"], ["romantic", "More romantic"], ["shorter", "Shorter"]];
const TONE_ASK: Record<string, string> = { funnier: "funnier", action: "more action", emotional: "more emotional", romantic: "more romantic (kisses at most)", shorter: "shorter" };

/** Step 2: read and change the script. Typing saves on its own. */
export function MovieScript({ initial }: { initial: PublicMovie }) {
  const router = useRouter();
  const toast = useToast();
  const [m, setM] = useState(initial);
  const [script, setScript] = useState<Scene[]>(initial.script);
  const [changing, setChanging] = useState<string | null>(null);
  const [tones, setTones] = useState<Record<string, string[]>>({});
  const [ask, setAsk] = useState("");
  const [allTones, setAllTones] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [modal, setModal] = useState<{ kind: "rewrite" } | { kind: "delete"; scene: Scene; no: number } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const dirty = useRef(false);

  const speakers = (() => {
    const list = m.cast.map((c) => c.name);
    script.forEach((sc) => sc.lines.forEach((l) => { if (!list.includes(l.who)) list.push(l.who); }));
    if (!list.includes("Narrator")) list.push("Narrator");
    return list;
  })();

  /** Save a moment after the last change. */
  function edit(next: Scene[]) {
    setScript(next);
    dirty.current = true;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(next), 700);
  }
  async function save(next: Scene[]) {
    try { setM(await api(`/api/movies/${m.id}`, "PATCH", { script: next })); dirty.current = false; }
    catch (e) { toast((e as Error).message, true); }
  }
  useEffect(() => () => clearTimeout(saveTimer.current), []);
  const flush = async () => { clearTimeout(saveTimer.current); if (dirty.current) await save(script); };

  const setScene = (id: string, patch: Partial<Scene>) => edit(script.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const sceneOf = (id: string) => script.find((s) => s.id === id)!;

  async function changeScene(id: string) {
    const t = tones[id] ?? [];
    if (!t.length && !ask.trim()) { toast("Pick a change or tell the AI what to change", true); return; }
    await flush();
    setBusy(id);
    try {
      const next = await api(`/api/movies/${m.id}/scene`, "POST", { sceneId: id, tones: t.map((k) => TONE_ASK[k]), ask });
      setM(next); setScript(next.script); setChanging(null); setTones({ ...tones, [id]: [] }); setAsk("");
      toast(`Scene rewritten · ${MOVIE_COST.scene} cr`);
      router.refresh();
    } catch (e) { toast((e as Error).message, true); }
    setBusy(null);
  }

  async function rewriteAll() {
    setModal(null);
    setBusy("all");
    try {
      const next = await api(`/api/movies/${m.id}/rewrite`, "POST", { tones: allTones.map((k) => TONE_ASK[k]) });
      setM(next); setScript(next.script); setAllTones([]);
      toast(`New script ready · ${MOVIE_COST.script} cr`);
      router.refresh();
    } catch (e) { toast((e as Error).message, true); }
    setBusy(null);
  }

  /** Opens the script on its own page; the browser's print dialog saves it as a PDF. */
  function printScript() {
    const w = window.open("", "_blank");
    if (!w) return;
    const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
    w.document.write(`<!doctype html><title>${esc(m.name)}</title><style>body{font:15px/1.6 Georgia,serif;max-width:640px;margin:40px auto;padding:0 16px}h1{font-size:22px}h2{font-size:15px;text-transform:uppercase;margin-top:28px}.l{margin:6px 0 6px 40px}.w{font-weight:bold}</style><h1>${esc(m.name)}</h1>` +
      script.map((s, i) => `<h2>Scene ${i + 1} · ${esc(s.place)} · ${esc(s.time)}</h2><p>${esc(s.text)}</p>` + s.lines.map((l) => `<p class="l"><span class="w">${esc(l.who)}:</span> ${esc(l.text)}</p>`).join("")).join(""));
    w.document.close();
    w.focus();
    w.print();
  }

  const sec = scriptSec(script), target = m.settings.length, ratio = sec / target, over = ratio > 1.1, short = ratio < 0.75;
  const lineCount = script.reduce((a, s) => a + s.lines.length, 0);

  return (
    <section>
      <PageHead title="Check the script" sub="Change anything you like. The movie follows this script." right={<button className="btn" onClick={printScript}><Printer />Download PDF</button>} />
      <Stepper at="script" movieId={m.id} />
      {m.settings.fromOwn && <div className="note ok" style={{ marginBottom: "var(--sp-4)" }}><CircleCheck /><div><b>We read your script.</b> It’s split into {script.length} scenes and {lineCount} lines. Your words weren’t changed.</div></div>}
      <div className="grid g-2-1">
        <div className="stack">
          <div className="panel"><div className="panel-body stack">
            <div className="mv-len">
              <div className="meter-row t-small">
                <span><b className="num">{mmss(sec)}</b> <span className="muted">of {mmss(target)}</span></span>
                <span className={over ? "" : "muted"} style={over ? { color: "var(--rec)" } : undefined}>{over ? `A little long. Shorten a scene or choose ${mmss(target + 30)}.` : short ? "Short. Add a scene or some lines." : "Fits"}</span>
              </div>
              <div className="meter-bar"><span className={over ? "over" : ""} style={{ width: Math.min(100, ratio * 100) + "%" }} /></div>
            </div>
            <div className="field"><span className="label">Change the whole script</span><div className="hstack">
              {TONES.map(([k, l]) => <button key={k} className="chip" aria-pressed={allTones.includes(k)} onClick={() => setAllTones(allTones.includes(k) ? allTones.filter((x) => x !== k) : [...allTones, k])}>{l}</button>)}
            </div></div>
            <div className="hstack" style={{ justifyContent: "flex-end" }}>
              <button className="btn sm" disabled={busy === "all"} onClick={() => setModal({ kind: "rewrite" })}>{busy === "all" ? <><LoaderCircle />Rewriting…</> : <><RefreshCw />Rewrite the whole script · {MOVIE_COST.script} cr</>}</button>
            </div>
          </div></div>

          {script.map((sc, i) => {
            const open = changing === sc.id;
            return (
              <div key={sc.id} className="panel">
                <div className="panel-head"><div className="mv-scene-head" style={{ width: "100%" }}>
                  <span className="no">Scene {i + 1}</span>
                  <input className="input" value={sc.place} aria-label={`Place of scene ${i + 1}`} onChange={(e) => setScene(sc.id, { place: e.target.value })} />
                  <select className="select" value={sc.time} aria-label={`Time of scene ${i + 1}`} onChange={(e) => setScene(sc.id, { time: e.target.value })}>{TIMES.map((t) => <option key={t}>{t}</option>)}</select>
                  <span className="tools">
                    <span className="faint t-xs num" style={{ marginRight: 6 }}>~{mmss(sceneSec(sc))}</span>
                    <button className="btn ghost icon sm" aria-label="Move scene up" disabled={i === 0} onClick={() => { const n = [...script]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; edit(n); }}><ArrowUp /></button>
                    <button className="btn ghost icon sm" aria-label="Move scene down" disabled={i === script.length - 1} onClick={() => { const n = [...script]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; edit(n); }}><ArrowDown /></button>
                    <button className="btn ghost icon sm" aria-label="Delete scene" disabled={script.length < 2} onClick={() => setModal({ kind: "delete", scene: sc, no: i + 1 })}><Trash2 /></button>
                  </span>
                </div></div>
                <div className="panel-body stack">
                  <div className="field"><label className="label" htmlFor={`tx-${sc.id}`}>What happens</label><textarea className="textarea" rows={2} id={`tx-${sc.id}`} value={sc.text} onChange={(e) => setScene(sc.id, { text: e.target.value })} /></div>
                  <div className="field"><span className="label">Lines</span><div className="stack" style={{ gap: 6 }}>
                    {sc.lines.map((l, j) => (
                      <div key={j} className="mv-line">
                        <select className="select" value={l.who} aria-label="Who speaks" onChange={(e) => setScene(sc.id, { lines: sc.lines.map((x, k) => (k === j ? { ...x, who: e.target.value } : x)) })}>{speakers.map((n) => <option key={n}>{n}</option>)}</select>
                        <input className="input" value={l.text} aria-label={`Line ${j + 1}`} onChange={(e) => setScene(sc.id, { lines: sc.lines.map((x, k) => (k === j ? { ...x, text: e.target.value } : x)) })} />
                        <button className="btn ghost icon sm" aria-label="Delete line" onClick={() => setScene(sc.id, { lines: sc.lines.filter((_, k) => k !== j) })}><X /></button>
                      </div>
                    ))}
                    {!sc.lines.length && <span className="faint t-small">No lines. This scene has no talking.</span>}
                    <button className="linkbtn" style={{ alignSelf: "flex-start" }} onClick={() => setScene(sc.id, { lines: [...sc.lines, { who: speakers[0], text: "" }] })}><Plus style={{ width: 14, height: 14 }} /> Add a line</button>
                  </div></div>
                  {open ? (
                    <div className="mv-change">
                      <div className="hstack">{TONES.map(([k, l]) => { const on = (tones[sc.id] ?? []).includes(k); return <button key={k} className="chip" aria-pressed={on} onClick={() => setTones({ ...tones, [sc.id]: on ? (tones[sc.id] ?? []).filter((x) => x !== k) : [...(tones[sc.id] ?? []), k] })}>{l}</button>; })}</div>
                      <input className="input" autoFocus placeholder="Or tell the AI what to change, e.g. Sreypov knows Dara from school" value={ask} onChange={(e) => setAsk(e.target.value)} />
                      <div className="hstack" style={{ justifyContent: "flex-end" }}>
                        <button className="btn sm" onClick={() => { setChanging(null); setAsk(""); }}>Cancel</button>
                        <button className="btn primary sm" disabled={busy === sc.id} onClick={() => changeScene(sc.id)}>{busy === sc.id ? <><LoaderCircle />Rewriting…</> : <><Sparkles />Rewrite this scene · {MOVIE_COST.scene} cr</>}</button>
                      </div>
                    </div>
                  ) : (
                    <button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => { setChanging(sc.id); setAsk(""); }}><Sparkles />Change this scene · {MOVIE_COST.scene} cr</button>
                  )}
                </div>
              </div>
            );
          })}
          <button className="btn block" onClick={() => edit([...script, { id: `s${Date.now()}`, place: "New place", time: "Day", text: "", lines: [] }])}><Plus />Add scene</button>
        </div>

        <div className="stack sticky"><div className="panel"><div className="panel-head"><h3>Story</h3></div><div className="panel-body stack">
          <div className="rows">
            <div className="row" style={{ border: 0, padding: "4px 0" }}><div className="main"><div className="meta">Kind · look · frame</div><div className="title">{GENRES[m.settings.genre].name} · {STYLES[m.settings.style]} · {m.settings.ratio}</div></div></div>
            <div className="row" style={{ border: 0, padding: "4px 0" }}><div className="main"><div className="meta">Scenes · characters</div><div className="title num">{script.length} scenes · {m.cast.length} characters</div></div></div>
          </div>
          <p className="faint t-xs">Your changes are saved as you type. Shots are planned from this script on the Shots step.</p>
          <Link className="btn primary block lg" href={`/app/movie/${m.id}/cast`} onClick={async (e) => { if (!dirty.current) return; e.preventDefault(); await flush(); router.push(`/app/movie/${m.id}/cast`); }}><Users />Next: characters</Link>
        </div></div></div>
      </div>

      {modal?.kind === "rewrite" && (
        <Modal title="Rewrite the script?" okLabel={`Rewrite · ${MOVIE_COST.script} cr`} onOk={rewriteAll} onClose={() => setModal(null)}>
          <p>We write a new version{allTones.length ? ` (${allTones.map((k) => TONES.find((t) => t[0] === k)![1].toLowerCase()).join(", ")})` : ""} from your idea. <b style={{ color: "var(--text)" }}>Your changes to this script are replaced.</b> Characters and shots are made again from the new script.</p>
        </Modal>
      )}
      {modal?.kind === "delete" && (
        <Modal title={`Delete scene ${modal.no}?`} okLabel="Delete scene" danger onOk={() => { edit(script.filter((s) => s.id !== modal.scene.id)); setModal(null); toast("Scene deleted"); }} onClose={() => setModal(null)}>
          <p>“{sceneOf(modal.scene.id)?.place ?? modal.scene.place}” and its {modal.scene.lines.length} line{modal.scene.lines.length === 1 ? "" : "s"} are removed from the script.</p>
        </Modal>
      )}
      {m.status !== "draft" && <div className="note rec"><OctagonAlert /><div>This movie is already made, so the script can’t change.</div></div>}
    </section>
  );
}
