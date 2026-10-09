import type { Metadata } from "next";
import { CircleCheck, CircleX, OctagonAlert } from "lucide-react";
import { SupabasePaymentRepository } from "@/data/repositories/SupabasePaymentRepository";
import { PLANS } from "@/domain/billing/pricing";
import { paymentLabel } from "@/domain/payments/Payment";
import { verifyReview } from "@/lib/paymentLinks";
import { customerOf } from "@/lib/payments";
import { decidePayment } from "./actions";

export const metadata: Metadata = { title: "Review payment", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const when = (d: Date | null) => (d ? d.toLocaleString("en-GB", { timeZone: "Asia/Phnom_Penh", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

/**
 * Opened from the Approve / Reject link in Telegram. Looking at the page changes nothing;
 * only the button below does (link previews and accidental taps are safe).
 */
export default async function ReviewPaymentPage({ params, searchParams }: { params: { id: string }; searchParams: { a?: string; s?: string; done?: string; bad?: string } }) {
  const a = searchParams.a ?? "", s = searchParams.s ?? "";
  const valid = verifyReview(params.id, a, s);
  const payment = valid ? await new SupabasePaymentRepository().findById(params.id).catch(() => null) : null;

  let body;
  if (!valid || !payment) {
    body = <div className="note rec"><OctagonAlert /><div><b>This link isn’t valid.</b> Open it again from the Telegram message.</div></div>;
  } else {
    const c = await customerOf(payment.userId);
    const approve = a === "approve";
    const details = (
      <table className="cost">
        <tbody>
          <tr><td>{paymentLabel(payment)}<span className="sub">{payment.credits.toLocaleString("en-US")} credits</span></td><td>${payment.usd.toFixed(2)}</td></tr>
          <tr><td>Payment note</td><td className="num">{payment.ref}</td></tr>
          <tr><td>From</td><td>{c.name || "—"}<span className="sub">{c.email}</span></td></tr>
          <tr><td>Sent</td><td>{when(payment.paidAt)}</td></tr>
        </tbody>
      </table>
    );
    if (payment.status !== "pending") {
      const ok = payment.status === "approved";
      body = (
        <>
          {details}
          <div className={"note" + (ok ? "" : " rec")}>{ok ? <CircleCheck /> : <CircleX />}<div><b>{ok ? `Approved · ${(payment.creditsAdded ?? payment.credits).toLocaleString("en-US")} credits added${payment.plan && payment.planStarted === false ? " (plan not started)" : ""}` : payment.status === "rejected" ? "Rejected" : payment.status === "cancelled" ? "Cancelled by the customer" : "Not sent yet"}.</b>{searchParams.done ? " Done." : " Nothing more to do."}</div></div>
        </>
      );
    } else {
      body = (
        <>
          {details}
          <p className="muted t-small">{approve
            ? <>Only approve after you see <b style={{ color: "var(--text)" }}>${payment.usd.toFixed(2)}</b> with note <b style={{ color: "var(--text)" }}>{payment.ref}</b> in your bank. The credits are added right away.</>
            : <>Reject when you can’t find this payment. The customer sees that it wasn’t found.</>}</p>
          <form action={decidePayment} className="stack">
            <input type="hidden" name="id" value={payment.id} />
            <input type="hidden" name="a" value={a} />
            <input type="hidden" name="s" value={s} />
            {approve && (
              <>
                <div className="field">
                  <label className="label" htmlFor="rv-credits">Credits to add</label>
                  <input className="input num" id="rv-credits" name="credits" type="number" min={0} max={100000} step={1} defaultValue={payment.credits} />
                  <span className="hint">The full price gives {payment.credits.toLocaleString("en-US")}. If they paid less, enter what to give, e.g. 50.</span>
                </div>
                {payment.plan && (
                  <label className="switch"><input type="checkbox" name="startPlan" defaultChecked /><span className="track" />Start the {PLANS[payment.plan].name} plan for 1 month</label>
                )}
              </>
            )}
            <button className={"btn lg block " + (approve ? "primary" : "danger")} type="submit">{approve ? <><CircleCheck />Approve</> : <><CircleX />Reject payment</>}</button>
          </form>
        </>
      );
    }
  }

  return (
    <section className="auth">
      <div className="panel auth-card">
        <div className="panel-body">
          <div>
            <h1 className="t-h3">{a === "reject" ? "Reject payment" : "Approve payment"}</h1>
            <p className="muted t-small" style={{ marginTop: 4 }}>Samesay · payment check</p>
          </div>
          {body}
        </div>
      </div>
    </section>
  );
}
