import fs from "fs";
import path from "path";
import { NextResponse, type NextRequest } from "next/server";
import { GENRES, LENGTHS, STYLES, toPublicMovie, type MovieSettings } from "@/domain/movie/Movie";
import type { OwnScript } from "@/domain/movie/ports";
import { SupabaseMovieRepository } from "@/data/repositories/SupabaseMovieRepository";
import { buildMovies } from "@/lib/movies";
import { requireUser } from "@/lib/session";
import { fileStore } from "@/lib/uploads";

export const maxDuration = 300;

/** The signed-in user's movies, newest first. */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  return NextResponse.json((await new SupabaseMovieRepository().listForUser(auth.user.id)).map(toPublicMovie));
}

/**
 * Start a movie: { settings, own? }. Without `own` the AI writes the script from the idea;
 * with it, `own.text` and/or `own.files` (keys from /api/movies/files) are read as the user's script.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => ({}));
  const s = body?.settings ?? {};
  const settings: MovieSettings = {
    genre: s.genre in GENRES ? s.genre : "action",
    length: LENGTHS.includes(s.length) ? s.length : 60,
    ratio: s.ratio === "16:9" ? "16:9" : "9:16",
    style: s.style in STYLES ? s.style : "cinematic",
    source: body?.own ? "own" : "ai",
    idea: String(s.idea ?? "").slice(0, 1500),
  };
  let own: OwnScript | null = null;
  if (body?.own) {
    own = { text: String(body.own.text ?? "").slice(0, 20000) || undefined, images: [] };
    const store = fileStore();
    for (const key of Array.isArray(body.own.files) ? body.own.files.slice(0, 10) : []) {
      if (typeof key !== "string" || !key.startsWith(`${auth.user.id}/movies/`)) continue;
      const local = await store.fetch(key).catch(() => null);
      if (!local) continue;
      const ext = path.extname(local).toLowerCase();
      if (ext === ".pdf") own.pdf = local;
      else if (ext === ".txt") own.text = [own.text, fs.readFileSync(local, "utf8")].filter(Boolean).join("\n\n");
      else if (ext === ".docx") {
        const mammoth = await import("mammoth");
        own.text = [own.text, (await mammoth.extractRawText({ path: local })).value].filter(Boolean).join("\n\n");
      } else own.images!.push(local);
    }
    if (!own.text && !own.pdf && !own.images!.length) return NextResponse.json({ error: "Paste your script or add a file first." }, { status: 400 });
  }
  const r = await buildMovies().create(auth.user.id, settings, own);
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.status });
  return NextResponse.json({ id: r.movie.id }, { status: 201 });
}
