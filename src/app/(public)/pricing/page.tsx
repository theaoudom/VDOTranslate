import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { PlanCards, RatesTable, TopUpRows } from "@/presentation/samesay/Plans";

export const metadata: Metadata = { title: "Pricing" };

const FAQ = [
  ["Why do I see a price before every job?", "The cost depends on the video length and the voice you choose. We show the estimate first, and the job only starts if you have enough credits."],
  ["What happens to unused credits from a job?", "We hold the estimate plus a 10% buffer while the job runs. When it finishes we charge only what it used and return the rest right away."],
  ["What if a job fails?", "You get all of the held credits back."],
  ["Do credits expire?", "Monthly plan credits reset on your renewal date. Credits you buy as a top-up never expire."],
  ["Can I cancel?", "Yes, any time. Your plan stays active until the end of the month you paid for."],
];

export default function PricingPage() {
  return (
    <div className="wrap" style={{ paddingTop: "var(--sp-12)", paddingBottom: "var(--sp-16)" }}>
      <div className="sec-head" style={{ marginBottom: "var(--sp-8)" }}>
        <div>
          <span className="eyebrow">Pricing</span>
          <h1 className="t-h1" style={{ marginTop: 6 }}>Simple plans, honest credits</h1>
          <p>Every job shows its price before it starts. If you don’t have enough credits, it won’t start, so you never spend more than you planned.</p>
        </div>
      </div>
      <PlanCards />
      <div className="grid g-2-1" style={{ marginTop: "var(--sp-10)" }}>
        <div className="panel">
          <div className="panel-head"><h3>What things cost</h3><span className="faint t-xs">credits per minute of video</span></div>
          <RatesTable />
          <div className="panel-body t-small muted" style={{ borderTop: "1px solid var(--line)" }}>Translation jobs hold the estimate plus a 10% buffer while they run, then return what wasn’t used. Edits and splits have a fixed price.</div>
        </div>
        <div className="panel">
          <div className="panel-head"><h3>Top up any time</h3></div>
          <TopUpRows />
          <div className="panel-body t-small muted" style={{ borderTop: "1px solid var(--line)" }}>Top-up credits never expire. They are used after your monthly credits.</div>
        </div>
      </div>
      <div className="faq" style={{ marginTop: "var(--sp-10)", maxWidth: 820 }}>
        <h2 className="t-h3" style={{ marginBottom: "var(--sp-2)" }}>Questions</h2>
        {FAQ.map(([q, a]) => <details key={q}><summary>{q}<Plus /></summary><p>{a}</p></details>)}
      </div>
    </div>
  );
}
