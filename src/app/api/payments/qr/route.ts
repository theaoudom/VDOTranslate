import fs from "fs";
import { NextResponse } from "next/server";
import { qrFile } from "@/lib/payments";
import { requireUser } from "@/lib/session";

/** The KHQR picture people scan to pay (assets/khqr.png). */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const file = qrFile();
  if (!file) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return new NextResponse(fs.readFileSync(file), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" } });
}
