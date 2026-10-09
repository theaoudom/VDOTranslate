import { NextResponse, type NextRequest } from "next/server";
import { toPublicPayment } from "@/domain/payments/Payment";
import { buildPayments, customerOf } from "@/lib/payments";
import { requireUser } from "@/lib/session";

/** { action: "paid" } sends the payment to the team for checking; { action: "cancel" } withdraws it. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => ({}));
  const payments = buildPayments();
  const customer = await customerOf(auth.user.id);
  const result =
    body?.action === "paid" ? await payments.markPaid(auth.user.id, params.id, customer)
    : body?.action === "cancel" ? await payments.cancel(auth.user.id, params.id, customer)
    : null;
  if (!result) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json({ payment: toPublicPayment(result.payment) });
}
