import { NextResponse, type NextRequest } from "next/server";
import { cleanupFiles, recoverStuckJobs, tidyBilling } from "@/lib/maintenance";

export const maxDuration = 300;

/** Called by Vercel Cron (see vercel.json): returns credits of stuck jobs and deletes old files. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await recoverStuckJobs();
  await cleanupFiles();
  await tidyBilling();
  return NextResponse.json({ ok: true });
}
