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
  const result = await buildPayments().decide(id, action === "approve", customerOf);
  redirect(`/review-payment/${id}?a=${action}&s=${encodeURIComponent(sig)}&done=${encodeURIComponent(result)}`);
}
