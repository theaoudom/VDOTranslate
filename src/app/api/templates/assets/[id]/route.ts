import fs from "fs";
import { Readable } from "stream";
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/session";
import { readAsset } from "@/lib/templateAssets";

const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".mp4": "video/mp4", ".m4v": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm" };

/** Serves a template image / clip to its owner (with Range so clips can play). */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const a = readAsset(auth.user.id, params.id);
  if (!a) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const size = fs.statSync(a.file).size;
  const headers = { "Content-Type": TYPES[a.ext] ?? "application/octet-stream", "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" };
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") ?? "");
  if (range) {
    const start = range[1] ? +range[1] : 0;
    const end = range[2] ? Math.min(+range[2], size - 1) : size - 1;
    if (start >= size || start > end) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    return new NextResponse(Readable.toWeb(fs.createReadStream(a.file, { start, end })) as ReadableStream, { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  return new NextResponse(Readable.toWeb(fs.createReadStream(a.file)) as ReadableStream, { headers: { ...headers, "Content-Length": String(size) } });
}
