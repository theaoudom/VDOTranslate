import { NextResponse } from "next/server";
import { fileStore } from "./uploads";

/** Sends a stored file to the browser, with Range support so videos can seek. */
export async function streamFile(key: string, range: string | null, opts: { cache: string; downloadName?: string }) {
  const s = await fileStore().stream(key, opts.downloadName ? null : range).catch(() => null);
  if (!s) return NextResponse.json({ error: "Not ready yet." }, { status: range ? 416 : 404 });
  const headers: Record<string, string> = {
    "Content-Type": s.contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": opts.cache,
    ...(s.contentLength ? { "Content-Length": String(s.contentLength) } : {}),
    ...(s.contentRange ? { "Content-Range": s.contentRange } : {}),
    ...(opts.downloadName ? { "Content-Disposition": `attachment; filename="${opts.downloadName.replace(/[^\w.\- ]+/g, "_")}"` } : {}),
  };
  return new NextResponse(s.body, { status: s.status, headers });
}
