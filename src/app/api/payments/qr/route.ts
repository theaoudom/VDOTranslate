import fs from "fs";
import { NextResponse } from "next/server";
import { QR_FILE } from "@/lib/payments";
import { requireUser } from "@/lib/session";

/** The KHQR picture people scan to pay (assets/khqr.png). */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  if (!fs.existsSync(QR_FILE)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return new NextResponse(fs.readFileSync(QR_FILE), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" } });
}
