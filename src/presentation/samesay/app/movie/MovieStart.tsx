"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Camera, FileText, FileUp, Heart, Languages, LoaderCircle, OctagonAlert, PenLine, ScanText, Sparkles } from "lucide-react";
import { GENRES, LENGTHS, MODEL_ORDER, MODELS, MOVIE_COST, STYLES, type MovieGenre, type MovieRatio, type MovieStyle, type PublicMovie } from "@/domain/movie/Movie";
import { useToast } from "../../Toast";
import { CostTable } from "../bits";
import { fmt, mmss } from "../format";
import { sendFile } from "../sendFile";
import { useOpenSettings } from "../Settings";
import { api, GENRE_ICONS, PageHead, Stepper } from "./parts";

type OwnMode = "paste" | "file" | "photo";
type OwnFile = { kind: OwnMode; name: string; key: string; url: string | null };

/** Step 1: an idea for the AI, or the user's own script (typed, a file, or a photo of paper). */
export function MovieStart({ credits, movies }: { credits: number; movies: PublicMovie[] }) {
  const router = useRouter();
  const toast = useToast();
  const openSettings = useOpenSettings();
  const [source, setSource] = useState<"ai" | "own">("ai");
  const [genre, setGenre] = useState<MovieGenre>("action");
  const [idea, setIdea] = useState("");
  const [length, setLength] = useState(60);
  const [ratio, setRatio] = useState<MovieRatio>("9:16");
  const [style, setStyle] = useState<MovieStyle>("cinematic");
  const [ownMode, setOwnMode] = useState<OwnMode>("paste");
  const [ownText, setOwnText] = useState("");
  const [ownFiles, setOwnFiles] = useState<OwnFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cost = source === "ai" ? MOVIE_COST.script : MOVIE_COST.read;
  const files = ownFiles.filter((f) => f.kind === ownMode);

  async function addFile(file: File | undefined, kind: OwnMode) {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const r = await sendFile<{ key: string; name: string }>("movie", file);
      setOwnFiles((list) => [...(kind === "file" ? list.filter((f) => f.kind !== "file") : list), { kind, name: r.name, key: r.key, url: file.type.startsWith("image/") ? URL.createObjectURL(file) : null }]);
    } catch (e) { toast((e as Error).message, true); }
    setUploading(false);
  }

  async function go() {
    setError(null);
    if (source === "ai" && !idea.trim()) { setError("Write your idea first."); return; }
    if (source === "own" && (ownMode === "paste" ? !ownText.trim() : !files.length)) {
      setError(ownMode === "paste" ? "Paste or type your script first." : `Choose ${ownMode === "photo" ? "a photo" : "a file"} first.`);
      return;
    }
    setBusy(true);
    try {
      const settings = { genre, idea, length, ratio, style };
      const own = source === "own" ? (ownMode === "paste" ? { text: ownText } : { files: files.map((f) => f.key) }) : undefined;
      const r = await api<{ id: string }>("/api/movies", "POST", { settings, own });
      toast(source === "ai" ? `Script ready · ${cost} cr` : `Script read · ${cost} cr`);
      router.push(`/app/movie/${r.id}/script`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <section>
      <PageHead title="Make an AI movie" sub="Turn an idea into a short movie for TikTok, Reels or YouTube. You see every step and the price before anything is made." />
      <Stepper at="movie" />
      <div className="grid g-2-1">
        <div className="stack">
          <div className="panel"><div className="panel-body stack" style={{ gap: "var(--sp-5)" }}>
            <div className="field">
              <span className="label">How do you want to start?</span>
              <div className="opts" style={{ gridTemplateColumns: "repeat(2,minmax(0,1fr))" }}>
                <button className="opt" aria-pressed={source === "ai"} onClick={() => { setSource("ai"); setError(null); }}><span className="t"><Sparkles />Write it for me</span><span className="d">Give us an idea. AI writes the script for you to check.</span><span className="p">{MOVIE_COST.script} cr</span></button>
                <button className="opt" aria-pressed={source === "own"} onClick={() => { setSource("own"); setError(null); }}><span className="t"><FileText />Use my own script</span><span className="d">Paste it, upload a file, or take a photo of it on paper.</span><span className="p">{MOVIE_COST.read} cr</span></button>
              </div>
            </div>
            <div className="field">
              <span className="label">Kind of story</span>
              <div className="hstack">
                {(Object.keys(GENRES) as MovieGenre[]).map((k) => { const Icon = GENRE_ICONS[k]; return <button key={k} className="chip" aria-pressed={genre === k} onClick={() => setGenre(k)}><Icon />{GENRES[k].name}</button>; })}
              </div>
            </div>
            {genre === "romance" && <div className="note"><Heart /><div>Romantic scenes like dates, hugs and kisses are fine. Nudity and sex scenes can’t be made.</div></div>}
            {source === "ai" ? (
              <div className="field">
                <label className="label" htmlFor="mv-idea">Your idea</label>
                <textarea className={"textarea" + (error ? " invalid" : "")} id="mv-idea" rows={4} placeholder="Who is it about, what happens, how does it end?" value={idea} onChange={(e) => setIdea(e.target.value)} />
                {error ? <span className="hint err">{error}</span> : <span className="hint">One or two sentences is enough. We write the script, the characters and the shots for you to check.</span>}
              </div>
            ) : (
              <>
                <div className="field">
                  <span className="label">Your script</span>
                  <div className="seg">
                    {([["paste", "Paste or type"], ["file", "Upload a file"], ["photo", "Photo of paper"]] as [OwnMode, string][]).map(([m, l]) => <button key={m} aria-pressed={ownMode === m} onClick={() => { setOwnMode(m); setError(null); }}>{l}</button>)}
                  </div>
                </div>
                <div className="field">
                  {ownMode === "paste" && <>
                    <textarea className={"textarea" + (error ? " invalid" : "")} id="mv-own-text" rows={9} value={ownText} onChange={(e) => setOwnText(e.target.value)}
                      placeholder={"Scene 1. Riverside road, night.\nDara rides through traffic. The box rattles.\nDARA: Last drop tonight. Easy money."} />
                    <span className="hint">Any layout is fine. Write who speaks before each line, like DARA: …</span>
                  </>}
                  {ownMode === "file" && (
                    <label className="mv-own-file" htmlFor="own-file">
                      {uploading ? <LoaderCircle style={{ width: 22, height: 22, color: "var(--text-2)" }} /> : <FileUp style={{ width: 22, height: 22, color: "var(--text-2)" }} />}
                      <div className="stack" style={{ gap: 2 }}><b className="t-small">{files[0]?.name ?? "Choose a file"}</b><span className="faint t-xs">{files[0] ? "Ready to read" : "TXT, DOCX or PDF · up to 20 pages"}</span></div>
                      <input type="file" id="own-file" accept=".txt,.docx,.pdf" hidden onChange={(e) => { addFile(e.target.files?.[0], "file"); e.target.value = ""; }} />
                    </label>
                  )}
                  {ownMode === "photo" && (
                    <label className="mv-own-file" htmlFor="own-photo">
                      {files.length ? files.map((f) => f.url && <img key={f.key} src={f.url} alt="Your script page" />) : uploading ? <LoaderCircle style={{ width: 22, height: 22, color: "var(--text-2)" }} /> : <Camera style={{ width: 22, height: 22, color: "var(--text-2)" }} />}
                      <div className="stack" style={{ gap: 2 }}><b className="t-small">{files.length ? (files.length === 1 ? files[0].name : `${files.length} pages`) : "Take or choose a photo"}</b><span className="faint t-xs">{files.length ? "Ready to read · add more pages after" : "One page per photo · flat, sharp, good light · handwriting is fine"}</span></div>
                      <input type="file" id="own-photo" accept="image/*" capture="environment" hidden onChange={(e) => { addFile(e.target.files?.[0], "photo"); e.target.value = ""; }} />
                    </label>
                  )}
                  {error && <span className="hint err">{error}</span>}
                </div>
              </>
            )}
            <div className="two">
              <div className="field"><span className="label">Length</span><div className="seg">{LENGTHS.map((s) => <button key={s} aria-pressed={length === s} onClick={() => setLength(s)}>{mmss(s)}</button>)}</div></div>
              <div className="field"><span className="label">Frame</span><div className="seg">{(["9:16", "16:9"] as MovieRatio[]).map((r) => <button key={r} aria-pressed={ratio === r} onClick={() => setRatio(r)}>{r}{r === "9:16" ? " · phone" : " · wide"}</button>)}</div></div>
            </div>
            <div className="field"><span className="label">Look</span><div className="seg">{(Object.keys(STYLES) as MovieStyle[]).map((k) => <button key={k} aria-pressed={style === k} onClick={() => setStyle(k)}>{STYLES[k]}</button>)}</div></div>
            <div className="note"><Languages /><div>Characters speak <b>English</b>. Want Khmer? When the movie is done, dub it with <b>Translate video</b>. Every character keeps their own voice.</div></div>
          </div></div>
        </div>
        <div className="stack sticky">
          <div className="panel"><div className="panel-head"><h3>Next: the script</h3></div><div className="panel-body stack">
            {source === "ai" ? <>
              <CostTable lines={[{ label: "Write the script", detail: "scenes, lines and shot list", credits: MOVIE_COST.script }]} total={MOVIE_COST.script} />
              <p className="faint t-xs">You can read and change the script before any video is made. The movie itself is priced on the Shots step.</p>
              <button className="btn primary block lg" disabled={credits < cost || busy || uploading} onClick={go}>{busy ? <><LoaderCircle />Writing…</> : <><PenLine />Write the script · {MOVIE_COST.script} cr</>}</button>
            </> : <>
              <CostTable lines={[{ label: "Read my script", detail: "split into scenes, lines and characters", credits: MOVIE_COST.read }]} total={MOVIE_COST.read} />
              <p className="faint t-xs">We don’t rewrite your words. We only split them into scenes and lines, and find the characters.</p>
              <button className="btn primary block lg" disabled={credits < cost || busy || uploading} onClick={go}>{busy ? <><LoaderCircle />Reading…</> : <><ScanText />Read my script · {MOVIE_COST.read} cr</>}</button>
            </>}
            {credits < cost && <div className="note rec"><OctagonAlert /><div><b>Not enough credits.</b> <a href="#" onClick={(e) => { e.preventDefault(); openSettings("billing"); }}>Top up</a> to start.</div></div>}
          </div></div>
          <div className="panel"><div className="panel-head"><h3>What it costs</h3></div><div className="panel-body stack">
            <p className="t-small muted">A 1-minute movie is about <b style={{ color: "var(--text)" }}>{fmt(60 * 12 * 1.1)}–{fmt(60 * 35 * 1.1)} cr</b>, depending on the quality you choose per shot.</p>
            <div className="rows">{MODEL_ORDER.map((k) => <div key={k} className="row" style={{ padding: "6px 0", border: 0 }}><div className="main"><div className="title t-small">{MODELS[k].name} <span className="faint t-xs" style={{ fontWeight: 400 }}>{MODELS[k].model}</span></div></div><span className="num t-small">{MODELS[k].rate} cr/s</span></div>)}</div>
          </div></div>
          {movies.length > 0 && (
            <div className="panel"><div className="panel-head"><h3>Your movies</h3></div><div className="rows">
              {movies.map((m) => (
                <Link key={m.id} className="row click" href={`/app/movie/${m.id}/${m.status === "draft" ? "script" : "make"}`} style={{ color: "var(--text)", textDecoration: "none" }}>
                  <div className="thumb"><span className="dur">{mmss(m.shots.filter((s) => m.status === "draft" || s.state === "done").reduce((a, s) => a + s.sec, 0))}</span></div>
                  <div className="main"><div className="title">{m.name}</div><div className="meta">{m.status === "draft" ? "Draft" : m.status === "making" ? "Making…" : m.status === "failed" ? "Failed" : new Date(m.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {fmt(m.used)} cr</div></div>
                </Link>
              ))}
            </div></div>
          )}
        </div>
      </div>
    </section>
  );
}
