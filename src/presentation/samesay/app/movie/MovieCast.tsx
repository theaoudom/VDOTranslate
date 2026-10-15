"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Film, ImageUp, LoaderCircle, RefreshCw, Shield, Sparkles } from "lucide-react";
import { MOVIE_COST, PHOTO_CONSENT, type PublicMovie } from "@/domain/movie/Movie";
import { Modal } from "../../Modal";
import { useToast } from "../../Toast";
import { sendFile } from "../sendFile";
import { api, PageHead, Portrait, Stepper } from "./parts";

type Char = PublicMovie["cast"][number];

/** Step 3: a picture for every character, made by AI or from the user's own photo. */
export function MovieCast({ initial }: { initial: PublicMovie }) {
  const router = useRouter();
  const toast = useToast();
  const [m, setM] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [photoFor, setPhotoFor] = useState<Char | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  function editChar(c: Char, patch: { name?: string; desc?: string }) {
    setM((x) => ({ ...x, cast: x.cast.map((y) => (y.id === c.id ? { ...y, ...patch } : y)) }));
    clearTimeout(timers.current[c.id]);
    timers.current[c.id] = setTimeout(async () => {
      try { await api(`/api/movies/${m.id}`, "PATCH", { character: { id: c.id, ...patch } }); } catch (e) { toast((e as Error).message, true); }
    }, 700);
  }

  async function portrait(c: Char) {
    setBusy(c.id);
    try { setM(await api(`/api/movies/${m.id}/portrait`, "POST", { characterId: c.id })); toast(`New portrait for ${c.name} · ${MOVIE_COST.portrait} cr`); router.refresh(); }
    catch (e) { toast((e as Error).message, true); }
    setBusy(null);
  }

  async function aiFace(c: Char) {
    try { setM(await api(`/api/movies/${m.id}/photo?characterId=${c.id}`, "DELETE")); toast(`${c.name} uses an AI face again`); }
    catch (e) { toast((e as Error).message, true); }
  }

  return (
    <section>
      <PageHead title="Meet the characters" sub="Each character gets a reference portrait, so their face stays the same in every shot." />
      <Stepper at="cast" movieId={m.id} />
      <div className="mv-cast">
        {m.cast.map((c) => (
          <div key={c.id} className="panel"><div className="panel-body stack">
            <div className="hstack" style={{ gap: "var(--sp-4)", alignItems: "flex-start" }}>
              <Portrait movieId={m.id} c={c} size={96} />
              <div className="stack" style={{ gap: 6, flex: 1, minWidth: 0 }}>
                <span className={"badge" + (c.role === "Lead" ? " accent" : "")} style={{ alignSelf: "flex-start" }}>{c.role}</span>
                <input className="input" value={c.name} aria-label="Name" onChange={(e) => editChar(c, { name: e.target.value })} />
              </div>
            </div>
            <textarea className="textarea" rows={3} aria-label="Looks and personality" value={c.desc} onChange={(e) => editChar(c, { desc: e.target.value })} />
            <div className="two" style={{ gap: 6 }}>
              {c.hasPhoto
                ? <button className="btn sm" onClick={() => aiFace(c)}><Sparkles />Use an AI face</button>
                : <button className="btn sm" disabled={busy === c.id} onClick={() => portrait(c)}>{busy === c.id ? <><LoaderCircle />Drawing…</> : <><RefreshCw />New portrait · {MOVIE_COST.portrait} cr</>}</button>}
              <button className="btn sm" onClick={() => setPhotoFor(c)}><ImageUp />{c.hasPhoto ? "Change photo" : "Use a photo"}</button>
            </div>
          </div></div>
        ))}
      </div>
      <div className="note" style={{ margin: "var(--sp-4) 0" }}><Shield /><div>Characters are made up by AI, or you can <b>use a photo</b> of yourself or someone who agreed. Photos of children or famous people can’t be used. Photos are only used for this movie and deleted with it.</div></div>
      <div className="hstack" style={{ justifyContent: "flex-end" }}>
        <Link className="btn" href={`/app/movie/${m.id}/script`}>Back</Link>
        <Link className="btn primary lg" href={`/app/movie/${m.id}/shots`}><Film />Next: shots</Link>
      </div>
      {photoFor && <PhotoModal movieId={m.id} c={photoFor} onClose={() => setPhotoFor(null)} onDone={(next) => { setM(next); setPhotoFor(null); toast(`${photoFor.name} now uses your photo`); }} />}
    </section>
  );
}

/** Use a photo as a character. Needs a photo and the consent box before it can be used. */
function PhotoModal({ movieId, c, onClose, onDone }: { movieId: string; c: Char; onClose: () => void; onDone: (m: PublicMovie) => void }) {
  const toast = useToast();
  const [file, setFile] = useState<{ key: string; name: string; url: string } | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function choose(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    try { const r = await sendFile<{ key: string; name: string }>("movie", f); setFile({ key: r.key, name: f.name, url: URL.createObjectURL(f) }); }
    catch (e) { toast((e as Error).message, true); }
    setBusy(false);
  }
  async function use() {
    if (!file || !ok) return;
    setBusy(true);
    try { onDone(await api(`/api/movies/${movieId}/photo`, "POST", { characterId: c.id, key: file.key, consent: true })); }
    catch (e) { toast((e as Error).message, true); setBusy(false); }
  }

  return (
    <Modal title={`Use a photo for ${c.name}`} okLabel="Use this photo" okDisabled={!file || !ok || busy} onOk={use} onClose={onClose}>
      <div className="stack">
        <label className="mv-upload" htmlFor="ph-file">
          <Portrait c={{ ...c, hasPhoto: false, hasPortrait: false, ver: 1 }} size={64} preview={file?.url} />
          <div className="stack" style={{ gap: 2 }}>
            <b className="t-small">{busy && !file ? "Uploading…" : file?.name ?? "Choose a photo"}</b>
            <span className="faint t-xs">JPG or PNG · one face, looking at the camera · good light</span>
          </div>
          <input type="file" id="ph-file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <label className="check"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /><span>{PHOTO_CONSENT}</span></label>
        <p className="faint t-xs">Using a photo is free. It’s only used to make this movie and is deleted with it. Scenes that are sexual, hurtful or misleading about a real person are blocked.</p>
      </div>
    </Modal>
  );
}
