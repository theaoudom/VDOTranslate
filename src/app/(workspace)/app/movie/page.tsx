import type { Metadata } from "next";
import { SupabaseMovieRepository } from "@/data/repositories/SupabaseMovieRepository";
import { toPublicMovie, type Movie } from "@/domain/movie/Movie";
import { loadAccount } from "@/lib/account";
import { getCurrentUser } from "@/lib/supabase/server";
import { MovieStart } from "@/presentation/samesay/app/movie/MovieStart";
import { MovieLocked } from "@/presentation/samesay/app/movie/parts";

export const metadata: Metadata = { title: "AI movie" };

export default async function MoviePage() {
  const user = (await getCurrentUser())!;
  const account = await loadAccount(user);
  if (account.plan === "free") return <MovieLocked />;
  const movies: Movie[] = account.ready ? await new SupabaseMovieRepository().listForUser(user.id, 8).catch(() => []) : [];
  return <MovieStart credits={account.credits} movies={movies.map(toPublicMovie)} />;
}
