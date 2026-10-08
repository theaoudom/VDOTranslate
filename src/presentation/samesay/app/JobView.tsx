"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  AudioLines, Captions, ChevronDown, Circle, CircleCheck, Download, FastForward, Film, Info, Languages, LayoutTemplate,
  LoaderCircle, OctagonAlert, Pause, Pencil, Play, RefreshCw, Rewind, Scissors, Volume2,
} from "lucide-react";
import type { PublicJob, TranscriptLine } from "@/domain/entities/TranslationJob";
import { useToast } from "../Toast";
import { isRunning, jobMeta, StatusBadge } from "./bits";
import { fmt, mmss, relativeDay, tcode, VOICE_INFO } from "./format";

/** Polls the job while it is being processed (or a line is being re-voiced). */
function useJob(initial: PublicJob) {
  const [job, setJob] = useState(initial);
  const router = useRouter();
  useEffect(() => {
    if (!isRunning(job)) return;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/jobs/${job.id}`, { cache: "no-store" });
      if (res.ok) {
        const next: PublicJob = await res.json();
        setJob(next);
        if (!isRunning(next)) router.refresh(); // balance in the top bar changed
      } else setJob((j) => ({ ...j })); // try again
    }, 2000);
    return () => clearTimeout(t);
  }, [job, router]);
  return [job, setJob] as const;
}

export function JobView({ initial }: { initial: PublicJob }) {
  const [job, setJob] = useJob(initial);
  const revoicing = job.status === "merging" && job.lines != null;
  if (job.status === "failed") return <FailedView job={job} />;
  if (isRunning(job) && !revoicing) return <ProcessingView job={job} />;
  if (job.kind === "edit") return <EditResultView job={job} />;
  return <ResultView job={job} revoicing={revoicing} onRevoiceStarted={() => setJob({ ...job, status: "merging", progress: 90 })} />;
}

function Head({ job, children }: { job: PublicJob; children?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <span className="eyebrow">{job.kind === "edit" ? "Edit" : "Translation"} · {relativeDay(new Date(job.createdAt))}</span>
        <h1 className="t-h2" style={{ marginTop: 4 }}>{job.name}</h1>
        <p className="sub">{jobMeta(job)}</p>
      </div>
      {children}
    </div>
  );
}

/* ── processing ── */
function ProcessingView({ job }: { job: PublicJob }) {
  const steps: [string, string][] = job.kind === "edit" ? [
    ["merging", `Placing ${job.template?.name ? "“" + job.template.name + "”" : "the template"}${job.template && job.template.ratio !== "16:9" ? ", cropping to " + job.template.ratio : ""} and rendering the video`],
  ] : [
    ["extracting", "Extracting audio"],
    ...(job.keepBackground ? [["separating", "Separating voices from music and sounds"] as [string, string]] : []),
    ["transcribing", "Transcribing and finding speakers"],
    ["translating", "Translating the lines"],
    ["synthesizing", job.voice === "cloned" ? "Cloning voices and generating speech" : "Generating voices"],
    ["merging", "Mixing audio" + (job.burnSubtitles ? ", adding subtitles" : "") + " and rendering the video"],
  ];
  const at = Math.max(0, steps.findIndex(([s]) => s === job.status));
  const minLeft = Math.max(1, Math.ceil(((100 - job.progress) / 100) * (job.durationSec / 60) * 0.8));
  return (
    <section>
      <Head job={job}><Link className="btn" href="/app">Back to dashboard</Link></Head>
      <div className="grid g-2-1">
        <div className="panel">
          <div className="panel-head"><h3>Working on it</h3><StatusBadge job={job} /></div>
          <div className="panel-body stack">
            <div className="steps">
              {steps.map(([, label], i) => (
                <div key={label} className={"step " + (i < at ? "done" : i === at ? "now" : "")}>
                  {i < at ? <CircleCheck /> : i === at ? <LoaderCircle /> : <Circle />}{label}
                </div>
              ))}
            </div>
            <div className="progress"><span style={{ width: job.progress + "%" }} /></div>
            <span className="faint t-xs">About {minLeft} min left. You can leave this page; we’ll keep going.</span>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h3>Credits</h3></div>
          <div className="panel-body stack">
            {job.kind === "edit" ? (
              <table className="cost"><tbody><tr className="total"><td>Fixed price</td><td>{fmt(job.held)} cr</td></tr></tbody></table>
            ) : (
              <>
                <table className="cost"><tbody>
                  <tr><td>Held for this job</td><td>{fmt(job.held)}</td></tr>
                  <tr className="total"><td>Charged so far</td><td>0 cr</td></tr>
                </tbody></table>
                <div className="note accent"><Info /><div>You’ll pay only what the job uses. The rest returns to your balance when it finishes.</div></div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── failed ── */
function FailedView({ job }: { job: PublicJob }) {
  return (
    <section>
      <Head job={job} />
      <div className="grid g-2-1">
        <div className="stack">
          <div className="note rec"><OctagonAlert /><div><b>This job failed.</b> {job.error ?? "Something went wrong while processing."}</div></div>
          <div className="panel">
            <div className="panel-head"><h3>What you can do</h3></div>
            <div className="panel-body steps">
              <div className="step done"><Volume2 />Check the video has someone speaking</div>
              <div className="step done"><Languages />Set the spoken language instead of Auto-detect</div>
              <div className="step done"><RefreshCw />Try again. You’ll see the estimate first</div>
            </div>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><h3>Credits</h3></div>
          <div className="panel-body stack">
            <table className="cost"><tbody>
              <tr><td>Held</td><td>{fmt(job.held)}</td></tr>
              <tr><td>Returned</td><td style={{ color: "var(--ok)" }}>+{fmt(job.held)}</td></tr>
              <tr className="total"><td>Charged</td><td>0 cr</td></tr>
            </tbody></table>
            <div className="note ok"><CircleCheck /><div>All held credits came back to your balance.</div></div>
            <Link className="btn primary block" href="/app/new"><RefreshCw />Try again</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── result ── */
function ResultView({ job, revoicing, onRevoiceStarted }: { job: PublicJob; revoicing: boolean; onRevoiceStarted: () => void }) {
  const toast = useToast();
  const lines = job.lines ?? [];
  const video = useRef<HTMLVideoElement>(null);
  const [mode, setMode] = useState<"dub" | "original">("dub");
  const [shape, setShape] = useState("");
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const speakerNo = new Map<string, number>();
  lines.forEach((l) => { if (!speakerNo.has(l.speaker)) speakerNo.set(l.speaker, speakerNo.size + 1); });
  const tone = (n: number) => ["info", "", "accent", "ok"][(n - 1) % 4];
  const current = lines.reduce((k, l, i) => (t >= l.start ? i : k), 0);
  const refund = Math.max(0, job.held - job.used);
  const base = `/api/jobs/${job.id}/files`;
  const src = mode === "dub" ? `${base}/video?v=${new Date(job.updatedAt).getTime()}` : `${base}/original`;

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  // keep position when switching between dubbed and original
  const lastT = useRef(0);
  useEffect(() => { lastT.current = t; }, [t]);
  function onLoaded() {
    const v = video.current;
    if (!v) return;
    // vertical and square videos get the prototype's 9:16 / 1:1 frame instead of a letterboxed 16:9 one
    const r = v.videoWidth / (v.videoHeight || 1);
    setShape(r < 0.8 ? "r916" : r < 1.25 ? "r11" : "");
    if (lastT.current) v.currentTime = lastT.current;
    if (playing) v.play();
  }

  const seek = (s: number) => { if (video.current) { video.current.currentTime = Math.max(0, Math.min(job.durationSec, s)); setT(video.current.currentTime); } };
  const toggle = () => { const v = video.current; if (!v) return; if (v.paused) v.play(); else v.pause(); };

  async function saveLine(i: number) {
    const text = draft.trim();
    if (!text) return;
    setSaving(true);
    const res = await fetch(`/api/jobs/${job.id}/lines/${i}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { toast(body.error ?? "Couldn’t re-voice that line", true); return; }
    setEditing(null);
    toast("Re-voicing the line · 1 cr");
    onRevoiceStarted();
  }

  const download = (kind: string) => { setMenu(false); window.location.href = `${base}/${kind}?download=1`; };
  const subtitleText = !job.burnSubtitles || mode === "original" ? (mode === "dub" ? lines[current]?.text : lines[current]?.original) : null;

  return (
    <section>
      <Head job={job}>
        <div className="hstack">
          <Link className="btn" href={`/app/templates?video=${job.id}`}><LayoutTemplate />Add a template</Link>
          <Link className="btn" href="/app/split"><Scissors />Split into parts</Link>
          {job.hasVideo && <div className="menu-anchor" ref={menuRef}>
            <button className="btn primary" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu}><Download />Download<ChevronDown /></button>
            <div className="menu" role="menu" hidden={!menu}>
              <button role="menuitem" onClick={() => download("video")}><Film />Dubbed video (MP4)</button>
              <button role="menuitem" onClick={() => download("srt")}><Captions />Subtitles (SRT)</button>
              <button role="menuitem" onClick={() => download("audio")}><AudioLines />Voice track only (MP3)</button>
            </div>
          </div>}
        </div>
      </Head>
      <div className="grid g-2-1">
        <div className="stack">
          {!job.hasVideo ? (
            <div className="note"><Info /><div><b>The video files were deleted.</b> Files are kept for 30 days. The transcript below is still here.</div></div>
          ) : <div className="stack" style={{ gap: "var(--sp-3)" }}>
            <div className={"viewer " + shape}>
              <video
                ref={video} key={src} src={src} playsInline preload="metadata"
                onLoadedMetadata={onLoaded}
                onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
                onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
                onClick={toggle}
              />
              <span className="tc">{tcode(t)}</span>
              {subtitleText && <div className="subtitle">{subtitleText}</div>}
            </div>
            <div className="transport">
              <button className="btn ghost icon sm" onClick={() => seek(t - 5)} aria-label="Back 5 seconds"><Rewind /></button>
              <button className="btn icon sm" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause /> : <Play />}</button>
              <button className="btn ghost icon sm" onClick={() => seek(t + 5)} aria-label="Forward 5 seconds"><FastForward /></button>
              <span className="tc-big"><b style={{ fontWeight: 400 }}>{tcode(t)}</b> <span>/ {tcode(job.durationSec)}</span></span>
              <span style={{ flex: 1 }} />
              <div className="seg" role="group">
                <button aria-pressed={mode === "original"} onClick={() => setMode("original")}>Original</button>
                <button aria-pressed={mode === "dub"} onClick={() => setMode("dub")}>Dubbed</button>
              </div>
            </div>
          </div>}
          <div className="panel">
            <div className="panel-head"><h3>Transcript</h3><span className="faint t-xs">{lines.length} lines · click to jump, pencil to fix</span></div>
            <div id="tlines">
              {lines.map((l: TranscriptLine, i) => {
                const n = speakerNo.get(l.speaker)!;
                const isEditing = editing === i;
                return (
                  <div key={i} className={"tline" + (i === current ? " on" : "")} onClick={(e) => { if (!isEditing && !(e.target as HTMLElement).closest("button")) seek(l.start); }}>
                    <div><span className={"badge " + tone(n)}>S{n}</span><div className="num faint t-xs" style={{ marginTop: 4 }}>{mmss(l.start)}</div></div>
                    <div className="tbody">
                      {isEditing ? (
                        <>
                          <textarea className="textarea" style={{ minHeight: 64 }} aria-label="Translated line" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
                          <div className="or-t">{l.original}</div>
                          <div className="hstack" style={{ marginTop: 6 }}>
                            <button className="btn sm" onClick={() => setEditing(null)}>Cancel</button>
                            <button className="btn primary sm" disabled={saving} onClick={() => saveLine(i)}>Save &amp; re-voice · 1 cr</button>
                          </div>
                        </>
                      ) : (
                        <><div className="tr">{l.text}</div><div className="or-t">{l.original}</div></>
                      )}
                    </div>
                    {!isEditing && <button className="btn ghost icon sm" data-edit aria-label="Fix this line" disabled={revoicing || !job.hasVideo} onClick={() => { setEditing(i); setDraft(l.text); }}><Pencil /></button>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="stack">
          {revoicing ? (
            <div className="note accent"><LoaderCircle /><div><b>Re-voicing your line…</b> The video updates here in a moment.</div></div>
          ) : (
            <div className="note accent"><Pencil /><div><b>Check the lines.</b> If a word is wrong, fix it and only that line is re-voiced for 1 cr.</div></div>
          )}
          {job.error && <div className="note rec"><OctagonAlert /><div>{job.error}</div></div>}
          <div className="note ok"><CircleCheck /><div><b>Done.</b> {fmt(refund)} unused credits went back to your balance.</div></div>
          <div className="panel">
            <div className="panel-head"><h3>Credits</h3></div>
            <div className="panel-body">
              <table className="cost"><tbody>
                <tr><td>Held at start</td><td>{fmt(job.held)}</td></tr>
                <tr><td>Returned<span className="sub">job used less than the estimate</span></td><td style={{ color: "var(--ok)" }}>+{fmt(refund)}</td></tr>
                <tr className="total"><td>Charged</td><td>{fmt(job.used)} cr</td></tr>
              </tbody></table>
            </div>
          </div>
          <div className="panel">
            <div className="panel-head"><h3>Speakers</h3></div>
            <div className="rows">
              {(job.speakers ?? []).map((s) => {
                const n = speakerNo.get(s.id) ?? 1;
                return (
                  <div key={s.id} className="row">
                    <span className={"badge " + tone(n)}>S{n}</span>
                    <div className="main">
                      <div className="title">Speaker {n}</div>
                      <div className="meta">{s.gender === "female" ? "Female" : s.gender === "male" ? "Male" : "Voice"} · {Math.round(s.share * 100)}% of speech · {VOICE_INFO[job.voice].name}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── result of "Export this video" (template applied) ── */
function EditResultView({ job }: { job: PublicJob }) {
  const [shape, setShape] = useState("");
  const base = `/api/jobs/${job.id}/files`;
  return (
    <section>
      <Head job={job}>
        <div className="hstack">
          <Link className="btn" href={`/app/templates?video=${job.id}`}><LayoutTemplate />Edit template</Link>
          <Link className="btn" href="/app/split"><Scissors />Split into parts</Link>
          {job.hasVideo && <a className="btn primary" href={`${base}/video?download=1`}><Download />Download MP4</a>}
        </div>
      </Head>
      <div className="grid g-2-1">
        {job.hasVideo ? (
          <div className={"viewer " + shape}>
            <video src={`${base}/video?v=${new Date(job.updatedAt).getTime()}`} controls playsInline preload="metadata"
              onLoadedMetadata={(e) => { const r = e.currentTarget.videoWidth / (e.currentTarget.videoHeight || 1); setShape(r < 0.8 ? "r916" : r < 1.25 ? "r11" : ""); }} />
          </div>
        ) : (
          <div className="note"><Info /><div><b>The video files were deleted.</b> Files are kept for 30 days.</div></div>
        )}
        <div className="panel">
          <div className="panel-head"><h3>Credits</h3></div>
          <div className="panel-body">
            <table className="cost"><tbody>
              <tr><td>Render<span className="sub">{(job.durationSec / 60).toFixed(1)} min × 1 cr · {job.template?.ratio}</span></td><td>{fmt(job.used)}</td></tr>
              <tr className="total"><td>Charged</td><td>{fmt(job.used)} cr</td></tr>
            </tbody></table>
          </div>
        </div>
      </div>
    </section>
  );
}
