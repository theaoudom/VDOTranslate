import path from "path";
import { NextResponse, type NextRequest } from "next/server";
import { buildContainer } from "@/lib/container";
import { streamFile } from "@/lib/serveFile";
import { requireUser } from "@/lib/session";

const TYPES: Record<string, string> = { ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".mkv": "video/x-matroska", ".mp3": "audio/mpeg", ".srt": "application/x-subrip" };

/**
 * video    → translated video (streams with Range so the player can seek)
 * original → the uploaded video
 * audio    → the new soundtrack (MP3)
 * srt      → translated subtitles
 * Add ?download=1 to save instead of play.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string; kind: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const job = await buildContainer().jobs.findById(params.id).catch(() => null);
  if (!job || job.userId !== auth.user.id) return NextResponse.json({ error: "Video not found." }, { status: 404 });

  const base = job.name.replace(/\.[^.]+$/, "");
  const download = req.nextUrl.searchParams.has("download");

  if (params.kind === "srt") {
    if (!job.lines) return NextResponse.json({ error: "Not ready yet." }, { status: 404 });
    return new NextResponse(toSrt(job.lines), {
      headers: { "Content-Type": TYPES[".srt"] + "; charset=utf-8", "Content-Disposition": `attachment; filename="${safe(base)}-${job.targetLanguage}.srt"` },
    });
  }

  const file = params.kind === "video" ? job.files.video : params.kind === "original" ? job.files.original : params.kind === "audio" ? job.files.mixed ?? job.files.voices : undefined;
  if (!file) return NextResponse.json({ error: "Not ready yet." }, { status: 404 });
  const ext = path.extname(file).toLowerCase();
  const name = params.kind === "original" ? job.name : `${base}-${job.targetLanguage}${ext}`;
  return streamFile(file, req.headers.get("range"), { cache: "private, no-store", downloadName: download ? name : undefined });
}

const safe = (s: string) => s.replace(/[^\w.\- ]+/g, "_");

function toSrt(lines: { start: number; end: number; text: string }[]) {
  const t = (s: number) => {
    const ms = Math.max(0, Math.round(s * 1000));
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), sec = Math.floor((ms % 60000) / 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
  };
  return lines.map((l, i) => `${i + 1}\n${t(l.start)} --> ${t(Math.max(l.end, l.start + 0.8))}\n${l.text}\n`).join("\n");
}
