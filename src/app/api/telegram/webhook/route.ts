import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_CHAT_IDS, telegram } from "@/data/telegram/TelegramPaymentNotifier";
import { buildPayments, customerOf } from "@/lib/payments";

/*
 * Telegram calls this for every update to the bot (set up with scripts/telegram-webhook.mjs).
 * Only the Approve / Reject buttons do anything, and only for the admin chat ids.
 */
interface Update {
  callback_query?: { id: string; data?: string; from: { id: number } };
  message?: { chat: { id: number }; text?: string };
}

export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) return NextResponse.json({ ok: false }, { status: 401 });
  const update = (await req.json().catch(() => ({}))) as Update;

  const q = update.callback_query;
  if (q) {
    const m = /^pay:(a|r):([0-9a-f-]{36})$/.exec(q.data ?? "");
    let answer = "Unknown button.";
    if (!ADMIN_CHAT_IDS.includes(String(q.from.id))) answer = "You can’t approve payments.";
    else if (m) answer = await buildPayments().decide(m[2], m[1] === "a", customerOf).catch((e) => {
      console.error("[telegram] decide failed", e);
      return "Something went wrong. Try again.";
    });
    await telegram("answerCallbackQuery", { callback_query_id: q.id, text: answer }).catch(() => {});
    return NextResponse.json({ ok: true });
  }

  // "/start" or any text: tell the sender their chat id (needed for TELEGRAM_ADMIN_CHAT_ID).
  const msg = update.message;
  if (msg?.text) {
    const isAdmin = ADMIN_CHAT_IDS.includes(String(msg.chat.id));
    await telegram("sendMessage", {
      chat_id: msg.chat.id,
      text: isAdmin ? "You’ll get Samesay payment alerts here." : `Your chat id is ${msg.chat.id}.`,
    }).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
