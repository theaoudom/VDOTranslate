import { NextResponse, type NextRequest } from "next/server";
import { toPublicJob } from "@/domain/entities/TranslationJob";
import { buildContainer } from "@/lib/container";
import { requireUser } from "@/lib/session";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const job = await buildContainer().jobs.findById(params.id).catch(() => null);
  if (!job || job.userId !== auth.user.id) return NextResponse.json({ error: "Video not found." }, { status: 404 });
  return NextResponse.json(toPublicJob(job));
}
