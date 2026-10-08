import { type NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { streamFile } from "@/lib/serveFile";
import { requireUser } from "@/lib/session";
import { readUpload } from "@/lib/uploads";

/** Streams an uploaded (not yet translated) video to its owner, e.g. to preview a template on it. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const up = await readUpload(auth.user.id, params.id);
  if (!up) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return streamFile(up.video, req.headers.get("range"), { cache: "private, no-store" });
}
