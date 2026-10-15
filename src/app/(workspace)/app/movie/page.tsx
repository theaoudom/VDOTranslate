import type { Metadata } from "next";
import { SupabaseMovieRepository } from "@/data/repositories/SupabaseMovieRepository";
import { toPublicMovie, type Movie } from "@/domain/movie/Movie";
import { loadAccount } from "@/lib/account";
import { getCurrentUser } from "@/lib/supabase/server";
import { MovieStart } from "@/presentation/samesay/app/movie/MovieStart";
import { MovieLocked } from "@/presentation/samesay/app/movie/parts";

export const metadata: Metadata = { title: "AI movie" };

export default async function MoviePage({ searchParams }: { searchParams: { from?: string } }) {
  const user = (await getCurrentUser())!;
  const account = await loadAccount(user);
  if (account.plan === "free") return <MovieLocked />;
  const movies: Movie[] = account.ready ? await new SupabaseMovieRepository().listForUser(user.id, 8).catch(() => []) : [];
  // "Change and try again" on a failed Quick clip: start the form from it
  const src = searchParams.from ? await new SupabaseMovieRepository().findById(searchParams.from).catch(() => null) : null;
  const sh = src?.shots[0];
  const clipFrom = src && src.userId === user.id && src.settings.kind === "clip" && sh ? {
    prompt: sh.desc, sec: sh.sec, model: sh.model, ratio: src.settings.ratio, style: src.settings.style,
    photos: src.cast.filter((c) => c.photo).map((c) => ({ key: c.photo!, name: `${c.name} photo`, url: `/api/movies/${src.id}/files/portrait-${c.id}` })),
  } : null;
  return <MovieStart credits={account.credits} movies={movies.map(toPublicMovie)} clipFrom={clipFrom} />;
}
