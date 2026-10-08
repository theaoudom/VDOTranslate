"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import {
  ArrowDownLeft, ArrowDownRight, ArrowUpLeft, ArrowUpRight, CircleCheck, CircleDot, Clapperboard, Copy, Download, FastForward,
  Film, Image as ImageIcon, LoaderCircle, MapPin, MoreHorizontal, MousePointerClick, OctagonAlert, Pause, Pencil, Play, Plus,
  RectangleHorizontal, RectangleVertical, Rewind, Square, Trash2, Type, Upload,
} from "lucide-react";
import { exportCost } from "@/domain/billing/estimate";
import { PLANS, type PlanId } from "@/domain/billing/pricing";
import { layerSpan, type FrameRatio, type LayerType, type Template, type TemplateLayer } from "@/domain/entities/Template";
import { Modal } from "../Modal";
import { Scene } from "../landing/Scene";
import { useToast } from "../Toast";
import { CostTable, MeterAfter } from "./bits";
import { fmt, mmss, tcode } from "./format";

export interface PreviewSource {
  kind: "job" | "upload";
  id: string;
  name: string;
  durationSec: number;
  url: string;
}

const LTYPES: Record<LayerType, { icon: typeof ImageIcon; name: string }> = {
  image: { icon: ImageIcon, name: "Image" },
  video: { icon: Clapperboard, name: "Video clip" },
  text: { icon: Type, name: "Text" },
};
const SAMPLE_DURATION = 60;
const frameAspect = (r: FrameRatio) => (r === "9:16" ? 9 / 16 : r === "1:1" ? 1 : 16 / 9);
const ratioCls = (r: FrameRatio) => (r === "9:16" ? "r916" : r === "1:1" ? "r11" : "");
const POSITIONS = [["tl", ArrowUpLeft, "Top left"], ["tr", ArrowUpRight, "Top right"], ["c", CircleDot, "Centre"], ["bl", ArrowDownLeft, "Bottom left"], ["br", ArrowDownRight, "Bottom right"]] as const;
type Pos = (typeof POSITIONS)[number][0];

export function rangeText(L: TemplateLayer) {
  if (L.range !== "part") return "Whole video";
  if (L.anchor === "end") return L.to === 0 ? `Last ${mmss(L.from)} of the video` : `${mmss(L.from)}–${mmss(L.to)} before the end`;
  return `${mmss(L.from)}–${mmss(L.to)}`;
}
const parseTime = (x: string) => { const p = x.split(":"); return p.length === 2 ? +p[0] * 60 + +p[1] : +x; };

export function TemplateEditor({ initialTemplates, sources: initialSources, initialSource, credits, plan }: {
  initialTemplates: Template[];
  sources: PreviewSource[];
  initialSource: PreviewSource | null;
  credits: number;
  plan: PlanId;
}) {
  const router = useRouter();
  const toast = useToast();
  const [templates, setTemplates] = useState(initialTemplates);
  const [tplId, setTplId] = useState(initialTemplates[0].id);
  const t = templates.find((x) => x.id === tplId) ?? templates[0];
  const tRef = useRef(t);
  tRef.current = t;
  const [sel, setSel] = useState<string | null>(null);
  const L = t.layers.find((x) => x.id === sel) ?? null;

  const [sources, setSources] = useState(initialSources);
  const [source, setSource] = useState<PreviewSource | null>(initialSource);
  const dur = source?.durationSec || SAMPLE_DURATION;
  const [srcAr, setSrcAr] = useState(16 / 9);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [menu, setMenu] = useState<null | "tpl" | "add" | "src">(null);
  const [modal, setModal] = useState<null | "rename" | "delete" | "export">(null);
  const [renameVal, setRenameVal] = useState("");
  const [bar, setBar] = useState<{ id: string; a: number; b: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const viewerRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const layerRefs = useRef(new Map<string, HTMLDivElement>());
  const fileRef = useRef<HTMLInputElement>(null);
  const srcFileRef = useRef<HTMLInputElement>(null);

  /* ── auto-save (debounced PATCH) ── */
  const pending = useRef<Record<string, Partial<Template>>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const flush = useCallback(async (keepalive = false) => {
    const work = pending.current;
    pending.current = {};
    if (!Object.keys(work).length) return;
    try {
      for (const [id, changes] of Object.entries(work)) {
        const res = await fetch(`/api/templates/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes), keepalive });
        if (!res.ok) throw new Error();
      }
      setSaveState("saved");
    } catch {
      setSaveState("error");
      toast("Couldn’t save your changes. Check your connection.", true);
    }
  }, [toast]);
  useEffect(() => () => { clearTimeout(saveTimer.current); void flush(true); }, [flush]);

  function patch(changes: Partial<Template>, id = tRef.current.id) {
    setTemplates((ts) => ts.map((x) => (x.id === id ? { ...x, ...changes } : x)));
    if (id === tRef.current.id) tRef.current = { ...tRef.current, ...changes };
    pending.current[id] = { ...pending.current[id], ...changes };
    setSaveState("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flush(), 600);
  }
  const updLayer = (id: string, changes: Partial<TemplateLayer>) =>
    patch({ layers: tRef.current.layers.map((x) => (x.id === id ? { ...x, ...changes } : x)) });

  /* ── geometry (percent of the frame) ── */
  const fa = frameAspect(t.ratio);
  const pan = t.pan;
  const mediaStyle = srcAr >= fa
    ? { width: (srcAr / fa) * 100 + "%", height: "100%", left: -((srcAr / fa) * 100 - 100) * pan / 100 + "%", top: 0 }
    : { width: "100%", height: (fa / srcAr) * 100 + "%", top: -((fa / srcAr) * 100 - 100) * pan / 100 + "%", left: 0 };
  const viewerW = () => viewerRef.current?.offsetWidth || 1;
  const viewerH = () => viewerRef.current?.offsetHeight || 1;
  const wPct = (x: TemplateLayer) => (x.type === "text" ? ((layerRefs.current.get(x.id)?.offsetWidth ?? 0) / viewerW()) * 100 : x.w);
  const hPct = (x: TemplateLayer) => (x.type === "text" ? ((layerRefs.current.get(x.id)?.offsetHeight ?? 0) / viewerH()) * 100 : (x.w * fa) / (x.ar || 1));
  const clamp = (x: TemplateLayer, nx: number, ny: number) => ({ x: Math.max(0, Math.min(100 - wPct(x), nx)), y: Math.max(0, Math.min(100 - hPct(x), ny)) });
  const snap = (x: TemplateLayer, p: Pos) => {
    const m = 4, w = wPct(x), h = hPct(x);
    return clamp(x, p === "c" ? (100 - w) / 2 : p[1] === "l" ? m : 100 - w - m, p === "c" ? (100 - h) / 2 : p[0] === "t" ? m : 100 - h - m);
  };
  const posOf = (x: TemplateLayer): Pos | null => {
    const m = 4, w = wPct(x), h = hPct(x);
    const opts: [Pos, number, number][] = [["tl", m, m], ["tr", 100 - w - m, m], ["c", (100 - w) / 2, (100 - h) / 2], ["bl", m, 100 - h - m], ["br", 100 - w - m, 100 - h - m]];
    return opts.find(([, px, py]) => Math.abs(px - x.x) < 0.8 && Math.abs(py - x.y) < 0.8)?.[0] ?? null;
  };

  /* ── player ── */
  useEffect(() => {
    if (source || !playing) return;
    let raf = 0, last = 0;
    const tick = (ts: number) => {
      if (last) setTime((v) => { const n = v + (ts - last) / 1000; if (n >= dur) { setPlaying(false); return dur; } return n; });
      last = ts;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, source, dur]);
  const seek = (s: number) => {
    const v = Math.max(0, Math.min(dur, s));
    if (videoRef.current) videoRef.current.currentTime = v;
    setTime(v);
  };
  const togglePlay = () => {
    const v = videoRef.current;
    if (v) { if (v.paused) v.play(); else v.pause(); }
    else { if (time >= dur) setTime(0); setPlaying((p) => !p); }
  };

  /* ── close menus on outside click / Escape ── */
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest(".menu-anchor")) setMenu(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(null); };
    document.addEventListener("click", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", esc); };
  }, []);

  /* ── drag on the preview: move / resize layers, pan the crop ── */
  const drag = useRef<null | { mode: "move" | "size" | "pan"; id?: string; sx: number; sy: number; x: number; y: number; w: number; pan: number; mw: number; mh: number }>(null);
  function onViewerDown(e: RPointerEvent<HTMLDivElement>) {
    const le = (e.target as HTMLElement).closest("[data-layer]") as HTMLElement | null;
    if (le) {
      e.preventDefault();
      const x = tRef.current.layers.find((l) => l.id === le.dataset.layer)!;
      setSel(x.id);
      drag.current = { mode: (e.target as HTMLElement).classList.contains("h") ? "size" : "move", id: x.id, sx: e.clientX, sy: e.clientY, x: x.x, y: x.y, w: x.w, pan: 0, mw: 0, mh: 0 };
    } else if (tRef.current.ratio !== "16:9") {
      e.preventDefault();
      drag.current = { mode: "pan", sx: e.clientX, sy: e.clientY, x: 0, y: 0, w: 0, pan: tRef.current.pan, mw: (mediaRef.current?.offsetWidth ?? 0) - viewerW(), mh: (mediaRef.current?.offsetHeight ?? 0) - viewerH() };
    } else return;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onViewerMove(e: RPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (d.mode === "pan") {
      const p = d.mw > 1 ? d.pan - (dx / d.mw) * 100 : d.mh > 1 ? d.pan - (dy / d.mh) * 100 : d.pan;
      patch({ pan: Math.max(0, Math.min(100, p)) });
      return;
    }
    const x = tRef.current.layers.find((l) => l.id === d.id)!;
    if (d.mode === "size") {
      const isText = x.type === "text";
      updLayer(x.id, { w: Math.max(isText ? 20 : 4, Math.min(isText ? 100 : 80, d.w + (dx / viewerW()) * 100 * (isText ? 1.5 : 1))) });
    } else {
      updLayer(x.id, clamp(x, d.x + (dx / viewerW()) * 100, d.y + (dy / viewerH()) * 100));
    }
  }
  const onViewerUp = () => { drag.current = null; };

  /* ── timeline bars: move or trim a layer's time ── */
  const tdrag = useRef<null | { id: string; mode: "l" | "r" | "m"; sx: number; a: number; b: number; w: number; moved: boolean; na?: number; nb?: number }>(null);
  function onBarDown(e: RPointerEvent<HTMLDivElement>, x: TemplateLayer) {
    e.preventDefault();
    e.stopPropagation();
    const [a, b] = layerSpan(x, dur);
    const cls = (e.target as HTMLElement).classList;
    tdrag.current = { id: x.id, mode: cls.contains("l") ? "l" : cls.contains("r") ? "r" : "m", sx: e.clientX, a, b, w: (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect().width, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
    setSel(x.id);
  }
  function onBarMove(e: RPointerEvent<HTMLDivElement>) {
    const d = tdrag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.sx) > 2) d.moved = true;
    if (!d.moved) return;
    const delta = ((e.clientX - d.sx) / d.w) * dur;
    let a = d.a, b = d.b;
    const len = b - a;
    if (d.mode === "m") { a = Math.max(0, Math.min(dur - len, a + delta)); b = a + len; }
    else if (d.mode === "l") a = Math.max(0, Math.min(b - 0.5, a + delta));
    else b = Math.min(dur, Math.max(a + 0.5, b + delta));
    d.na = a; d.nb = b;
    setBar({ id: d.id, a, b });
  }
  function onBarUp() {
    const d = tdrag.current;
    tdrag.current = null;
    setBar(null);
    if (!d || !d.moved || d.na == null || d.nb == null) return;
    const x = tRef.current.layers.find((l) => l.id === d.id)!;
    let changes: Partial<TemplateLayer>;
    if (d.na <= 0.05 && d.nb >= dur - 0.05) changes = { range: "all" };
    else {
      const anchor = x.anchor ?? "start";
      changes = anchor === "end"
        ? { range: "part", anchor, from: Math.round((dur - d.na) * 10) / 10, to: Math.round((dur - d.nb) * 10) / 10 }
        : { range: "part", anchor, from: Math.round(d.na * 10) / 10, to: Math.round(d.nb * 10) / 10 };
    }
    updLayer(x.id, changes);
    toast(`${x.name}: ${rangeText({ ...x, ...changes })}`);
  }
  const onLanesClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest(".tname,[data-tsel]")) return;
    const lane = e.currentTarget.querySelector(".lane")!.getBoundingClientRect();
    seek(((e.clientX - lane.left) / lane.width) * dur);
  };

  /* ── layer actions ── */
  function addLayer(type: LayerType) {
    setMenu(null);
    const id = "l" + Date.now();
    const layer: TemplateLayer = {
      id, type, name: LTYPES[type].name, x: type === "image" ? 5 : 10, y: type === "text" ? 82 : type === "video" ? 50 : 5,
      w: type === "text" ? 60 : type === "video" ? 60 : 20, op: 100, range: "all", anchor: "start", from: 0, to: Math.min(10, dur),
      asset: null, ar: type === "video" ? 16 / 9 : 1, text: type === "text" ? "Your text here" : null, style: "dark", sound: false,
    };
    patch({ layers: [...tRef.current.layers, layer] });
    setSel(id);
    toast(`${LTYPES[type].name} added. Drag it into place.`);
  }
  function delLayer(id: string) {
    patch({ layers: tRef.current.layers.filter((x) => x.id !== id) });
    if (sel === id) setSel(null);
    toast("Layer removed");
  }
  async function uploadAsset(file: File) {
    if (!L) return;
    const target = L;
    toast("Uploading " + file.name + "…");
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/templates/assets", { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast(body.error ?? "Upload failed", true); return; }
    updLayer(target.id, { asset: body.asset, ar: body.ar, type: body.type === "video" ? "video" : target.type === "text" ? "image" : body.type });
    toast("Added " + file.name);
  }

  /* ── template actions ── */
  async function newTemplate(name: string, from?: Template) {
    await flush();
    const res = await fetch("/api/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(from ? { name, ratio: from.ratio, pan: from.pan, layers: from.layers } : { name }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast(body.error ?? "Couldn’t create the template", true); return; }
    setTemplates((ts) => [...ts, body]);
    setTplId(body.id);
    setSel(null);
    return body as Template;
  }
  async function deleteTemplate() {
    setModal(null);
    const gone = t;
    await flush();
    const res = await fetch(`/api/templates/${gone.id}`, { method: "DELETE" });
    if (!res.ok) { toast("Couldn’t delete the template", true); return; }
    const rest = templates.filter((x) => x.id !== gone.id);
    if (rest.length) { setTemplates(rest); setTplId(rest[0].id); }
    else { setTemplates([]); await newTemplate("My brand"); }
    setSel(null);
    toast("Template deleted");
  }
  async function useUploadedSource(file: File) {
    setMenu(null);
    toast("Uploading " + file.name + "…");
    const form = new FormData();
    form.append("video", file);
    const res = await fetch("/api/uploads", { method: "POST", body: form });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast(body.error ?? "Upload failed", true); return; }
    const s: PreviewSource = { kind: "upload", id: body.uploadId, name: body.name, durationSec: body.durationSec, url: `/api/uploads/${body.uploadId}/video` };
    setSources((list) => [s, ...list]);
    setSource(s);
    setTime(0);
    toast("Uploaded " + body.name);
  }
  async function startExport() {
    if (!source) return;
    setBusy(true);
    await flush();
    const res = await fetch("/api/edits", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId: t.id, ...(source.kind === "job" ? { sourceJobId: source.id } : { uploadId: source.id }) }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    setModal(null);
    if (!res.ok) { toast(body.error ?? "Couldn’t start the export", true); return; }
    toast(`Exporting. ${fmt(body.held)} cr held.`);
    router.push(`/app/videos/${body.jobId}`);
    router.refresh();
  }

  const cost = exportCost(dur);
  const pos = L ? posOf(L) : null;
  const shown = (x: TemplateLayer) => { const [a, b] = layerSpan(x, dur); return time >= a && time <= b; };
  const reversed = t.layers.slice().reverse();

  return (
    <section>
      <div className="page-head">
        <div><h1 className="t-h2">Templates</h1><p className="sub">Design it once with images, text and video clips. Use it on every video you translate.</p></div>
        <div className="hstack">
          <select className="select" style={{ width: "auto", minWidth: 190 }} aria-label="Template" value={t.id}
            onChange={async (e) => { if (e.target.value === "__new") { if (await newTemplate(`Template ${templates.length + 1}`)) toast("New template created"); } else { await flush(); setTplId(e.target.value); setSel(null); } }}>
            {templates.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            <option value="__new">+ New template</option>
          </select>
          <div className="menu-anchor">
            <button className="btn icon" onClick={() => setMenu(menu === "tpl" ? null : "tpl")} aria-haspopup="menu" aria-expanded={menu === "tpl"} aria-label="Template actions"><MoreHorizontal /></button>
            <div className="menu" role="menu" hidden={menu !== "tpl"}>
              <button role="menuitem" onClick={() => { setMenu(null); setRenameVal(t.name); setModal("rename"); }}><Pencil />Rename</button>
              <button role="menuitem" onClick={async () => { setMenu(null); if (await newTemplate(t.name + " copy", t)) toast("Template duplicated"); }}><Copy />Duplicate</button>
              <hr />
              <button role="menuitem" className="danger" onClick={() => { setMenu(null); setModal("delete"); }}><Trash2 />Delete</button>
            </div>
          </div>
          <button className="btn primary" disabled={!source} onClick={() => setModal("export")}><Download />Export this video · {fmt(cost)} cr</button>
        </div>
      </div>

      <div className="editor">
        <div className="stack" style={{ gap: "var(--sp-3)" }}>
          <div ref={viewerRef} className={"viewer " + ratioCls(t.ratio) + (t.ratio !== "16:9" ? " pannable" : "")}
            onPointerDown={onViewerDown} onPointerMove={onViewerMove} onPointerUp={onViewerUp} onPointerCancel={onViewerUp}>
            <div ref={mediaRef} className="media" style={mediaStyle}>
              {source ? (
                <video ref={videoRef} key={source.url} src={source.url} muted playsInline preload="metadata"
                  onLoadedMetadata={(e) => setSrcAr(e.currentTarget.videoWidth / (e.currentTarget.videoHeight || 1) || 16 / 9)}
                  onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
                  onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
              ) : <Scene idp="ed-" />}
            </div>
            {t.layers.map((x) => (
              <div key={x.id} ref={(el) => { if (el) layerRefs.current.set(x.id, el); else layerRefs.current.delete(x.id); }}
                className={"layer" + (x.type === "text" ? "" : " box") + (x.id === sel ? " sel" : "") + (shown(x) ? "" : " dim")}
                data-layer={x.id}
                style={{ left: x.x + "%", top: x.y + "%", ...(x.type === "text" ? { fontSize: (x.w * 0.07).toFixed(2) + "cqw" } : { width: x.w + "%", aspectRatio: String(x.ar || 1) }) }}>
                {x.type === "text" ? (
                  <div className={"txt " + (x.style ?? "dark")} style={{ opacity: x.op / 100 }}>{x.text || "Your text"}</div>
                ) : x.asset ? (
                  x.type === "video"
                    ? <video src={`/api/templates/assets/${x.asset}`} muted autoPlay loop playsInline style={{ opacity: x.op / 100 }} />
                    // eslint-disable-next-line @next/next/no-img-element
                    : <img src={`/api/templates/assets/${x.asset}`} alt="" style={{ opacity: x.op / 100 }} />
                ) : x.type === "video" ? (
                  <div className="adph" style={{ opacity: x.op / 100 }}><b>Video clip</b><span>Upload a clip</span></div>
                ) : (
                  <div className="imgph" style={{ opacity: x.op / 100 }}><ImageIcon /></div>
                )}
                <i className="h" />
              </div>
            ))}
          </div>

          <div className="transport">
            <button className="btn ghost icon sm" onClick={() => seek(time - 5)} aria-label="Back 5 seconds"><Rewind /></button>
            <button className="btn icon sm" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>{playing ? <Pause /> : <Play />}</button>
            <button className="btn ghost icon sm" onClick={() => seek(time + 5)} aria-label="Forward 5 seconds"><FastForward /></button>
            <span className="tc-big"><b style={{ fontWeight: 400 }}>{tcode(time)}</b> <span>/ {tcode(dur)}</span></span>
            <span style={{ flex: 1 }} />
            <span className="faint t-xs">{t.ratio !== "16:9" ? "Drag the video to choose what stays in frame" : "Drag a layer to move it, its corner to resize"}</span>
          </div>

          <div className="timeline">
            <div className="ruler">{[0, 1, 2, 3, 4].map((i) => <span key={i} style={{ left: i * 20 + "%" }}>{mmss((dur * i) / 5)}</span>)}</div>
            <div className="lanes seek" onClick={onLanesClick}>
              {reversed.map((x) => {
                const [a0, b0] = bar?.id === x.id ? [bar.a, bar.b] : layerSpan(x, dur);
                const b1 = Math.max(a0 + 0.3, b0);
                const Icon = LTYPES[x.type].icon;
                return (
                  <div key={x.id} className="track">
                    <div className="tname"><Icon />{x.name}</div>
                    <div className="lane">
                      <div className={"clip overlay" + (x.id === sel ? " sel" : "")} data-tsel={x.id}
                        style={{ left: (a0 / dur) * 100 + "%", width: ((b1 - a0) / dur) * 100 + "%" }}
                        onPointerDown={(e) => onBarDown(e, x)} onPointerMove={onBarMove} onPointerUp={onBarUp} onPointerCancel={onBarUp}>
                        <i className="eh l" />{x.name}<i className="eh r" />
                      </div>
                    </div>
                  </div>
                );
              })}
              <div className="track"><div className="tname"><Film />Video</div><div className="lane"><div className="clip video" style={{ left: 0, width: "100%" }}>{source?.name ?? "Sample video"}</div></div></div>
              <div className="playhead" style={{ left: `calc(88px + (100% - 96px) * ${Math.min(1, time / dur)})`, top: -22 }} />
            </div>
          </div>

          <p className="faint t-xs hstack">
            {saveState === "saving" ? <><LoaderCircle style={{ width: 14, height: 14 }} />Saving…</>
              : saveState === "error" ? <><OctagonAlert style={{ width: 14, height: 14, color: "var(--rec)" }} />Not saved. Check your connection.</>
              : <><CircleCheck style={{ width: 14, height: 14, color: "var(--ok)" }} />Changes save automatically.</>}
            {" "}Previewing on {source?.name ?? "a sample"} ·{" "}
            <span className="menu-anchor">
              <button className="linkbtn" onClick={() => setMenu(menu === "src" ? null : "src")}>Use another video</button>
              <span className="menu" role="menu" hidden={menu !== "src"} style={{ left: 0, right: "auto", minWidth: 260 }}>
                {sources.map((s) => (
                  <button key={s.kind + s.id} role="menuitem" onClick={() => { setMenu(null); setSource(s); setTime(0); setPlaying(false); }}><Film />{s.name} <span className="k">{mmss(s.durationSec)}</span></button>
                ))}
                {sources.length > 0 && <hr />}
                <button role="menuitem" onClick={() => srcFileRef.current?.click()}><Upload />Upload a video…</button>
              </span>
            </span>
            <input ref={srcFileRef} type="file" accept="video/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) useUploadedSource(f); }} />
          </p>
        </div>

        <div className="stack">
          <div className="panel">
            <div className="panel-head">
              <h3>Layers</h3>
              <div className="menu-anchor">
                <button className="btn sm" onClick={() => setMenu(menu === "add" ? null : "add")} aria-haspopup="menu" aria-expanded={menu === "add"}><Plus />Add</button>
                <div className="menu" role="menu" hidden={menu !== "add"}>
                  {(Object.keys(LTYPES) as LayerType[]).map((k) => { const Icon = LTYPES[k].icon; return <button key={k} role="menuitem" onClick={() => addLayer(k)}><Icon />{LTYPES[k].name}</button>; })}
                </div>
              </div>
            </div>
            {t.layers.length ? (
              <div className="rows">
                {reversed.map((x) => {
                  const Icon = LTYPES[x.type].icon;
                  return (
                    <div key={x.id} className={"row click" + (x.id === sel ? " on" : "")} onClick={(e) => { if (!(e.target as HTMLElement).closest("button")) setSel(x.id); }}>
                      <span className="ic-box sm"><Icon /></span>
                      <div className="main"><div className="title t-small">{x.name}</div><div className="meta">{rangeText(x)}</div></div>
                      <button className="btn ghost icon sm" onClick={() => delLayer(x.id)} aria-label={"Delete " + x.name}><Trash2 /></button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="panel-body"><p className="muted t-small">No layers yet. Add your logo, an image, an ad clip or text.</p></div>
            )}
          </div>

          {!L ? (
            <div className="panel"><div className="panel-body"><div className="empty" style={{ border: 0, padding: "var(--sp-6) var(--sp-3)" }}><div className="glyph"><MousePointerClick /></div><p>Click a layer on the video or in the list to change it, or add a new one.</p></div></div></div>
          ) : (
            <div className="panel">
              <div className="panel-head">
                <input key={L.id + ":name"} className="input lname" defaultValue={L.name} aria-label="Layer name"
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== L.name) updLayer(L.id, { name: v }); }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                <button className="btn ghost icon sm" onClick={() => delLayer(L.id)} aria-label="Delete layer"><Trash2 /></button>
              </div>
              <div className="panel-body stack">
                {L.type === "text" ? (
                  <>
                    <div className="field"><label className="label" htmlFor="p-text">Text</label>
                      <input className="input" id="p-text" value={L.text ?? ""} onChange={(e) => updLayer(L.id, { text: e.target.value })} /></div>
                    <div className="field"><span className="label">Style</span>
                      <div className="seg">{([["dark", "Dark"], ["light", "Light"], ["brand", "Brand"]] as const).map(([k, lbl]) => <button key={k} aria-pressed={(L.style ?? "dark") === k} onClick={() => updLayer(L.id, { style: k })}>{lbl}</button>)}</div></div>
                  </>
                ) : (
                  <div className="row" style={{ padding: 0, border: 0, background: "none" }}>
                    <div className="thumb" style={{ width: 52, height: 40, display: "grid", placeItems: "center", background: "var(--surface-3)" }}>
                      {L.asset ? (L.type === "video" ? <Clapperboard /> :
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/templates/assets/${L.asset}`} alt="" style={{ maxWidth: "100%", maxHeight: "100%" }} />) : <ImageIcon style={{ color: "var(--text-3)" }} />}
                    </div>
                    <div className="main"><div className="title t-small">{L.asset ? "Your " + LTYPES[L.type].name.toLowerCase() : "No " + LTYPES[L.type].name.toLowerCase() + " yet"}</div>
                      <div className="meta">{L.type === "video" ? "MP4 or MOV, a short ad or intro" : "Logo, sticker, product photo… PNG keeps transparency"}</div></div>
                    <button className="btn sm" onClick={() => fileRef.current?.click()}><Upload />{L.asset ? "Replace" : "Upload"}</button>
                    <input ref={fileRef} type="file" hidden accept={L.type === "video" ? "video/mp4,video/quicktime,video/webm" : "image/png,image/jpeg,image/webp"}
                      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) uploadAsset(f); }} />
                  </div>
                )}

                <div className="field"><span className="label">Position</span>
                  <div className="seg" style={{ width: "max-content" }}>
                    {POSITIONS.map(([k, Icon, label]) => <button key={k} aria-pressed={pos === k} aria-label={label} title={label} onClick={() => updLayer(L.id, snap(L, k))}><Icon /></button>)}
                  </div>
                </div>
                <div className="prop"><label htmlFor="p-w">Size</label>
                  <input className="range" id="p-w" type="range" min={L.type === "text" ? 20 : 4} max={L.type === "text" ? 100 : 80} value={Math.round(L.w)}
                    onChange={(e) => { const w = +e.target.value; const keep = posOf(L); const next = { ...L, w }; updLayer(L.id, keep ? { w, ...snap(next, keep) } : { w, ...clamp(next, L.x, L.y) }); }} />
                  <span className="num">{Math.round(L.w)}%</span></div>
                <div className="prop"><label htmlFor="p-op">Opacity</label>
                  <input className="range" id="p-op" type="range" min={10} max={100} value={L.op} onChange={(e) => updLayer(L.id, { op: +e.target.value })} />
                  <span className="num">{L.op}%</span></div>

                <div className="field"><span className="label">Show</span>
                  <div className="seg">
                    <button aria-pressed={L.range !== "part"} onClick={() => updLayer(L.id, { range: "all" })}>Whole video</button>
                    <button aria-pressed={L.range === "part"} onClick={() => {
                      const anchor = L.anchor ?? "start";
                      const changes: Partial<TemplateLayer> = { range: "part", anchor };
                      if (anchor === "start" && (L.to <= L.from || L.from >= dur)) { changes.from = Math.min(Math.round(time * 10) / 10, dur - 1); changes.to = Math.min(dur, (changes.from ?? 0) + 8); }
                      updLayer(L.id, changes);
                    }}>Only part of it</button>
                  </div>
                </div>
                {L.range === "part" && (
                  <div className="timebox stack">
                    <div className="field"><span className="hint">Count time from</span>
                      <div className="seg">
                        {(["start", "end"] as const).map((k) => (
                          <button key={k} aria-pressed={(L.anchor ?? "start") === k} onClick={() => {
                            if ((L.anchor ?? "start") === k) return;
                            const [a, b] = layerSpan(L, dur);
                            updLayer(L.id, k === "end" ? { anchor: "end", from: dur - a, to: dur - b } : { anchor: "start", from: a, to: b });
                          }}>{k === "start" ? "Start of video" : "End of video"}</button>
                        ))}
                      </div>
                    </div>
                    <div className="two">
                      {(["from", "to"] as const).map((k) => (
                        <div key={k} className="field">
                          <label className="hint" htmlFor={"r-" + k}>{L.anchor === "end" ? (k === "from" ? "Appears (before end)" : "Disappears (before end)") : (k === "from" ? "Appears at" : "Disappears at")}</label>
                          <input key={`${L.id}:${k}:${L[k]}`} className="input num" id={"r-" + k} defaultValue={mmss(L[k])}
                            onBlur={(e) => {
                              let v = parseTime(e.target.value); if (isNaN(v)) v = 0; v = Math.max(0, Math.min(dur, v));
                              const next = { ...L, [k]: v };
                              if (next.anchor === "end") { if (next.from <= next.to) next.from = Math.min(dur, next.to + 5); } else if (next.to <= next.from) next.to = Math.min(dur, next.from + 5);
                              updLayer(L.id, { from: next.from, to: next.to });
                            }}
                            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                          <button className="linkbtn t-xs" style={{ alignSelf: "flex-start" }} onClick={() => {
                            const v = Math.round((L.anchor === "end" ? dur - time : time) * 10) / 10;
                            const next = { ...L, [k]: Math.max(0, Math.min(dur, v)) };
                            if (next.anchor === "end") { if (next.from <= next.to) next.from = Math.min(dur, next.to + 5); } else if (next.to <= next.from) next.to = Math.min(dur, next.from + 5);
                            updLayer(L.id, { from: next.from, to: next.to });
                            toast(`${L.name}: ${rangeText(next)}`);
                          }}><MapPin style={{ width: 12, height: 12, verticalAlign: -1 }} /> {k === "from" ? "Start here" : "End here"}</button>
                        </div>
                      ))}
                    </div>
                    <span className="hint">{L.anchor === "end" ? "Good for outro ads: it stays at the end of every video, whatever its length." : "Tip: drag the bar on the timeline, or play to a moment and press Start here / End here."}</span>
                  </div>
                )}
                {L.type === "video" && (
                  <label className="switch"><input type="checkbox" checked={Boolean(L.sound)} onChange={(e) => updLayer(L.id, { sound: e.target.checked })} /><span className="track" />Play the clip’s sound</label>
                )}
              </div>
            </div>
          )}

          <div className="panel">
            <div className="panel-head"><h3>Frame</h3></div>
            <div className="panel-body stack">
              <div className="seg">
                {([["16:9", RectangleHorizontal], ["9:16", RectangleVertical], ["1:1", Square]] as const).map(([r, Icon]) => (
                  <button key={r} aria-pressed={t.ratio === r} onClick={() => { if (t.ratio !== r) patch({ ratio: r, pan: 50 }); }}><Icon />{r}</button>
                ))}
              </div>
              {t.ratio !== "16:9" ? (
                <>
                  <div className="prop"><label htmlFor="p-pan">Crop</label>
                    <input className="range" id="p-pan" type="range" min={0} max={100} value={Math.round(t.pan)} onChange={(e) => patch({ pan: +e.target.value })} />
                    <span className="num">{t.pan < 35 ? "Left" : t.pan > 65 ? "Right" : "Centre"}</span></div>
                  <span className="hint">Or drag the video in the preview to choose what stays in frame.</span>
                </>
              ) : <span className="hint">Choose 9:16 or 1:1 to crop a wide video for TikTok, Reels or Shorts. You choose what stays in frame.</span>}
            </div>
          </div>
        </div>
      </div>

      {modal === "rename" && (
        <Modal title="Rename template" okLabel="Save" onClose={() => setModal(null)}
          onOk={() => { const v = renameVal.trim(); if (v) { patch({ name: v }); toast("Template renamed"); } setModal(null); }}>
          <div className="field"><label className="label" htmlFor="tpl-name">Name</label>
            <input className="input" id="tpl-name" value={renameVal} onChange={(e) => setRenameVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { const v = renameVal.trim(); if (v) { patch({ name: v }); toast("Template renamed"); } setModal(null); } }} /></div>
        </Modal>
      )}
      {modal === "delete" && (
        <Modal title={`Delete “${t.name}”?`} okLabel="Delete template" danger onClose={() => setModal(null)} onOk={deleteTemplate}>
          <p>Videos you already exported keep their logo and clips. This only removes the template.</p>
        </Modal>
      )}
      {modal === "export" && source && (
        <Modal title="Export video" okLabel={busy ? "Starting…" : `Export · ${fmt(cost)} cr`} okDisabled={busy || cost > credits} onClose={() => setModal(null)} onOk={startExport}>
          <div className="stack">
            <CostTable lines={[{ label: "Render", detail: `${(dur / 60).toFixed(1)} min × 1 cr · ${PLANS[plan].res} · ${t.ratio} · ${t.layers.length} layers`, credits: cost }]} total={cost} label="Fixed price" />
            <MeterAfter cost={cost} credits={credits} cap={PLANS[plan].monthly} />
            {cost > credits && <div className="note rec"><OctagonAlert /><div><b>Not enough credits.</b> Top-ups are coming in the next update.</div></div>}
          </div>
        </Modal>
      )}
    </section>
  );
}
