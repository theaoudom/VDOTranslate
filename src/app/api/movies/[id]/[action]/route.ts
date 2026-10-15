import { NextResponse, type NextRequest } from "next/server";
import { start } from "workflow/api";
import { toPublicMovie } from "@/domain/movie/Movie";
import { buildMovies } from "@/lib/movies";
import { requireUser } from "@/lib/session";
import { makeMovie, remakeMovieShot } from "@/workflows/jobs";

export const maxDuration = 300;

/**
 * scene    { sceneId, tones[], ask }      change one scene (1 cr)
 * plan                                     plan shots again after the script changed (free)
 * portrait { characterId }                 new AI portrait (2 cr)
 * photo    { characterId, key, consent }   use the user's photo   · DELETE photo → back to an AI face
 * make                                     hold the price and make the movie
 * remake   { shotId, desc }                make one shot again
 */
export async function POST(req: NextRequest, { params }: { params: { id: string; action: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => ({}));
  const movies = buildMovies();
  const uid = auth.user.id, id = params.id;
  let r;
  switch (params.action) {
    case "scene": r = await movies.changeScene(uid, id, String(body?.sceneId ?? ""), Array.isArray(body?.tones) ? body.tones.map(String).slice(0, 6) : [], String(body?.ask ?? "").slice(0, 300)); break;
    case "rewrite": r = await movies.rewriteAll(uid, id, Array.isArray(body?.tones) ? body.tones.map(String).slice(0, 6) : []); break;
    case "plan": r = await movies.planShots(uid, id); break;
    case "portrait": r = await movies.newPortrait(uid, id, String(body?.characterId ?? "")); break;
    case "photo": r = await movies.usePhoto(uid, id, String(body?.characterId ?? ""), String(body?.key ?? ""), body?.consent === true); break;
    case "make": {
      r = await movies.start(uid, id);
      if (r.ok) {
        try { await start(makeMovie, [id, r.movie.shots.map((s) => s.id)]); }
        catch (e) { console.error("[movie] couldn't start", e); await movies.failMovie(id, "We couldn’t start making the movie. All held credits were returned."); return NextResponse.json({ error: "We couldn’t start. Your credits were returned. Please try again." }, { status: 503 }); }
      }
      break;
    }
    case "remake": {
      r = await movies.startRemake(uid, id, String(body?.shotId ?? ""), String(body?.desc ?? ""));
      if (r.ok) await start(remakeMovieShot, [id, String(body.shotId)]);
      break;
    }
    default: return NextResponse.json({ error: "Unknown action." }, { status: 404 });
  }
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.status });
  return NextResponse.json(toPublicMovie(r.movie));
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string; action: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  if (params.action !== "photo") return NextResponse.json({ error: "Unknown action." }, { status: 404 });
  const characterId = req.nextUrl.searchParams.get("characterId") ?? "";
  const r = await buildMovies().useAiFace(auth.user.id, params.id, characterId);
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.status });
  return NextResponse.json(toPublicMovie(r.movie));
}
