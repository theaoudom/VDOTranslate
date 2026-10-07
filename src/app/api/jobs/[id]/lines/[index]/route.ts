import { NextResponse, type NextRequest } from "next/server";
import { buildContainer } from "@/lib/container";
import { requireUser } from "@/lib/session";

/** Fix one translated line: charges 1 credit and re-voices only that line. */
export async function POST(req: NextRequest, { params }: { params: { id: string; index: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => null);
  const index = Number(params.index);
  if (!Number.isInteger(index) || index < 0) return NextResponse.json({ error: "Line not found." }, { status: 404 });
  const result = await buildContainer().revoiceLine.start(auth.user.id, params.id, index, String(body?.text ?? ""));
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.status });
  return NextResponse.json({ ok: true }, { status: 202 });
}
