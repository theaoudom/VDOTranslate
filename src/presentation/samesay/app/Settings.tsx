"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Copy, CreditCard, Hourglass, Languages, OctagonAlert, Plus, Shield, Trash2, User, X, CircleX } from "lucide-react";
import { PACKS, PLANS, PLAN_ORDER, type PlanId, type VoiceKind } from "@/domain/billing/pricing";
import type { PublicPayment } from "@/domain/payments/Payment";
import { Modal } from "../Modal";
import { RatesTable } from "../Plans";
import { useToast } from "../Toast";
import { fmt, LANG_OPTIONS, VOICE_INFO } from "./format";

/* ── Opening the dialog from anywhere in the app ── */

export type SettingsTab = "account" | "billing" | "defaults" | "security";
const SettingsContext = createContext<(tab?: SettingsTab) => void>(() => {});
export const useOpenSettings = () => useContext(SettingsContext);

/** A link that opens Billing & credits (used in page text such as "Top up"). */
export function BillingLink({ children }: { children: ReactNode }) {
  const open = useOpenSettings();
  return <a href="#" onClick={(e) => { e.preventDefault(); open("billing"); }}>{children}</a>;
}

interface PaymentsInfo {
  available: boolean;
  pay: { bank: string; name: string; account: string; hasQr: boolean };
  payments: PublicPayment[];
}

/**
 * Holds the dialog and watches payments that are being checked, so people hear
 * "Payment confirmed" as soon as the team approves it in Telegram.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<SettingsTab | null>(null);
  const [payments, setPayments] = useState<PaymentsInfo | null>(null);
  const router = useRouter();
  const toast = useToast();
  const known = useRef<Map<string, PublicPayment["status"]>>(new Map());

  const loadPayments = useCallback(async () => {
    const res = await fetch("/api/payments", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const info = (await res.json()) as PaymentsInfo;
    let changed = false;
    for (const p of info.payments) {
      const before = known.current.get(p.id);
      if (before === "pending" && p.status === "approved") { toast(`Payment confirmed · ${fmt(p.credits)} credits added`); changed = true; }
      if (before === "pending" && p.status === "rejected") { toast(`We couldn’t find your payment ${p.ref}. Please contact us.`, true); changed = true; }
      known.current.set(p.id, p.status);
    }
    if (changed) router.refresh();
    setPayments(info);
  }, [router, toast]);

  useEffect(() => { loadPayments(); }, [loadPayments]);
  const waiting = payments?.payments.some((p) => p.status === "pending") ?? false;
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(loadPayments, tab === "billing" ? 8000 : 20000);
    return () => clearInterval(t);
  }, [waiting, tab, loadPayments]);

  const open = useCallback((t?: SettingsTab) => setTab(t ?? "account"), []);
  return (
    <SettingsContext.Provider value={open}>
      {children}
      {tab && <SettingsDialog tab={tab} setTab={setTab} payments={payments} reloadPayments={loadPayments} onClose={() => { setTab(null); router.refresh(); }} />}
    </SettingsContext.Provider>
  );
}

/* ── The dialog ── */

interface AccountInfo {
  name: string;
  email: string;
  plan: PlanId;
  credits: number;
  held: number;
  renewsAt: string | null;
  defaults: { to?: string; voice?: VoiceKind; bg?: boolean; subs?: boolean };
  history: { at: string; reason: string; job: string | null; delta: number }[];
  google: boolean;
  canUnlinkGoogle: boolean;
}

const TABS: [SettingsTab, typeof User, string][] = [
  ["account", User, "Account"],
  ["billing", CreditCard, "Billing & credits"],
  ["defaults", Languages, "Translation defaults"],
  ["security", Shield, "Security"],
];

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "2-digit" });
const stamp = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
const initialsOf = (name: string) => name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? "Something went wrong. Please try again.");
  return json;
}

function SettingsDialog({ tab, setTab, payments, reloadPayments, onClose }: {
  tab: SettingsTab;
  setTab: (t: SettingsTab) => void;
  payments: PaymentsInfo | null;
  reloadPayments: () => Promise<void>;
  onClose: () => void;
}) {
  const [acc, setAcc] = useState<AccountInfo | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const load = useCallback(async () => {
    const res = await fetch("/api/account", { cache: "no-store" });
    if (res.ok) setAcc(await res.json());
  }, []);
  useEffect(() => { load(); ref.current?.focus(); }, [load]);
  // credits change when a payment is approved
  const approvedCount = payments?.payments.filter((p) => p.status === "approved").length ?? 0;
  useEffect(() => { if (approvedCount) load(); }, [approvedCount, load]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector(".scrim .modal:not(.wide)")) onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const title = TABS.find((t) => t[0] === tab)![2];
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="modal wide" role="dialog" aria-modal="true" aria-labelledby="settings-title" tabIndex={-1} style={{ outline: "none" }}>
        <div className="settings">
          <nav className="stabs" aria-label="Settings sections">
            <div className="hstack" style={{ padding: "6px 8px 12px", flexWrap: "nowrap" }}>
              <span className="avatar" style={{ cursor: "default" }}>{initialsOf(acc?.name || acc?.email || "")}</span>
              <div style={{ minWidth: 0 }}>
                <div className="t-small" style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{acc?.name || " "}</div>
                <div className="faint t-xs">{acc ? PLANS[acc.plan].name + " plan" : " "}</div>
              </div>
            </div>
            {TABS.map(([key, Icon, label]) => (
              <button key={key} aria-current={tab === key} onClick={() => setTab(key)}><Icon />{label}</button>
            ))}
          </nav>
          <div className="spane">
            <div className="panel-head spane-head">
              <h3 id="settings-title">{title}</h3>
              <button className="btn ghost icon sm" onClick={onClose} aria-label="Close settings"><X /></button>
            </div>
            <div className="panel-body stack">
              {!acc ? <p className="muted t-small">Loading…</p>
                : tab === "account" ? <AccountTab acc={acc} reload={load} />
                : tab === "billing" ? <BillingTab acc={acc} payments={payments} reloadPayments={reloadPayments} />
                : tab === "defaults" ? <DefaultsTab acc={acc} reload={load} />
                : <SecurityTab acc={acc} reload={load} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Account ── */

function AccountTab({ acc, reload }: { acc: AccountInfo; reload: () => Promise<void> }) {
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState(acc.name);
  const [email, setEmail] = useState(acc.email);
  const [busy, setBusy] = useState(false);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function save() {
    if (!emailOk) return;
    setBusy(true);
    try {
      const r = await send("/api/account", "PATCH", { name, email });
      toast(r.emailSent ? "Saved. Check your new email to confirm the change." : "Changes saved");
      await reload();
      router.refresh();
    } catch (e) { toast((e as Error).message, true); }
    setBusy(false);
  }

  return (
    <>
      <div className="hstack" style={{ gap: "var(--sp-4)" }}>
        <span className="avatar" style={{ width: 56, height: 56, fontSize: "var(--fs-lg)", cursor: "default" }}>{initialsOf(name || email)}</span>
      </div>
      <div className="two">
        <div className="field"><label className="label" htmlFor="s-name">Name</label><input className="input" id="s-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field">
          <label className="label" htmlFor="s-email">Email</label>
          <input className="input" id="s-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          {!emailOk && <span className="hint err">Enter a valid email.</span>}
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="s-ui">App language</label>
        <select className="select" id="s-ui" disabled><option>English</option></select>
        <span className="hint">More languages are coming.</span>
      </div>
      <div className="hstack" style={{ justifyContent: "flex-end" }}>
        <button className="btn primary" onClick={save} disabled={busy || !name.trim()}>Save changes</button>
      </div>
    </>
  );
}

/* ── Billing & credits ── */

function BillingTab({ acc, payments, reloadPayments }: { acc: AccountInfo; payments: PaymentsInfo | null; reloadPayments: () => Promise<void> }) {
  const toast = useToast();
  const [buying, setBuying] = useState<{ kind: "pack"; index: number } | { kind: "plan"; plan: "creator" | "studio" } | null>(null);
  const p = PLANS[acc.plan];
  const cap = Math.max(p.monthly, acc.credits + acc.held, 1);
  const shown = payments?.payments.filter((x) => x.status === "pending" || x.status === "rejected") ?? [];

  async function cancel(id: string) {
    try { await send(`/api/payments/${id}`, "POST", { action: "cancel" }); toast("Payment request cancelled"); }
    catch (e) { toast((e as Error).message, true); }
    await reloadPayments();
  }

  return (
    <>
      <div className="panel panel-body meter" style={{ boxShadow: "none" }}>
        <div className="meter-row">
          <span className="num" style={{ fontSize: "var(--fs-2xl)", letterSpacing: "-.03em" }}>{fmt(acc.credits)} <span className="faint" style={{ fontSize: "var(--fs-md)" }}>cr available</span></span>
          <span className="faint t-xs">{p.once || !acc.renewsAt ? "Free credits" : "Active until " + day(acc.renewsAt)}</span>
        </div>
        <div className="meter-bar" style={{ height: 8 }}>
          <span style={{ width: (acc.credits / cap) * 100 + "%" }} />
          <span className="reserve" style={{ width: (acc.held / cap) * 100 + "%" }} />
        </div>
        <div className="hstack t-xs muted" style={{ gap: "var(--sp-4)" }}><span>Available {fmt(acc.credits)}</span><span>Held for running jobs {fmt(acc.held)}</span></div>
      </div>

      {payments && !payments.available && (
        <div className="note"><OctagonAlert /><div><b>Payments are being set up.</b> You’ll be able to buy credits here soon.</div></div>
      )}

      {shown.length > 0 && (
        <div className="panel rows" style={{ boxShadow: "none" }}>
          {shown.map((x) => x.status === "pending" ? (
            <div key={x.id} className="row">
              <span className="ic-box" style={{ margin: 0 }}><Hourglass /></span>
              <div className="main"><div className="title">Checking your payment · {x.label}</div><div className="meta"><span className="num">${x.usd.toFixed(2)}</span> · note <span className="num">{x.ref}</span>{x.paidAt && <> · sent {stamp(x.paidAt)}</>}</div></div>
              <button className="linkbtn" style={{ color: "var(--text-3)" }} onClick={() => cancel(x.id)}>Cancel</button>
            </div>
          ) : (
            <div key={x.id} className="row">
              <span className="ic-box" style={{ margin: 0, color: "var(--rec)" }}><CircleX /></span>
              <div className="main"><div className="title">We couldn’t find this payment · {x.label}</div><div className="meta"><span className="num">${x.usd.toFixed(2)}</span> · note <span className="num">{x.ref}</span> · if you paid, contact us with your receipt</div></div>
            </div>
          ))}
        </div>
      )}

      <div>
        <h4 className="t-h4" style={{ marginBottom: "var(--sp-2)" }}>Top up</h4>
        <div className="grid g-3">
          {PACKS.map((k, i) => (
            <div key={k.cr} className="panel panel-body stack" style={{ gap: 4, boxShadow: "none" }}>
              <span className="num" style={{ fontSize: "var(--fs-lg)" }}>{fmt(k.cr)} cr</span>
              <span className="faint t-xs">never expire</span>
              <button className={"btn sm" + (i === 1 ? " primary" : "")} style={{ marginTop: 6 }} onClick={() => setBuying({ kind: "pack", index: i })}>Buy · ${k.price}</button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="t-h4" style={{ marginBottom: "var(--sp-2)" }}>Plan</h4>
        <div className="panel rows" style={{ boxShadow: "none" }}>
          {PLAN_ORDER.map((id) => {
            const q = PLANS[id], cur = acc.plan === id;
            const btn = cur && id !== "free" ? (
              <span className="hstack" style={{ gap: 8 }}><span className="badge accent">Current</span><button className="btn sm" onClick={() => setBuying({ kind: "plan", plan: id as "creator" | "studio" })}>Renew</button></span>
            ) : cur ? <span className="badge accent">Current</span>
              : id === "free" ? <span className="faint t-xs">once per account</span>
              : <button className={"btn sm" + (q.price > p.price ? " primary" : "")} onClick={() => setBuying({ kind: "plan", plan: id as "creator" | "studio" })}>{q.price > p.price ? "Upgrade" : "Switch"}</button>;
            return (
              <div key={id} className="row">
                <div className="main">
                  <div className="title">{q.name} <span className="faint num t-xs" style={{ fontWeight: 400 }}>${q.price}{q.once ? "" : " / month"}</span></div>
                  <div className="meta">{q.once ? "60 cr once" : fmt(q.monthly) + " cr / month"} · up to {q.maxMin >= 60 ? q.maxMin / 60 + " h" : q.maxMin + " min"} · {q.res}{q.clone ? " · own-voice cloning" : ""}</div>
                </div>
                {btn}
              </div>
            );
          })}
        </div>
        <p className="faint t-xs" style={{ marginTop: 8 }}>Plans are paid one month at a time and never charge you automatically. Renew whenever you like; the month starts from today.</p>
      </div>

      <div>
        <h4 className="t-h4" style={{ marginBottom: "var(--sp-2)" }}>History</h4>
        <div className="panel table-wrap" style={{ boxShadow: "none" }}>
          <table className="table">
            <thead><tr><th>Date</th><th>Activity</th><th className="r">Credits</th></tr></thead>
            <tbody>
              {acc.history.map((h, i) => (
                <tr key={i}>
                  <td className="num faint">{stamp(h.at)}</td>
                  <td>{h.reason}{h.job && <div className="faint t-xs">{h.job}</div>}</td>
                  <td className="r num" style={h.delta > 0 ? { color: "var(--ok)" } : undefined}>{h.delta > 0 ? "+" : "−"}{fmt(Math.abs(h.delta))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <details className="faq">
        <summary>How credits are counted<Plus /></summary>
        <div className="panel" style={{ marginTop: "var(--sp-3)", boxShadow: "none" }}><RatesTable /></div>
        <p>Rates follow what each AI step really costs. Translations hold the estimate plus 10% and return what isn’t used. Edits and splits have a fixed price.</p>
      </details>

      {buying && <PayDialog item={buying} onClose={() => setBuying(null)} onSent={reloadPayments} />}
    </>
  );
}

/** The pay window: QR / bank details and the note to write, then "I've paid". */
function PayDialog({ item, onClose, onSent }: {
  item: { kind: "pack"; index: number } | { kind: "plan"; plan: "creator" | "studio" };
  onClose: () => void;
  onSent: () => Promise<void>;
}) {
  const toast = useToast();
  const [data, setData] = useState<{ payment: PublicPayment; pay: PaymentsInfo["pay"] } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    send("/api/payments", "POST", item).then(setData).catch((e) => setError((e as Error).message));
  }, [item]);

  const sub = item.kind === "pack" ? "never expire" : (() => { const q = PLANS[item.plan]; return `${fmt(q.monthly)} credits added · ${q.res}${q.clone ? " · own-voice cloning" : ""}`; })();
  const usd = item.kind === "pack" ? PACKS[item.index].price : PLANS[item.plan].price;
  const label = item.kind === "pack" ? `${fmt(PACKS[item.index].cr)} credits` : `${PLANS[item.plan].name} plan · 1 month`;

  async function paid() {
    if (!data) return;
    setBusy(true);
    try {
      await send(`/api/payments/${data.payment.id}`, "POST", { action: "paid" });
      toast("Thanks! We’re checking your payment");
      await onSent();
      onClose();
    } catch (e) { toast((e as Error).message, true); setBusy(false); }
  }

  return (
    <Modal title={`Pay $${usd} · ${label}`} okLabel="I’ve paid" onOk={paid} onClose={onClose} okDisabled={!data || busy}>
      <div className="stack">
        <table className="cost"><tbody><tr><td>{label}<span className="sub">{sub}</span></td><td>${usd}.00</td></tr></tbody></table>
        {error ? <div className="note rec"><OctagonAlert /><div>{error}</div></div>
          : !data ? <p className="muted t-small">Preparing your payment…</p>
          : (
            <>
              <div className="hstack" style={{ gap: "var(--sp-4)", alignItems: "center", flexWrap: "wrap" }}>
                {data.pay.hasQr && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src="/api/payments/qr" alt="KHQR code to pay" width={200} height={200} style={{ border: "1px solid var(--line)", borderRadius: "var(--r-md)", background: "#fff", objectFit: "contain" }} />
                )}
                <div className="stack" style={{ gap: 6, minWidth: 200, flex: 1 }}>
                  {data.pay.hasQr && <b className="t-small">Scan with any bank app (KHQR)</b>}
                  {data.pay.account && <span className="muted t-small">{data.pay.hasQr ? "or send" : "Send"} to {data.pay.bank} · {data.pay.name} · <span className="num">{data.pay.account}</span></span>}
                  <div className="panel panel-body hstack" style={{ boxShadow: "none", padding: "8px 10px", justifyContent: "space-between", gap: 8 }}>
                    <div><div className="faint t-xs">Payment note</div><div className="num" style={{ fontSize: "var(--fs-lg)", fontWeight: 600, letterSpacing: ".04em" }}>{data.payment.ref}</div></div>
                    <button className="btn sm" onClick={() => { navigator.clipboard?.writeText(data.payment.ref).catch(() => {}); toast("Copied " + data.payment.ref); }}><Copy />Copy</button>
                  </div>
                </div>
              </div>
              <p className="faint t-xs">Send exactly ${usd}.00 and write the note so we can find your payment. We check it and add your credits, usually within an hour. You’ll see them here.</p>
            </>
          )}
      </div>
    </Modal>
  );
}

/* ── Translation defaults ── */

function DefaultsTab({ acc, reload }: { acc: AccountInfo; reload: () => Promise<void> }) {
  const toast = useToast();
  const p = PLANS[acc.plan];
  const d = acc.defaults;
  const [to, setTo] = useState(d.to ?? "km");
  const [voice, setVoice] = useState<VoiceKind>(d.voice && (d.voice !== "cloned" || p.clone) ? d.voice : "standard");
  const [bg, setBg] = useState(d.bg ?? true);
  const [subs, setSubs] = useState(d.subs ?? true);

  async function save() {
    try { await send("/api/account", "PATCH", { defaults: { to, voice, bg, subs } }); toast("Defaults saved"); await reload(); }
    catch (e) { toast((e as Error).message, true); }
  }

  return (
    <>
      <p className="muted t-small">These are filled in for you each time you translate a video. You can still change them per video.</p>
      <div className="field">
        <label className="label" htmlFor="df-to">Translate to</label>
        <select className="select" id="df-to" value={to} onChange={(e) => setTo(e.target.value)}>
          {LANG_OPTIONS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </div>
      <div className="field">
        <span className="label">Voice</span>
        <div className="seg">
          {(["cloned", "natural", "standard"] as VoiceKind[]).map((k) => {
            const locked = k === "cloned" && !p.clone;
            return <button key={k} aria-pressed={voice === k} disabled={locked} title={locked ? "Creator plan and up" : undefined} onClick={() => setVoice(k)}>{VOICE_INFO[k].name}</button>;
          })}
        </div>
      </div>
      <label className="switch"><input type="checkbox" checked={bg} onChange={(e) => setBg(e.target.checked)} /><span className="track" />Keep background music and sounds</label>
      <label className="switch"><input type="checkbox" checked={subs} onChange={(e) => setSubs(e.target.checked)} /><span className="track" />Burn translated subtitles into the video</label>
      <div className="hstack" style={{ justifyContent: "flex-end" }}><button className="btn primary" onClick={save}>Save defaults</button></div>
    </>
  );
}

/* ── Security ── */

function SecurityTab({ acc, reload }: { acc: AccountInfo; reload: () => Promise<void> }) {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  async function savePassword() {
    setBusy(true);
    try { await send("/api/account/password", "POST", { current, next }); toast("Password updated"); setCurrent(""); setNext(""); }
    catch (e) { toast((e as Error).message, true); }
    setBusy(false);
  }
  async function google() {
    try {
      if (acc.google) { await send("/api/account/google", "DELETE"); toast("Google disconnected"); await reload(); }
      else { const r = await send("/api/account/google", "POST"); window.location.href = r.url; }
    } catch (e) { toast((e as Error).message, true); }
  }
  async function deleteAccount() {
    setBusy(true);
    try { await send("/api/account", "DELETE"); window.location.href = "/"; }
    catch (e) { toast((e as Error).message, true); setBusy(false); }
  }

  if (confirmDelete) {
    return (
      <>
        <div className="note rec"><OctagonAlert /><div><b>Delete your account?</b> Your videos, credits and plan are removed for good. This can’t be undone.</div></div>
        <div className="hstack" style={{ justifyContent: "flex-end" }}>
          <button className="btn" onClick={() => setConfirmDelete(false)}>Keep my account</button>
          <button className="btn danger" onClick={deleteAccount} disabled={busy}><Trash2 />Delete account</button>
        </div>
      </>
    );
  }
  return (
    <>
      <div className="stack">
        <h4 className="t-h4">Password</h4>
        <div className="two">
          <div className="field"><label className="label" htmlFor="pw-old">Current password</label><input className="input" id="pw-old" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></div>
          <div className="field"><label className="label" htmlFor="pw-new">New password</label><input className="input" id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /><span className={"hint" + (next && next.length < 8 ? " err" : "")}>At least 8 characters.</span></div>
        </div>
        <div className="hstack" style={{ justifyContent: "flex-end" }}><button className="btn" onClick={savePassword} disabled={busy || !current || next.length < 8}>Update password</button></div>
      </div>
      <div className="panel rows" style={{ boxShadow: "none" }}>
        <div className="row">
          <span className="g-mark" style={{ width: 22, height: 22 }}>G</span>
          <div className="main"><div className="title">Google</div><div className="meta">{acc.google ? "Connected as " + acc.email : "Not connected"}</div></div>
          <button className="btn sm" onClick={google} disabled={acc.google && !acc.canUnlinkGoogle} title={acc.google && !acc.canUnlinkGoogle ? "Set a password first" : undefined}>{acc.google ? "Disconnect" : "Connect"}</button>
        </div>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <h4 className="t-h4">Delete account</h4>
        <p className="muted t-small">Removes your videos, credits and plan.</p>
        <button className="btn danger sm" style={{ alignSelf: "flex-start" }} onClick={() => setConfirmDelete(true)}>Delete account…</button>
      </div>
    </>
  );
}
