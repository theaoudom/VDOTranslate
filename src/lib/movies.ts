import "server-only";
import { FFmpegMediaRepository } from "@/data/repositories/FFmpegMediaRepository";
import { SupabaseMovieRepository } from "@/data/repositories/SupabaseMovieRepository";
import { SupabaseCreditRepository } from "@/data/repositories/SupabaseRepositories";
import { FalMovieMedia } from "@/data/movie/FalMovieMedia";
import { OpenAIMovieWriter } from "@/data/movie/OpenAIMovieWriter";
import { TestMovieMedia } from "@/data/movie/TestMovieMedia";
import { MovieUseCases } from "@/domain/movie/MovieUseCases";
import { fileStore } from "./uploads";

/** MOVIE_TEST_MODE=1 makes pictures and clips locally for free instead of with the AI models. */
export const movieTestMode = process.env.MOVIE_TEST_MODE === "1";

export function buildMovies() {
  return new MovieUseCases(
    new SupabaseMovieRepository(), new SupabaseCreditRepository(), new OpenAIMovieWriter(),
    movieTestMode ? new TestMovieMedia() : new FalMovieMedia(), new FFmpegMediaRepository(), fileStore(),
  );
}
