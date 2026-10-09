import "server-only";
import crypto from "crypto";

/*
 * Approve / Reject in Telegram are links (the bot is shared with another app, so button
 * presses can't come back here). Each link is signed for one payment and one action.
 *   PAYMENT_LINK_SECRET   any long random string, the same locally and on Vercel
 */
export type ReviewAction = "approve" | "reject";

const secret = () => process.env.PAYMENT_LINK_SECRET ?? "";

/** The site's public address: SITE_URL, else Vercel's production domain, else localhost. */
export function siteUrl() {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

export function signReview(id: string, action: ReviewAction) {
  return crypto.createHmac("sha256", secret()).update(`${id}:${action}`).digest("base64url").slice(0, 32);
}

export function verifyReview(id: string, action: string, sig: string): action is ReviewAction {
  if (!secret() || (action !== "approve" && action !== "reject")) return false;
  const want = Buffer.from(signReview(id, action));
  const got = Buffer.from(sig);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

export function reviewLink(id: string, action: ReviewAction) {
  return `${siteUrl()}/review-payment/${id}?a=${action}&s=${signReview(id, action)}`;
}

export const reviewLinksReady = () => Boolean(secret());
