"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AudioLines, CloudUpload, Facebook, Film, Instagram, Music2, OctagonAlert, RefreshCw, Scissors, SlidersHorizontal, Youtube } from "lucide-react";
import { PLANS, type PlanId } from "@/domain/billing/pricing";
import { DEFAULT_SPLIT, planParts, splitEstimate, SPLIT_PRESET_ORDER, SPLIT_PRESETS, type SplitPresetId, type SplitSettings } from "@/domain/split/Split";
import { useToast } from "../Toast";
import { CostTable, MeterAfter } from "./bits";
import { fmt, mb, mmss } from "./format";
import { useOpenSettings } from "./Settings";
import { UploadDrop } from "./UploadDrop";

const PRESET_ICONS: Record<SplitPresetId, typeof Music2> = { tiktok: Music2, reels: Instagram, shorts: Youtube, facebook: Facebook, custom: SlidersHorizontal };

export interface SplitSource {
  kind: "upload" | "job";
  id: string;
  name: string;
  durationSec: number;
  size: number | null;
}

/** No video yet: the drop zone from the prototype. */
export function SplitUpload() {
  const router = useRouter();
  return (
    <section>
      <div className="page-head"><div><h1 className="t-h2">Auto-split</h1><p className="sub">Cut one long video into parts for social media.</p></div></div>
      <UploadDrop className="drop" onUploaded={(v) => router.push(`/app/split?upload=${v.uploadId}`)}>
        <CloudUpload style={{ width: 24, height: 24, color: "var(--text-2)" }} />
        <div className="t-h4">Drop the video you want to split</div>
        <div className="t-small muted">MP4, MOV or WEBM · up to 2 GB</div>
        <span className="btn sm">Browse files</span>
      </UploadDrop>
    </section>
  );
}

function Ruler({ dur }: { dur: number }) {
  return <div className="ruler">{[0, 1, 2, 3, 4].map((i) => <span key={i} style={{ left: i * 20 + "%" }}>{mmss((dur * i) / 5)}</span>)}</div>;
}

/** Settings, a live preview of the parts, and the fixed price. */
export function SplitForm({ source, plan, credits, templates }: { source: SplitSource; plan: PlanId; credits: number; templates: { id: string; name: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const openSettings = useOpenSettings();
  const [s, setS] = useState<SplitSettings>(DEFAULT_SPLIT);
  const [tpl, setTpl] = useState("");
  const [starting, setStarting] = useState(false);
  const set = (patch: Partial<SplitSettings>) => setS((x) => ({ ...x, ...patch }));

  const dur = source.durationSec;
  const parts = planParts(dur, s);
  const est = splitEstimate(dur, s, Boolean(tpl));
  const cutOnly = splitEstimate(dur, { reframe: false, label: false }, false).total;
  const short = est.total > credits;
  const presetLen = SPLIT_PRESETS[s.preset].len;
  const each = dur / parts.length;
  const cap = Math.max(PLANS[plan].monthly, credits);

  async function start() {
    setStarting(true);
    const res = await fetch("/api/splits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [source.kind === "job" ? "sourceJobId" : "uploadId"]: source.id, settings: s, templateId: tpl || undefined }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setStarting(false); toast(body.error ?? "Couldn’t start. Please try again.", true); return; }
    toast(`Started. ${fmt(body.held)} cr held.`);
    router.push(`/app/videos/${body.jobId}`);
    router.refresh();
  }

  return (
    <section>
      <div className="page-head"><div><h1 className="t-h2">Auto-split</h1><p className="sub">Cut one long video into parts for social media.</p></div></div>
      <div className="grid g-2-1">
        <div className="stack">
          <div className="panel">
            <div className="panel-head"><h3>Video</h3><Link className="btn ghost sm" href="/app/split"><RefreshCw />Replace</Link></div>
            <div className="row" style={{ border: 0 }}>
              <div className="thumb"><span className="dur">{mmss(dur)}</span></div>
              <div className="main"><div className="title">{source.name}</div><div className="meta">{source.size ? mb(source.size) + " · " : ""}{mmss(dur)}{source.kind === "job" ? " · translated" : ""}</div></div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Preview</h3><span className="faint t-xs num">{parts.length} parts · about {mmss(each)} each</span></div>
            <div className="panel-body stack">
              <div className="timeline">
                <Ruler dur={dur} />
                <div className="track"><div className="tname"><Film />Video</div><div className="lane"><div className="clip video" style={{ left: 0, width: "100%" }}>{source.name}</div></div></div>
                <div className="track">
                  <div className="tname"><Scissors />Parts</div>
                  <div className="lane">
                    {parts.map((p, i) => (
                      <div key={i} className={"clip " + (i % 2 ? "pc" : "pa")} title={`Part ${i + 1}`}
                        style={{ left: `calc(${(p.from / dur) * 100}% + 1px)`, width: `calc(${((p.to - p.from) / dur) * 100}% - 2px)` }}>
                        {parts.length <= 16 ? i + 1 : ""}
                      </div>
                    ))}
                  </div>
                </div>
                {parts.slice(0, -1).map((p, i) => <div key={i} className="cut" style={{ left: `calc(88px + (100% - 96px) * ${p.to / dur})` }} />)}
              </div>
              {s.silence && <div className="note"><AudioLines /><div>Cuts move up to 4 seconds to land on a pause, so nobody is cut off mid-sentence.</div></div>}
            </div>
            <div className="table-wrap" style={{ borderTop: "1px solid var(--line)" }}>
              <table className="table">
                <thead><tr><th>Part</th><th>From</th><th>To</th><th className="r">Length</th></tr></thead>
                <tbody>
                  {parts.map((p, i) => {
                    const over = s.mode === "count" && s.preset !== "custom" && p.to - p.from > presetLen + 0.5;
                    return (
                      <tr key={i}>
                        <td>{s.label ? `Part ${i + 1}/${parts.length}` : `Part ${i + 1}`}</td>
                        <td className="num">{mmss(p.from)}</td>
                        <td className="num">{mmss(p.to)}</td>
                        <td className="r num" style={over ? { color: "var(--rec)" } : undefined}>{mmss(p.to - p.from)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="stack sticky">
          <div className="panel">
            <div className="panel-head"><h3>Settings</h3></div>
            <div className="panel-body stack">
              <div className="field">
                <span className="label">Made for</span>
                <div className="hstack">
                  {SPLIT_PRESET_ORDER.map((k) => {
                    const Icon = PRESET_ICONS[k], p = SPLIT_PRESETS[k];
                    return (
                      <button key={k} className="chip" aria-pressed={s.preset === k} onClick={() => set({ preset: k, len: p.len, mode: "length" })}>
                        <Icon />{p.name}{k !== "custom" ? " · " + (p.len >= 120 ? p.len / 60 + "m" : p.len + "s") : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="field">
                <span className="label">Split by</span>
                <div className="seg">
                  <button aria-pressed={s.mode === "length"} onClick={() => set({ mode: "length" })}>Length of each part</button>
                  <button aria-pressed={s.mode === "count"} onClick={() => set({ mode: "count" })}>Number of parts</button>
                </div>
              </div>
              {s.mode === "length" ? (
                <div className="field">
                  <label className="label" htmlFor="sp-len">Each part up to</label>
                  <div className="input-wrap">
                    <input className="input num" id="sp-len" type="number" min={10} max={600} defaultValue={s.len} key={"len" + s.preset} style={{ paddingLeft: 10 }}
                      onBlur={(e) => set({ len: Math.max(10, Math.min(600, +e.target.value || 60)), preset: +e.target.value === presetLen ? s.preset : "custom" })} />
                    <span className="suffix">seconds</span>
                  </div>
                  <span className="hint">{parts.length} parts from a {mmss(dur)} video.</span>
                </div>
              ) : (
                <div className="field">
                  <label className="label" htmlFor="sp-count">Number of parts</label>
                  <div className="input-wrap">
                    <input className="input num" id="sp-count" type="number" min={2} max={50} defaultValue={s.count} style={{ paddingLeft: 10 }}
                      onBlur={(e) => set({ count: Math.max(2, Math.min(50, +e.target.value || 10)) })} />
                    <span className="suffix">parts</span>
                  </div>
                  <span className="hint">Each part is about {mmss(each)}.{s.preset !== "custom" && each > presetLen && <> <span style={{ color: "var(--rec)" }}>Longer than {SPLIT_PRESETS[s.preset].name} allows ({presetLen}s).</span></>}</span>
                </div>
              )}
              <label className="switch"><input type="checkbox" checked={s.silence} onChange={(e) => set({ silence: e.target.checked })} /><span className="track" />Cut at natural pauses</label>
              <label className="switch"><input type="checkbox" checked={s.reframe} onChange={(e) => set({ reframe: e.target.checked })} /><span className="track" />Reframe to vertical 9:16</label>
              <label className="switch"><input type="checkbox" checked={s.label} onChange={(e) => set({ label: e.target.checked })} /><span className="track" />Add a “Part 1/{parts.length}” label</label>
              <div className="field">
                <label className="label" htmlFor="sp-tpl">Brand template</label>
                <select className="select" id="sp-tpl" value={tpl} onChange={(e) => setTpl(e.target.value)}>
                  <option value="">None</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <span className="hint">Your logo, text and clips go on every part.</span>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Price</h3><span className="badge">Fixed</span></div>
            <div className="panel-body stack">
              <CostTable lines={est.lines} total={est.total} />
              <MeterAfter cost={est.total} credits={credits} cap={cap} />
              {short && (
                <div className="note rec"><OctagonAlert /><div><b>Not enough credits.</b> Turn off reframe, labels and template to cut only ({fmt(cutOnly)} cr), or{" "}
                  <a href="#" onClick={(e) => { e.preventDefault(); openSettings("billing"); }}>top up</a>.</div></div>
              )}
              <button className="btn primary block lg" disabled={short || starting} onClick={start}><Scissors />Split into {parts.length} parts · {fmt(est.total)} cr</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
