import Link from "next/link";
import type { PublicJob } from "@/domain/entities/TranslationJob";
import { code, fmt, mmss, VOICE_INFO } from "./format";

export const isRunning = (j: Pick<PublicJob, "status">) => j.status !== "completed" && j.status !== "failed";

export function StatusBadge({ job }: { job: Pick<PublicJob, "status" | "progress"> }) {
  if (job.status === "completed") return <span className="badge ok"><span className="dot" />Ready</span>;
  if (job.status === "failed") return <span className="badge rec"><span className="dot" />Failed</span>;
  return <span className="badge accent"><span className="dot live" />{job.progress ? job.progress + "%" : "Processing"}</span>;
}

export function jobMeta(j: PublicJob) {
  const credits = `${isRunning(j) ? "held " + fmt(j.held) : fmt(j.used)} cr`;
  if (j.kind === "edit") return `Template · ${j.template?.name ?? ""} · ${j.template?.ratio ?? ""} · ${credits}`;
  return `${code(j.sourceLanguage)} → ${code(j.targetLanguage)} · ${VOICE_INFO[j.voice].name} · ${isRunning(j) ? "held " + fmt(j.held) : fmt(j.used)} cr`;
}

export function JobRow({ job }: { job: PublicJob }) {
  return (
    <Link className="row click" href={`/app/videos/${job.id}`} style={{ color: "var(--text)", textDecoration: "none" }}>
      <div className="thumb"><span className="dur">{mmss(job.durationSec)}</span></div>
      <div className="main"><div className="title">{job.name}</div><div className="meta">{jobMeta(job)}</div></div>
      <StatusBadge job={job} />
    </Link>
  );
}

export function CostTable({ lines, total, buffer, label = "Total" }: { lines: { label: string; detail: string; credits: number }[]; total: number; buffer?: number; label?: string }) {
  return (
    <table className="cost">
      <tbody>
        {lines.map((l) => <tr key={l.label}><td>{l.label}<span className="sub">{l.detail}</span></td><td>{fmt(l.credits)}</td></tr>)}
        {buffer != null && <tr><td>Buffer 10%<span className="sub">returned if not used</span></td><td>{fmt(buffer)}</td></tr>}
        <tr className="total"><td>{label}</td><td>{fmt(total)} cr</td></tr>
      </tbody>
    </table>
  );
}

/** Balance before/after a job, with the cost shown as a striped hold. */
export function MeterAfter({ cost, credits, cap }: { cost: number; credits: number; cap: number }) {
  const max = Math.max(cap, credits, 1);
  const short = cost > credits;
  const left = Math.max(0, credits - cost);
  return (
    <div className="meter">
      <div className="meter-row t-small"><span className="muted">Your balance</span><span className="num">{fmt(credits)} cr</span></div>
      <div className={"meter-bar" + (short ? " over" : "")}>
        <span style={{ width: (short ? 100 : (left / max) * 100) + "%" }} />
        {!short && <span className="reserve" style={{ width: (cost / max) * 100 + "%" }} />}
      </div>
      <div className="meter-row t-small">
        <span className="muted">{short ? "Missing" : "Left after this job"}</span>
        <span className="num" style={short ? { color: "var(--rec)" } : undefined}>{short ? fmt(cost - credits) : fmt(left)} cr</span>
      </div>
    </div>
  );
}
