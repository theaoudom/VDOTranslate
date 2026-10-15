import type { Character, ModelTier, Movie, MovieRatio, MovieSettings, Scene, Shot } from "./Movie";

export interface IMovieRepository {
  create(m: Pick<Movie, "userId" | "name" | "settings" | "script" | "cast" | "shots" | "quality">): Promise<Movie>;
  findById(id: string): Promise<Movie | null>;
  listForUser(userId: string, limit?: number): Promise<Movie[]>;
  update(id: string, changes: Partial<Omit<Movie, "id" | "userId" | "createdAt" | "updatedAt">>): Promise<Movie>;
  /**
   * Read, change and save in one go: if the movie was saved by someone else in between
   * (two shots being made at once), it reads again and re-applies `change`.
   */
  mutate(id: string, change: (m: Movie) => Partial<Omit<Movie, "id" | "userId" | "createdAt" | "updatedAt">>): Promise<Movie>;
  /** Movies still being made, for recovery. */
  listMaking(): Promise<Movie[]>;
}

/** What the script writer gives back for a new movie. */
export interface WrittenMovie {
  name: string;
  script: Scene[];
  cast: Omit<Character, "hue" | "ver">[];
  shots: Omit<Shot, "model" | "state">[];
}

/** Your own script, as text or files the writer can read (local paths). */
export interface OwnScript {
  text?: string;
  pdf?: string;
  images?: string[];
}

export interface IMovieWriter {
  /** false when the text breaks the content rules */
  allowed(text: string): Promise<boolean>;
  write(settings: MovieSettings): Promise<WrittenMovie>;
  /** Splits the user's own script into scenes, lines, characters and shots without rewriting it. */
  read(own: OwnScript, settings: MovieSettings): Promise<WrittenMovie>;
  /** Rewrites one scene with the chosen changes; the rest of the script is context. */
  rewriteScene(scene: Scene, script: Scene[], settings: MovieSettings, tones: string[], ask: string): Promise<Scene>;
  /** New shots for an edited script. */
  planShots(script: Scene[], cast: Character[], settings: MovieSettings): Promise<Omit<Shot, "model" | "state">[]>;
}

export type ShotCheck =
  | { state: "running" }
  | { state: "done"; file: string }
  | { state: "blocked"; reason: string }
  | { state: "failed"; reason: string };

/** Pictures and video clips from the AI models. Files are local paths. */
export interface IMovieMedia {
  /** a reference portrait for a character */
  portrait(prompt: string, outPath: string): Promise<void>;
  /** the first frame of a shot, keeping the characters' faces from their pictures */
  frame(prompt: string, references: string[], ratio: MovieRatio, outPath: string): Promise<void>;
  /** starts making a shot; returns the request to check later */
  startShot(tier: ModelTier, prompt: string, framePath: string, sec: number, ratio: MovieRatio): Promise<string>;
  checkShot(tier: ModelTier, requestId: string, outPath: string): Promise<ShotCheck>;
}

/** The content filters refused this picture or shot. */
export class BlockedContentError extends Error {}
