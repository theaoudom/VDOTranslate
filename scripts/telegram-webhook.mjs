// Points the Telegram bot at the live site so Approve / Reject presses reach it.
//   node --env-file=.env.local scripts/telegram-webhook.mjs https://samesay-sepia.vercel.app
// Needs TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET (the same values as on Vercel).
const site = process.argv[2];
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!site || !token || !secret) {
  console.error("Usage: node --env-file=.env.local scripts/telegram-webhook.mjs <site url>  (needs TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET)");
  process.exit(1);
}
const url = new URL("/api/telegram/webhook", site).toString();
const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url, secret_token: secret, allowed_updates: ["message", "callback_query"], drop_pending_updates: true }),
});
const json = await res.json();
console.log(json.ok ? `Webhook set: ${url}` : `Failed: ${json.description}`);
process.exit(json.ok ? 0 : 1);
