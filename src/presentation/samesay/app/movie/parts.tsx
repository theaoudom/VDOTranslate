"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpCircle, Check, Drama, Eye, Heart, Laugh, Lock, ShieldAlert, Zap } from "lucide-react";
import type { MovieGenre, PublicMovie } from "@/domain/movie/Movie";
import { fmt } from "../format";
import { useOpenSettings } from "../Settings";

export const GENRE_ICONS: Record<MovieGenre, typeof Zap> = { action: Zap, drama: Drama, romance: Heart, comedy: Laugh, thriller: Eye };

/** JSON request to the movie API; throws the server's message on failure. */
export async function api<T = PublicMovie>(url: string, method = "POST", body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: body !== undefined ? { "Content-Type": "application/json" } : undefined, body: body !== undefined ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Something went wrong. Please try again.");
  return json as T;
}

export function PageHead({ title, sub, right }: { title: string; sub: string; right?: ReactNode }) {
  return <div className="page-head"><div><h1 className="t-h2">{title}</h1><p className="sub">{sub}</p></div>{right}</div>;
}

export type StepKey = "movie" | "script" | "cast" | "shots" | "making";
const STEPS: [StepKey, string][] = [["movie", "Idea"], ["script", "Script"], ["cast", "Characters"], ["shots", "Shots"], ["making", "Make"]];

/** Idea → Script → Characters → Shots → Make. Earlier steps are links while the movie is a draft. */
export function Stepper({ at, movieId, locked }: { at: StepKey; movieId?: string; locked?: boolean }) {
  const idx = STEPS.findIndex(([k]) => k === at);
  return (
    <ol className="mv-steps">
      {STEPS.map(([k, label], i) => {
        const st = i < idx ? "done" : i === idx ? "now" : "";
        const href = k === "movie" ? null : movieId && k !== "making" ? `/app/movie/${movieId}/${k}` : null;
        const can = Boolean(href) && i !== idx && !locked;
        const inner = <><b>{i < idx ? <Check /> : i + 1}</b>{label}</>;
        return <li key={k} className={st}>{can ? <Link href={href!}>{inner}</Link> : <span>{inner}</span>}</li>;
      })}
    </ol>
  );
}

/** First frame of a shot (or a coloured placeholder until it exists). */
export function Frame({ movieId, shot, no, big, hue }: { movieId: string; shot: PublicMovie["shots"][number]; no: number; big?: boolean; hue: number }) {
  const img = shot.hasFrame ? `/api/movies/${movieId}/files/frame-${shot.id}` : null;
  return (
    <div className={"mv-frame" + (big ? " big" : "")} style={{ "--h": hue, ...(img ? { backgroundImage: `url(${img})`, backgroundSize: "cover", backgroundPosition: "center" } : {}) } as React.CSSProperties}>
      <span className="mv-shotno">{no}</span>
      {shot.state === "blocked" && <span className="mv-blocked"><ShieldAlert />Blocked</span>}
    </div>
  );
}

export const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).join("").replace(/[^A-Z]/gi, "").slice(0, 2).toUpperCase();

/** A character's picture: their photo, the AI portrait, or initials until one exists. */
export function Portrait({ movieId, c, size, preview }: { movieId?: string; c: PublicMovie["cast"][number]; size: number; preview?: string | null }) {
  const src = preview ?? (movieId && (c.hasPhoto || c.hasPortrait) ? `/api/movies/${movieId}/files/portrait-${c.id}?v=${c.ver}${c.hasPhoto ? "p" : ""}` : null);
  return (
    <div className={"mv-portrait" + (src ? " photo" : "")} style={{ "--h": c.hue, width: size, height: size, ...(src ? { backgroundImage: `url(${src})` } : {}) } as React.CSSProperties}>
      <span>{initials(c.name)}</span>
      {c.hasPhoto && <span className="tag">Photo</span>}
      {c.ver > 1 && !c.hasPhoto && <em>v{c.ver}</em>}
    </div>
  );
}

/** AI movies come with Creator and Studio. */
export function MovieLocked() {
  const open = useOpenSettings();
  return (
    <section>
      <PageHead title="Make an AI movie" sub="Turn an idea into a short movie for TikTok, Reels or YouTube." />
      <div className="empty" style={{ maxWidth: 560, margin: "var(--sp-8) auto" }}>
        <div className="glyph"><Lock /></div>
        <h3 className="t-h4">AI movies come with Creator and Studio</h3>
        <p>Make action, drama, romance and comedy shorts from one idea, with characters that look the same in every shot. A 1-minute movie is about {fmt(60 * 12 * 1.1)}–{fmt(60 * 35 * 1.1)} credits.</p>
        <div className="hstack" style={{ justifyContent: "center" }}>
          <button className="btn primary" onClick={() => open("billing")}><ArrowUpCircle />Upgrade to Creator · $12 / month</button>
          <Link className="btn" href="/app/new">Translate a video instead</Link>
        </div>
      </div>
    </section>
  );
}
