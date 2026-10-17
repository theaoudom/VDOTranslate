import { NextResponse, type NextRequest } from "next/server";
import { start } from "workflow/api";
import { CLIP_LENGTHS, CLIP_SCENES, STYLES, toPublicMovie, type ModelTier } from "@/domain/movie/Movie";
import { buildMovies } from "@/lib/movies";
import { requireUser } from "@/lib/session";
import { makeMovie } from "@/workflows/jobs";

export const maxDuration = 300;

/** Quick clip: { prompt, photos: [keys from /api/movies/files], consent, sec, model, ratio, style } → one short video.
 *  From a template: { scene, photos, consent, model }; the scene sets what happens, length, frame and look. */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const b = await req.json().catch(() => ({}));
  const photos: string[] = Array.isArray(b?.photos) ? b.photos.map(String) : [];
  const scene = b?.scene ? CLIP_SCENES.find((c) => c.id === b.scene) : null;
  if (b?.scene && !scene) return NextResponse.json({ error: "This template isn’t available any more." }, { status: 404 });
  if (scene && photos.length < scene.people) return NextResponse.json({ error: scene.people === 2 ? "Add both photos first." : "Add a photo first." }, { status: 400 });
  const movies = buildMovies();
  const r = await movies.createClip(auth.user.id, {
    prompt: scene ? scene.prompt : String(b?.prompt ?? ""),
    photos,
    consent: b?.consent === true,
    sec: scene ? scene.sec : CLIP_LENGTHS.includes(b?.sec) ? b.sec : 10,
    model: String(b?.model ?? "draft") as ModelTier,
    ratio: scene ? scene.ratio : b?.ratio === "16:9" ? "16:9" : "9:16",
    style: scene ? scene.style : b?.style in STYLES ? b.style : "cinematic",
  });
  if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.status });
  try {
    await start(makeMovie, [r.movie.id, r.movie.shots.map((s) => s.id)]);
  } catch (e) {
    console.error("[clip] couldn't start", e);
    await movies.failMovie(r.movie.id, "We couldn’t start making the video. All held credits were returned.");
    return NextResponse.json({ error: "We couldn’t start. Your credits were returned. Please try again." }, { status: 503 });
  }
  return NextResponse.json(toPublicMovie(r.movie), { status: 201 });
}
