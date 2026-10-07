import Link from "next/link";
import { Check } from "lucide-react";
import { PACKS, PLANS, PLAN_ORDER, dubCreditsPerMinute, rateRows } from "@/domain/billing/pricing";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const human = (m: number) => (m >= 90 ? "about " + Math.floor(m / 60) + " hours" : "about " + Math.floor(m) + " min");
const TAGLINE = { free: "Try it on a short video", creator: "For weekly uploads", studio: "For daily posting and agencies" };

export function planFeatures(id: keyof typeof PLANS): string[] {
  const p = PLANS[id];
  const feats = [
    (p.once ? "60 credits once, " : fmt(p.monthly) + " credits every month, ") + human(p.monthly / dubCreditsPerMinute("standard")) + " of standard dubbing",
    "Videos up to " + (p.maxMin >= 60 ? p.maxMin / 60 + " hours" : p.maxMin + " min"),
    p.res + " export",
    p.clone ? "Voice cloning" : "Standard and natural voices",
    "Brand templates and auto-split",
  ];
  if (id === "studio") feats.push("Priority processing");
  if (!p.once) feats.splice(1, 0, "Or " + human(p.monthly / dubCreditsPerMinute("natural")) + " with natural voices");
  return feats;
}

/** Plan cards for the public site (buttons lead to sign up). */
export function PlanCards() {
  return (
    <div className="plans">
      {PLAN_ORDER.map((id) => {
        const p = PLANS[id];
        return (
          <div key={id} className={"panel plan" + (id === "creator" ? " featured" : "")}>
            {id === "creator" && <span className="badge ribbon">Most creators</span>}
            <div>
              <div className="t-h4">{p.name}</div>
              <div className="faint t-small">{TAGLINE[id]}</div>
            </div>
            <div className="price">${p.price}<small>{p.once ? "forever" : "/ month"}</small></div>
            <ul>
              {planFeatures(id).map((f) => (
                <li key={f}><Check /><span>{f}</span></li>
              ))}
            </ul>
            <Link className={"btn block" + (id === "creator" ? " primary" : "")} href="/signup">
              {id === "free" ? "Start free" : "Choose " + p.name}
            </Link>
          </div>
        );
      })}
    </div>
  );
}

export function RatesTable() {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead><tr><th>Step</th><th className="r">Credits per minute of video</th></tr></thead>
        <tbody>
          {rateRows().map(([label, rate]) => (
            <tr key={label}><td>{label}</td><td className="r num">{rate}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TopUpRows() {
  return (
    <div className="rows">
      {PACKS.map((p) => (
        <div key={p.cr} className="row">
          <div className="main">
            <div className="title num">{fmt(p.cr)} cr</div>
            <div className="meta">${((p.price / p.cr) * 1000).toFixed(2)} per 1,000 cr</div>
          </div>
          <span className="num">${p.price}</span>
        </div>
      ))}
    </div>
  );
}
