import { NextResponse, type NextRequest } from "next/server";
import { toPublicMovie, type MovieQuality } from "@/domain/movie/Movie";
import { SupabaseMovieRepository } from "@/data/repositories/SupabaseMovieRepository";
import { buildMovies } from "@/lib/movies";
import { requireUser } from "@/lib/session";

export const maxDuration = 300;
const QUALITIES: MovieQuality[] = ["budget", "balanced", "premium", "custom"];

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const m = await new SupabaseMovieRepository().findById(params.id).catch(() => null);
  if (!m || m.userId !== auth.user.id) return NextResponse.json({ error: "Movie not found." }, { status: 404 });
  return NextResponse.json(toPublicMovie(m));
}

/** Auto-save from the editor: { script } | { character: { id, name?, desc? } } | { quality, shots: [{ id, sec?, model? }] }. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => ({}));
  const movies = buildMovies();
  const r = body?.script ? await movies.saveScript(auth.user.id, params.id, body.script)
    : body?.character?.id ? await movies.saveCharacter(auth.user.id, params.id, String(body.character.id), { name: body.character.name, desc: body.character.desc })
    : QUALITIES.includes(body?.quality) ? await movies.saveShots(auth.user.id, params.id, body.quality, Array.isArray(body.shots) ? body.shots : [])
    : null;
  if (!r) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.status });
  return NextResponse.json(toPublicMovie(r.movie));
}
