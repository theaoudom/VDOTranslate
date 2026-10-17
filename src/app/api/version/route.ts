import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** The running version, so open pages can tell when a newer one was deployed. */
export function GET() {
  return NextResponse.json({ version: process.env.APP_VERSION ?? "dev" }, { headers: { "Cache-Control": "no-store" } });
}
