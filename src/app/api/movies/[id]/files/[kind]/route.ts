import { NextResponse, type NextRequest } from "next/server";
import { SupabaseMovieRepository } from "@/data/repositories/SupabaseMovieRepository";
import { streamFile } from "@/lib/serveFile";
import { requireUser } from "@/lib/session";

/**
 * video            the finished movie (?download=1 to save)
 * portrait-<c1>    a character's picture (their photo when they use one)
 * frame-<h3>       first frame of a shot · shot-<h3> the shot's clip
 */
export async function GET(req: NextRequest, { params }: { params: { id: string; kind: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const m = await new SupabaseMovieRepository().findById(params.id).catch(() => null);
  if (!m || m.userId !== auth.user.id) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const [kind, ref] = params.kind.split(/-(.+)/);
  const c = m.cast.find((x) => x.id === ref), sh = m.shots.find((x) => x.id === ref);
  const key = kind === "video" ? m.files.video
    : kind === "portrait" ? c?.photo ?? c?.portrait
    : kind === "frame" ? sh?.frame
    : kind === "shot" ? sh?.file
    : null;
  if (!key) return NextResponse.json({ error: "Not ready yet." }, { status: 404 });
  const download = req.nextUrl.searchParams.has("download") ? `${m.name.replace(/[^\w.\- ]+/g, "_") || "movie"}.mp4` : undefined;
  return streamFile(key, req.headers.get("range"), { cache: kind === "video" ? "private, no-store" : "private, max-age=3600", downloadName: download });
}
