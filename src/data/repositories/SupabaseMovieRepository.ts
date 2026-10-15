import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import type { Movie } from "@/domain/movie/Movie";
import type { IMovieRepository } from "@/domain/movie/ports";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = () => adminClient() as any;

function fromRow(r: any): Movie {
  return {
    id: r.id, userId: r.user_id, name: r.name, status: r.status, settings: r.settings ?? {}, script: r.script ?? [], cast: r.cast ?? [],
    shots: r.shots ?? [], quality: r.quality, held: r.held, used: r.used, files: r.files ?? {}, error: r.error ?? null,
    createdAt: new Date(r.created_at), updatedAt: new Date(r.updated_at),
  };
}

const COLUMNS: Record<string, string> = { name: "name", status: "status", settings: "settings", script: "script", cast: "cast", shots: "shots", quality: "quality", held: "held", used: "used", files: "files", error: "error" };

export class SupabaseMovieRepository implements IMovieRepository {
  async create(m: Pick<Movie, "userId" | "name" | "settings" | "script" | "cast" | "shots" | "quality">) {
    const { data, error } = await db().from("movies")
      .insert({ user_id: m.userId, name: m.name, settings: m.settings, script: m.script, cast: m.cast, shots: m.shots, quality: m.quality })
      .select().single();
    if (error) throw new Error(`Couldn't save the movie: ${error.message}`);
    return fromRow(data);
  }

  async findById(id: string): Promise<Movie | null> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const { data, error } = await db().from("movies").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? fromRow(data) : null;
  }

  async listForUser(userId: string, limit = 20): Promise<Movie[]> {
    const { data, error } = await db().from("movies").select("*").eq("user_id", userId).order("updated_at", { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map(fromRow);
  }

  async update(id: string, changes: Partial<Omit<Movie, "id" | "userId" | "createdAt" | "updatedAt">>): Promise<Movie> {
    const row: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(changes)) if (COLUMNS[k]) row[COLUMNS[k]] = v;
    const { data, error } = await db().from("movies").update(row).eq("id", id).select().single();
    if (error) throw new Error(`Couldn't save the movie: ${error.message}`);
    return fromRow(data);
  }

  async mutate(id: string, change: (m: Movie) => Partial<Omit<Movie, "id" | "userId" | "createdAt" | "updatedAt">>): Promise<Movie> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const { data: cur, error: readErr } = await db().from("movies").select("*").eq("id", id).single();
      if (readErr) throw new Error(readErr.message);
      const row: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(change(fromRow(cur)))) if (COLUMNS[k]) row[COLUMNS[k]] = v;
      // only saves if nobody saved since we read (updated_at is set by a trigger on every save)
      const { data, error } = await db().from("movies").update(row).eq("id", id).eq("updated_at", cur.updated_at).select();
      if (error) throw new Error(`Couldn't save the movie: ${error.message}`);
      if (data?.length) return fromRow(data[0]);
      await new Promise((r) => setTimeout(r, 50 + Math.random() * 150));
    }
    throw new Error("The movie is busy. Please try again.");
  }

  async listMaking(): Promise<Movie[]> {
    const { data, error } = await db().from("movies").select("*").eq("status", "making").limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []).map(fromRow);
  }
}
