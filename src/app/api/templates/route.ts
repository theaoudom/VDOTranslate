import { NextResponse, type NextRequest } from "next/server";
import { sanitizeLayers, type FrameRatio } from "@/domain/entities/Template";
import { SupabaseTemplateRepository } from "@/data/repositories/SupabaseRepositories";
import { requireUser } from "@/lib/session";

const RATIOS: FrameRatio[] = ["16:9", "9:16", "1:1"];

export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  return NextResponse.json(await new SupabaseTemplateRepository().listForUser(auth.user.id));
}

/** New template (also used for "Duplicate", which sends the layers to copy). */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => ({}));
  const repo = new SupabaseTemplateRepository();
  if ((await repo.listForUser(auth.user.id)).length >= 50) return NextResponse.json({ error: "You can keep up to 50 templates." }, { status: 400 });
  const t = await repo.create({
    userId: auth.user.id,
    name: String(body?.name ?? "My template").trim().slice(0, 60) || "My template",
    ratio: RATIOS.includes(body?.ratio) ? body.ratio : "16:9",
    pan: typeof body?.pan === "number" ? Math.max(0, Math.min(100, body.pan)) : 50,
    layers: sanitizeLayers(body?.layers),
  });
  return NextResponse.json(t, { status: 201 });
}
