import { NextResponse, type NextRequest } from "next/server";
import { sanitizeLayers, type FrameRatio } from "@/domain/entities/Template";
import { SupabaseTemplateRepository } from "@/data/repositories/SupabaseRepositories";
import { requireUser } from "@/lib/session";

const RATIOS: FrameRatio[] = ["16:9", "9:16", "1:1"];

async function owned(userId: string, id: string) {
  const repo = new SupabaseTemplateRepository();
  const t = await repo.findById(id).catch(() => null);
  return t && t.userId === userId ? { repo, t } : null;
}

/** Auto-save from the editor: any of name, ratio, pan, layers. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const found = await owned(auth.user.id, params.id);
  if (!found) return NextResponse.json({ error: "Template not found." }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const changes: Parameters<typeof found.repo.update>[1] = {};
  if (typeof body?.name === "string" && body.name.trim()) changes.name = body.name.trim().slice(0, 60);
  if (RATIOS.includes(body?.ratio)) changes.ratio = body.ratio;
  if (typeof body?.pan === "number") changes.pan = Math.max(0, Math.min(100, body.pan));
  if (Array.isArray(body?.layers)) changes.layers = sanitizeLayers(body.layers);
  return NextResponse.json(await found.repo.update(params.id, changes));
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const found = await owned(auth.user.id, params.id);
  if (!found) return NextResponse.json({ error: "Template not found." }, { status: 404 });
  await found.repo.delete(params.id);
  return NextResponse.json({ ok: true });
}
