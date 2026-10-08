import { NextResponse, type NextRequest } from "next/server";
import { streamFile } from "@/lib/serveFile";
import { requireUser } from "@/lib/session";
import { readAsset } from "@/lib/templateAssets";

/** Serves a template image / clip to its owner (with Range so clips can play). */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const a = await readAsset(auth.user.id, params.id);
  if (!a) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return streamFile(a.file, req.headers.get("range"), { cache: "private, max-age=3600" });
}
