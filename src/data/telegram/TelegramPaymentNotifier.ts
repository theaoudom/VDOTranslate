import "server-only";
import type { Customer, IPaymentNotifier, Payment } from "@/domain/payments/Payment";
import { paymentLabel } from "@/domain/payments/Payment";

/*
 * The team's Telegram bot. Each payment marked as paid is posted to the admin chat with
 * Approve / Reject buttons; presses come back to /api/telegram/webhook.
 *   TELEGRAM_BOT_TOKEN        from @BotFather
 *   TELEGRAM_ADMIN_CHAT_ID    who gets alerts and may approve (comma-separated for several)
 *   TELEGRAM_WEBHOOK_SECRET   checked on every webhook call
 */
const TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
export const ADMIN_CHAT_IDS = (process.env.TELEGRAM_ADMIN_CHAT_ID ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export async function telegram<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
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
    `💰 <b>${note ? "Payment" : "New payment"} · ${money(p.usd)}</b>`,
    esc(paymentLabel(p)) + (p.kind === "plan" ? ` · ${p.credits.toLocaleString("en-US")} credits` : ""),
    `Note: <code>${esc(p.ref)}</code>`,
    `From: ${esc(c.name || "—")} · ${esc(c.email)}`,
    `Sent: ${when(p.paidAt)}`,
    note ? `\n<b>${esc(note)}</b>` : `\nCheck your bank for <b>${money(p.usd)}</b> with note <code>${esc(p.ref)}</code>, then approve.`,
  ].join("\n");
}

export class TelegramPaymentNotifier implements IPaymentNotifier {
  get configured() {
    return Boolean(TOKEN && ADMIN_CHAT_IDS.length);
  }

  async announce(p: Payment, c: Customer) {
    let first: number | null = null;
    for (const chat of ADMIN_CHAT_IDS) {
      const msg = await telegram<{ message_id: number }>("sendMessage", {
        chat_id: chat,
        text: text(p, c),
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "✅ Approve", callback_data: `pay:a:${p.id}` }, { text: "❌ Reject", callback_data: `pay:r:${p.id}` }]] },
      });
      first ??= msg.message_id;
    }
    return first;
  }

  async update(p: Payment, c: Customer, note: string) {
    // The message id is only known for the first admin chat.
    if (!p.tgMessageId || !ADMIN_CHAT_IDS[0]) return;
    await telegram("editMessageText", { chat_id: ADMIN_CHAT_IDS[0], message_id: p.tgMessageId, text: text(p, c, note), parse_mode: "HTML" });
  }
}
