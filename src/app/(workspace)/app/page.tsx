import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Coins, Film, LayoutTemplate, Scissors } from "lucide-react";
import { estimateDub } from "@/domain/billing/estimate";
import { RATES } from "@/domain/billing/pricing";
import { toPublicJob, type PublicJob, type TranslationJob } from "@/domain/entities/TranslationJob";
import { loadAccount } from "@/lib/account";
import { buildContainer } from "@/lib/container";
import { getCurrentUser } from "@/lib/supabase/server";
import { JobRow } from "@/presentation/samesay/app/bits";
import { fmt } from "@/presentation/samesay/app/format";
import { StartCard } from "@/presentation/samesay/app/StartCard";
import { BillingSoonLink } from "@/presentation/samesay/app/BillingSoonLink";

export const metadata: Metadata = { title: "Home" };

export default async function HomePage() {
  const user = (await getCurrentUser())!;
  const account = await loadAccount(user);
  const c = buildContainer();
  const jobs: PublicJob[] = account.ready ? (await c.jobs.listForUser(user.id, 5).catch((): TranslationJob[] => [])).map(toPublicJob) : [];
  const now = new Date();
  const hr = now.getHours();
  const stdPerMin = estimateDub(60, { voice: "standard", keepBackground: false, burnSubtitles: true, blurSubtitles: false }, account.plan).total;

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">{now.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</span>
          <h1 className="t-h2" style={{ marginTop: 4 }}>{hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening"}, {account.firstName}</h1>
          <p className="sub">You have <b style={{ color: "var(--text)" }}>{fmt(account.credits)} credits</b> · <BillingSoonLink>Top up</BillingSoonLink></p>
        </div>
      </div>
      {account.ready && account.credits < 100 && (
        <div className="note accent" style={{ marginBottom: "var(--sp-4)" }}>
          <Coins />
          <div><b>You have {fmt(account.credits)} credits left</b>, enough for about {Math.max(0, Math.floor(account.credits / stdPerMin))} min with standard voices. <BillingSoonLink>Top up or upgrade</BillingSoonLink></div>
        </div>
      )}
      <StartCard plan={account.plan} available={c.ai.voiceAvailability()} />
      <div style={{ height: "var(--sp-6)" }} />
      <div className="grid g-2-1">
        <div className="panel">
          <div className="panel-head"><h3>Recent videos</h3>{jobs.length > 0 && <Link href="/app/videos" className="t-small">View all</Link>}</div>
          {jobs.length ? (
            <div className="rows">{jobs.map((j) => <JobRow key={j.id} job={j} />)}</div>
          ) : (
            <div className="panel-body">
              <div className="empty" style={{ border: 0, padding: "var(--sp-8) var(--sp-4)" }}>
                <div className="glyph"><Film /></div>
                <h3 className="t-h4">No videos yet</h3>
                <p>Your translated videos will show up here.</p>
              </div>
            </div>
          )}
        </div>
        <div className="panel">
          <div className="panel-head"><h3>More tools</h3></div>
          <div className="rows">
            <Link className="row click" href="/app/templates" style={{ color: "var(--text)", textDecoration: "none" }}>
              <span className="ic-box" style={{ margin: 0 }}><LayoutTemplate /></span>
              <div className="main"><div className="title">Brand templates</div><div className="meta">{RATES.render} cr / min</div></div>
              <ChevronRight style={{ color: "var(--text-3)" }} />
            </Link>
            <Link className="row click" href="/app/split" style={{ color: "var(--text)", textDecoration: "none" }}>
              <span className="ic-box" style={{ margin: 0 }}><Scissors /></span>
              <div className="main"><div className="title">Cut into parts for social</div><div className="meta">from {RATES.splitCut} cr / min</div></div>
              <ChevronRight style={{ color: "var(--text-3)" }} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
