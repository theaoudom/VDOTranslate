import Link from "next/link";
import type { ReactNode } from "react";
import { Languages } from "lucide-react";

/** Placeholder for tools built in the next phases. */
export function ComingSoon({ title, text, icon }: { title: string; text: string; icon: ReactNode }) {
  return (
    <section>
      <div className="page-head"><div><h1 className="t-h2">{title}</h1></div></div>
      <div className="empty">
        <div className="glyph">{icon}</div>
        <h3 className="t-h4">Coming in the next update</h3>
        <p>{text}</p>
        <Link className="btn primary sm" href="/app/new"><Languages />Translate a video</Link>
      </div>
    </section>
  );
}
