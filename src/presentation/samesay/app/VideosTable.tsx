"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FolderOpen, Upload } from "lucide-react";
import type { PublicJob } from "@/domain/entities/TranslationJob";
import { isRunning, StatusBadge } from "./bits";
import { code, fmt, mmss, relativeDay } from "./format";

const TABS = [["all", "All"], ["dub", "Translations"], ["split", "Splits"], ["edit", "Edits"]] as const;
type Tab = (typeof TABS)[number][0];

// Splits and edits arrive with the Templates and Auto-split tools; every job here is a translation for now.
const kindOf = (_j: PublicJob): Tab => "dub";

export function VideosTable({ jobs }: { jobs: PublicJob[] }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all");
  const list = jobs.filter((j) => tab === "all" || kindOf(j) === tab);

  return (
    <section>
      <div className="page-head">
        <div><h1 className="t-h2">My videos</h1><p className="sub">Everything you’ve translated, edited or split. Files are kept for 30 days.</p></div>
        <Link className="btn primary" href="/app/new"><Upload />New translation</Link>
      </div>
      <div className="tabs" role="tablist" style={{ marginBottom: "var(--sp-4)" }}>
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {label} <span className="faint num t-xs">{jobs.filter((j) => k === "all" || kindOf(j) === k).length}</span>
          </button>
        ))}
      </div>
      {list.length ? (
        <div className="panel">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Video</th><th>Type</th><th>Length</th><th className="r">Credits</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                {list.map((j) => (
                  <tr key={j.id} className="row click" style={{ display: "table-row" }} onClick={() => router.push(`/app/videos/${j.id}`)}>
                    <td><div className="hstack" style={{ flexWrap: "nowrap" }}><div className="thumb"><span className="dur">{mmss(j.durationSec)}</span></div><Link href={`/app/videos/${j.id}`} style={{ fontWeight: 600, color: "var(--text)" }}>{j.name}</Link></div></td>
                    <td>Translation <span className="faint num t-xs">{code(j.sourceLanguage)}→{code(j.targetLanguage)}</span></td>
                    <td className="num">{mmss(j.durationSec)}</td>
                    <td className="r num">{isRunning(j) ? "held " + fmt(j.held) : fmt(j.used)}</td>
                    <td><StatusBadge job={j} /></td>
                    <td className="num faint">{relativeDay(new Date(j.createdAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="empty">
          <div className="glyph"><FolderOpen /></div>
          <h3 className="t-h4">Nothing here yet</h3>
          <p>{tab === "all" ? "Your translated, edited and split videos will show up here." : `No ${({ dub: "translations", split: "splits", edit: "edits" } as const)[tab]} yet.`}</p>
          <Link className="btn primary sm" href="/app/new"><Upload />Upload video</Link>
        </div>
      )}
    </section>
  );
}
