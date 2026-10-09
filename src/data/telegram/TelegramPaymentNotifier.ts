import "server-only";
import type { Customer, IPaymentNotifier, Payment } from "@/domain/payments/Payment";
import { paymentLabel } from "@/domain/payments/Payment";

/*
 * Payment alerts go to the team's Telegram chat. The bot can be shared with another app,
 * so Approve / Reject are links to a confirm page on this site instead of bot buttons.
 *   TELEGRAM_BOT_TOKEN        from @BotFather (only used to send and edit messages)
 *   TELEGRAM_ADMIN_CHAT_ID    who gets the alerts (comma-separated for several)
 */
const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const ADMIN_CHAT_IDS = (process.env.TELEGRAM_ADMIN_CHAT_ID ?? "").split(",").map((s) => s.trim()).filter(Boolean);

async function telegram<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!json.ok) throw new Error(`Telegram ${method} failed: ${json.description ?? res.status}`);
  return json.result as T;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const money = (usd: number) => "$" + usd.toFixed(2);
const when = (d: Date | null) => (d ?? new Date()).toLocaleString("en-GB", { timeZone: "Asia/Phnom_Penh", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

function text(p: Payment, c: Customer, note?: string) {
  return [
    `💰 <b>Samesay · ${note ? "payment" : "new payment"} · ${money(p.usd)}</b>`,
    esc(paymentLabel(p)) + (p.kind === "plan" ? ` · ${p.credits.toLocaleString("en-US")} credits` : ""),
    `Note: <code>${esc(p.ref)}</code>`,
    `From: ${esc(c.name || "—")} · ${esc(c.email)}`,
    `Sent: ${when(p.paidAt)}`,
    note ? `\n<b>${esc(note)}</b>` : `\nCheck your bank for <b>${money(p.usd)}</b> with note <code>${esc(p.ref)}</code>, then approve.`,
  ].join("\n");
}

export class TelegramPaymentNotifier implements IPaymentNotifier {
  constructor(private readonly linkFor: (p: Payment, action: "approve" | "reject") => string, private readonly linksReady: boolean) {}

  get configured() {
    return Boolean(TOKEN && ADMIN_CHAT_IDS.length && this.linksReady);
  }

  async announce(p: Payment, c: Customer) {
    const approve = this.linkFor(p, "approve"), reject = this.linkFor(p, "reject");
    // Telegram only accepts public https links on buttons; on localhost put them in the text.
    const local = !approve.startsWith("https://");
    let first: number | null = null;
    for (const chat of ADMIN_CHAT_IDS) {
      const msg = await telegram<{ message_id: number }>("sendMessage", {
        chat_id: chat,
        text: text(p, c) + (local ? `\n\nApprove: ${approve}\nReject: ${reject}` : ""),
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...(local ? {} : { reply_markup: { inline_keyboard: [[{ text: "✅ Approve", url: approve }, { text: "❌ Reject", url: reject }]] } }),
      });
      first ??= msg.message_id;
    }
    return first;
  }

  async update(p: Payment, c: Customer, note: string) {
    // The message id is only kept for the first admin chat.
    if (!p.tgMessageId || !ADMIN_CHAT_IDS[0]) return;
    await telegram("editMessageText", { chat_id: ADMIN_CHAT_IDS[0], message_id: p.tgMessageId, text: text(p, c, note), parse_mode: "HTML" });
  }
}
