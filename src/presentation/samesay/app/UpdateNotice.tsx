"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

/** Built into this page; the server answers with the version it runs now. */
const BUILT = process.env.APP_VERSION ?? "dev";
const EVERY = 5 * 60 * 1000;

/**
 * Asks for a reload when a newer version was deployed while the page was open, so nothing
 * is done with an old page (checks every 5 minutes and when the tab is shown again).
 */
export function UpdateNotice() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    if (BUILT === "dev") return;
    let last = 0;
    async function check() {
      if (Date.now() - last < 30_000) return;
      last = Date.now();
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        const { version } = await res.json();
        if (version && version !== BUILT) setStale(true);
      } catch {} // offline: check again later
    }
    const onShow = () => { if (document.visibilityState === "visible") check(); };
    const timer = setInterval(check, EVERY);
    document.addEventListener("visibilitychange", onShow);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onShow); };
  }, []);

  if (!stale) return null;
  return (
    <div className="note accent" role="status" style={{ marginBottom: "var(--sp-4)", alignItems: "center" }}>
      <RefreshCw />
      <div style={{ flex: 1 }}><b>Samesay was updated.</b> Reload to use the new version.</div>
      <button className="btn sm primary" onClick={() => location.reload()}>Reload</button>
    </div>
  );
}
