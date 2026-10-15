import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SupabaseMovieRepository } from "@/data/repositories/SupabaseMovieRepository";
import { toPublicMovie } from "@/domain/movie/Movie";
import { loadAccount } from "@/lib/account";
import { getCurrentUser } from "@/lib/supabase/server";
import { MovieCast } from "@/presentation/samesay/app/movie/MovieCast";
import { MovieMake } from "@/presentation/samesay/app/movie/MovieMake";
import { MovieScript } from "@/presentation/samesay/app/movie/MovieScript";
import { MovieShots } from "@/presentation/samesay/app/movie/MovieShots";
import { MovieLocked } from "@/presentation/samesay/app/movie/parts";

export const metadata: Metadata = { title: "AI movie" };
export const dynamic = "force-dynamic";

/** /app/movie/<id>/script | cast | shots | make */
export default async function MovieStepPage({ params }: { params: { id: string; step: string } }) {
  const user = (await getCurrentUser())!;
  const movie = await new SupabaseMovieRepository().findById(params.id).catch(() => null);
  if (!movie || movie.userId !== user.id) notFound();
  const account = await loadAccount(user);
  if (account.plan === "free" && movie.status === "draft") return <MovieLocked />;
  const m = toPublicMovie(movie);
  // once it's being made (or done), only the make / result page applies
  if (movie.status !== "draft" && params.step !== "make") redirect(`/app/movie/${movie.id}/make`);
  switch (params.step) {
    case "script": return <MovieScript initial={m} />;
    case "cast": return <MovieCast initial={m} />;
    case "shots": return <MovieShots initial={m} credits={account.credits} />;
    case "make": if (movie.status === "draft") redirect(`/app/movie/${movie.id}/shots`); return <MovieMake initial={m} />;
    default: notFound();
  }
}
