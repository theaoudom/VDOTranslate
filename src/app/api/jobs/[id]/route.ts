import { NextRequest, NextResponse } from "next/server";
import { buildContainer } from "@/lib/container";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const container = buildContainer();
    const job = await container.getJob.execute(params.id);
    return NextResponse.json(job);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
