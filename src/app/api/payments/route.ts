import { NextResponse, type NextRequest } from "next/server";
import { toPublicPayment, type PaymentItem } from "@/domain/payments/Payment";
import { SupabasePaymentRepository } from "@/data/repositories/SupabasePaymentRepository";
import { buildPayments, payDetails } from "@/lib/payments";
import { requireUser } from "@/lib/session";

/** Payment details and the signed-in user's payments that are still being checked or were just decided. */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const list = await new SupabasePaymentRepository().listForUser(auth.user.id, ["pending", "rejected", "approved"]);
  const weekAgo = Date.now() - 7 * 86400_000;
  return NextResponse.json({
    available: buildPayments().available,
    pay: payDetails(),
    payments: list.filter((p) => p.status === "pending" || (p.decidedAt?.getTime() ?? 0) > weekAgo).map(toPublicPayment),
  });
}

/** Opens a pay window for a credit pack ({ kind: "pack", index }) or a plan month ({ kind: "plan", plan }). */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => ({}));
  const item: PaymentItem | null =
    body?.kind === "pack" && Number.isInteger(body.index) ? { kind: "pack", index: body.index }
    : body?.kind === "plan" && (body.plan === "creator" || body.plan === "studio") ? { kind: "plan", plan: body.plan }
    : null;
  if (!item) return NextResponse.json({ error: "Choose a pack or a plan." }, { status: 400 });
  const result = await buildPayments().open(auth.user.id, item);
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json({ payment: toPublicPayment(result.payment), pay: payDetails() }, { status: 201 });
}
