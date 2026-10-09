"use server";

import { redirect } from "next/navigation";
import { verifyReview } from "@/lib/paymentLinks";
import { buildPayments, customerOf } from "@/lib/payments";

/** The confirm button on the review page: checks the signed link again, then decides. */
export async function decidePayment(form: FormData) {
  const id = String(form.get("id") ?? "");
  const action = String(form.get("a") ?? "");
  const sig = String(form.get("s") ?? "");
  if (!verifyReview(id, action, sig)) redirect(`/review-payment/${encodeURIComponent(id)}?bad=1`);
  // Paid less than the price? The team can give fewer credits, or not start the plan month.
  const text = String(form.get("credits") ?? "").trim();
  const raw = Number(text);
  const credits = text && Number.isInteger(raw) && raw >= 0 && raw <= 100_000 ? raw : undefined; // empty = full amount
  const startPlan = form.get("startPlan") === "on";
  const result = await buildPayments().decide(id, action === "approve", customerOf, { credits, startPlan });
  redirect(`/review-payment/${id}?a=${action}&s=${encodeURIComponent(sig)}&done=${encodeURIComponent(result)}`);
}
