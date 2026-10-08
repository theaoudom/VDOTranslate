import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { NextResponse, type NextRequest } from "next/server";
import { jobDir } from "@/lib/container";
import { requireUser } from "@/lib/session";

/** Streams an uploaded (not yet translated) video to its owner, e.g. to preview a template on it. */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  let dir: string;
  try { dir = jobDir(auth.user.id, params.id); } catch { return NextResponse.json({ error: "Not found." }, { status: 404 }); }
  const metaPath = path.join(dir, "upload.json");
  if (!fs.existsSync(metaPath)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as { ext: string };
  const file = path.join(dir, "original" + meta.ext);
  if (!fs.existsSync(file)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const size = fs.statSync(file).size;
  const headers = { "Content-Type": meta.ext === ".webm" ? "video/webm" : meta.ext === ".mov" ? "video/quicktime" : "video/mp4", "Accept-Ranges": "bytes", "Cache-Control": "private, no-store" };
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") ?? "");
  if (range) {
    const start = range[1] ? +range[1] : 0;
    const end = range[2] ? Math.min(+range[2], size - 1) : size - 1;
    if (start >= size || start > end) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    return new NextResponse(Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream, { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  return new NextResponse(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, { headers: { ...headers, "Content-Length": String(size) } });
}
