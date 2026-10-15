import * as path from "path";
import type { ICreditRepository } from "@/domain/repositories/ICreditRepository";
import type { IFileStore } from "@/domain/repositories/IFileStore";
import type { IMediaRepository } from "@/domain/repositories/IMediaRepository";
import {
  CLIP_CONSENT, CLIP_MODELS, type ModelTier,
  autoModel, BLOCKED_WORDS, estimateMovie, fillLength, fitDuration, MODELS, MOVIE_COST, PHOTO_CONSENT, sanitizeScript, shotCost, STYLES,
  type Character, type Movie, type MovieQuality, type MovieSettings, type Scene, type Shot,
} from "./Movie";
import { BlockedContentError, type IMovieMedia, type IMovieRepository, type IMovieWriter, type OwnScript, type WrittenMovie } from "./ports";

export type MovieResult<T = Movie> = { ok: true; movie: T } | { ok: false; status: number; message: string };

const NOT_ALLOWED = "This kind of content can’t be made. Sexual content and real people aren’t allowed.";
const fail = (status: number, message: string) => ({ ok: false as const, status, message });
const hue = (s: string) => Array.from(s).reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 17);

/**
 * AI movies from idea to finished video. Paid steps hold credits first and charge only
 * when they worked; shots that are blocked or fail are never charged.
 */
export class MovieUseCases {
  constructor(
    private readonly movies: IMovieRepository,
    private readonly credits: ICreditRepository,
    private readonly writer: IMovieWriter,
    private readonly media: IMovieMedia,
    private readonly ffmpeg: IMediaRepository,
    private readonly store: IFileStore,
  ) {}

  /* ── helpers ── */
  private dir(m: Pick<Movie, "userId" | "id">) {
    return `${m.userId}/${m.id}`;
  }
  private local(m: Movie, name: string) {
    return path.join(this.store.workDir(this.dir(m)), name);
  }
  private async owned(userId: string, id: string) {
    const m = await this.movies.findById(id);
    return m && m.userId === userId ? m : null;
  }
  /** Runs a paid step: hold, do it, then charge, or give the credits back if it didn't work. */
  private async paid<T>(userId: string, cost: number, reason: string, name: string, work: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; status: number; message: string }> {
    if (!(await this.credits.hold(userId, cost, reason, name))) return fail(402, `Not enough credits. You need ${cost}.`);
    try {
      const value = await work();
      await this.credits.settle(userId, cost, cost, name);
      return { ok: true, value };
    } catch (e) {
      await this.credits.settle(userId, cost, 0, name).catch(() => {});
      if (e instanceof BlockedContentError || /refused/.test(String(e))) return fail(422, "The content filter stopped this. Change it and try again. No credits were charged.");
      console.error(`[movie] ${reason}`, e);
      return fail(502, "That didn’t work. No credits were charged. Please try again.");
    }
  }
  private async check(text: string) {
    return !BLOCKED_WORDS.test(text) && (await this.writer.allowed(text));
  }
  private toMovie(w: WrittenMovie, quality: MovieQuality, length: number) {
    const cast: Character[] = w.cast.map((c) => ({ ...c, hue: hue(c.name), ver: 1, portrait: null, photo: null, consent: null }));
    const shots: Shot[] = w.shots.map((sh) => {
      const model = autoModel(sh, quality);
      return { ...sh, model, sec: fitDuration(sh.sec, model), state: "planned" };
    });
    return { cast, shots: fillLength(shots, length) };
  }

  /* ── 1. Idea or own script ── */
  async create(userId: string, settings: MovieSettings, own: OwnScript | null): Promise<MovieResult> {
    const acc = await this.credits.getAccount(userId);
    if (!acc) return fail(401, "Please log in again.");
    if (acc.plan === "free") return fail(403, "AI movies come with Creator and Studio.");
    const text = own ? own.text ?? "" : settings.idea;
    if (!own && !text.trim()) return fail(400, "Write your idea first.");
    if (!(await this.check(text))) return fail(422, NOT_ALLOWED);
    const cost = own ? MOVIE_COST.read : MOVIE_COST.script;
    const r = await this.paid(userId, cost, own ? "AI movie · read my script" : "AI movie · write the script", "AI movie", () => (own ? this.writer.read(own, settings) : this.writer.write(settings)));
    if (!r.ok) return r;
    if (!r.value.script.length || !r.value.shots.length) return fail(422, "We couldn’t make a script from this. Change it and try again.");
    const { cast, shots } = this.toMovie(r.value, "balanced", settings.length);
    const movie = await this.movies.create({ userId, name: r.value.name, settings: { ...settings, fromOwn: Boolean(own) }, script: r.value.script, cast, shots, quality: "balanced" });
    return { ok: true, movie };
  }

  /**
   * Quick clip: photos (optional, up to 2) and one sentence become one short video.
   * Creates a one-shot movie and holds its price; the caller starts the workflow.
   */
  async createClip(userId: string, input: { prompt: string; photos: string[]; consent: boolean; sec: number; model: ModelTier; ratio: Movie["settings"]["ratio"]; style: Movie["settings"]["style"] }): Promise<MovieResult> {
    const acc = await this.credits.getAccount(userId);
    if (!acc) return fail(401, "Please log in again.");
    if (acc.plan === "free") return fail(403, "AI movies come with Creator and Studio.");
    const prompt = input.prompt.trim().slice(0, 800);
    if (!prompt) return fail(400, "Say what happens first.");
    if (!(await this.check(prompt))) return fail(422, NOT_ALLOWED);
    const photos = input.photos.slice(0, 2);
    if (photos.length && !input.consent) return fail(400, "Tick the box to confirm you may use these photos.");
    for (const key of photos) if (!key.startsWith(`${userId}/movies/`) || !(await this.store.exists(key))) return fail(404, "Photo not found. Please add it again.");
    const at = new Date().toISOString();
    const cast: Character[] = photos.map((key, i) => ({ id: `p${i + 1}`, name: `Person ${i + 1}`, role: "Lead", desc: "", hue: i ? 330 : 28, ver: 1, portrait: null, photo: key, consent: { at, text: CLIP_CONSENT } }));
    const model = CLIP_MODELS.includes(input.model) ? input.model : "draft";
    const title = prompt.split(/[.,!?]/)[0].slice(0, 60) || "My video";
    const shot: Shot = { id: "clip", scene: "", title, desc: prompt, sec: fitDuration(input.sec, model), kind: "close", cast: cast.map((c) => c.id), say: "", model, state: "planned" };
    const draft = await this.movies.create({
      userId, name: title, quality: "custom", script: [], cast, shots: [shot],
      settings: { genre: "drama", length: shot.sec, ratio: input.ratio, style: input.style, source: "ai", idea: prompt, kind: "clip" },
    });
    const started = await this.start(userId, draft.id);
    if (!started.ok) await this.movies.update(draft.id, { status: "failed", error: started.message });
    return started;
  }

  /* ── 2. Script ── */
  async saveScript(userId: string, id: string, raw: unknown): Promise<MovieResult> {
    const m = await this.owned(userId, id);
    if (!m) return fail(404, "Movie not found.");
    if (m.status !== "draft") return fail(409, "This movie is already made.");
    const script = sanitizeScript(raw);
    if (!(await this.check(script.map((s) => [s.place, s.text, ...s.lines.map((l) => l.text)].join(" ")).join("\n")))) return fail(422, NOT_ALLOWED);
    return { ok: true, movie: await this.movies.update(id, { script, settings: { ...m.settings, shotsStale: true } }) };
  }

  async changeScene(userId: string, id: string, sceneId: string, tones: string[], ask: string): Promise<MovieResult> {
    const m = await this.owned(userId, id);
    if (!m) return fail(404, "Movie not found.");
    const scene = m.script.find((s) => s.id === sceneId);
    if (!scene || m.status !== "draft") return fail(409, "This scene can’t be changed now.");
    if (ask && !(await this.check(ask))) return fail(422, NOT_ALLOWED);
    const r = await this.paid(userId, MOVIE_COST.scene, "AI movie · change a scene", m.name, () => this.writer.rewriteScene(scene, m.script, m.settings, tones, ask));
    if (!r.ok) return r;
    const script = m.script.map((s) => (s.id === sceneId ? r.value : s));
    return { ok: true, movie: await this.movies.update(id, { script, settings: { ...m.settings, shotsStale: true } }) };
  }

  /** A whole new script (characters and shots too), with the chosen changes. Replaces edits. */
  async rewriteAll(userId: string, id: string, tones: string[]): Promise<MovieResult> {
    const m = await this.owned(userId, id);
    if (!m || m.status !== "draft") return fail(404, "Movie not found.");
    const idea = m.settings.idea || m.script.map((s) => `${s.place}: ${s.text} ${s.lines.map((l) => `${l.who}: ${l.text}`).join(" ")}`).join("\n");
    const changes = tones.length ? `\nMake it: ${tones.join(", ")}.` : "";
    const r = await this.paid(userId, MOVIE_COST.script, "AI movie · rewrite the script", m.name, () => this.writer.write({ ...m.settings, idea: idea + changes }));
    if (!r.ok) return r;
    const { cast, shots } = this.toMovie(r.value, m.quality === "custom" ? "balanced" : m.quality, m.settings.length);
    return { ok: true, movie: await this.movies.update(id, { script: r.value.script, cast, shots, settings: { ...m.settings, fromOwn: false, shotsStale: false } }) };
  }

  /** New shots after the script was edited (free). */
  async planShots(userId: string, id: string): Promise<MovieResult> {
    const m = await this.owned(userId, id);
    if (!m) return fail(404, "Movie not found.");
    if (!m.settings.shotsStale || m.status !== "draft") return { ok: true, movie: m };
    try {
      const planned = await this.writer.planShots(m.script, m.cast, m.settings);
      const shots: Shot[] = fillLength(planned.map((sh) => { const model = autoModel(sh, m.quality); return { ...sh, model, sec: fitDuration(sh.sec, model), state: "planned" as const }; }), m.settings.length);
      return { ok: true, movie: await this.movies.update(id, { shots, settings: { ...m.settings, shotsStale: false } }) };
    } catch (e) {
      console.error("[movie] plan shots", e);
      return fail(502, "We couldn’t plan the shots. Please try again.");
    }
  }

  /* ── 3. Characters ── */
  async saveCharacter(userId: string, id: string, charId: string, changes: { name?: string; desc?: string }): Promise<MovieResult> {
    const m = await this.owned(userId, id);
    if (!m || m.status !== "draft") return fail(404, "Movie not found.");
    const cast = m.cast.map((c) => (c.id === charId ? { ...c, name: (changes.name ?? c.name).slice(0, 40) || c.name, desc: (changes.desc ?? c.desc).slice(0, 600) } : c));
    return { ok: true, movie: await this.movies.update(id, { cast }) };
  }

  private portraitPrompt(m: Movie, c: Character) {
    return `${STYLES[m.settings.style]} portrait of ${c.name}, a movie character: ${c.desc}. Head and shoulders, looking at the camera, soft light, plain background. Adult. No text.`;
  }

  async newPortrait(userId: string, id: string, charId: string): Promise<MovieResult> {
    const m = await this.owned(userId, id);
    const c = m?.cast.find((x) => x.id === charId);
    if (!m || !c || m.status !== "draft") return fail(404, "Character not found.");
    const ver = c.portrait ? c.ver + 1 : c.ver;
    const name = `portrait-${c.id}-v${ver}.jpg`;
    const r = await this.paid(userId, MOVIE_COST.portrait, `AI movie · portrait of ${c.name}`, m.name, async () => {
      const local = this.local(m, name);
      await this.media.portrait(this.portraitPrompt(m, c), local);
      await this.store.save(`${this.dir(m)}/${name}`, local);
    });
    if (!r.ok) return r;
    const cast = m.cast.map((x) => (x.id === charId ? { ...x, ver, portrait: `${this.dir(m)}/${name}`, photo: null, consent: null } : x));
    return { ok: true, movie: await this.movies.update(id, { cast }) };
  }

  /** Use the user's own photo (already uploaded to `photoKey`) for a character. */
  async usePhoto(userId: string, id: string, charId: string, photoKey: string, consent: boolean): Promise<MovieResult> {
    const m = await this.owned(userId, id);
    if (!m || m.status !== "draft" || !m.cast.some((c) => c.id === charId)) return fail(404, "Character not found.");
    if (!consent) return fail(400, "Please confirm you may use this photo.");
    if (!photoKey.startsWith(`${userId}/movies/`) || !(await this.store.exists(photoKey))) return fail(404, "Photo not found. Please upload it again.");
    const cast = m.cast.map((c) => (c.id === charId ? { ...c, photo: photoKey, consent: { at: new Date().toISOString(), text: PHOTO_CONSENT } } : c));
    return { ok: true, movie: await this.movies.update(id, { cast }) };
  }

  async useAiFace(userId: string, id: string, charId: string): Promise<MovieResult> {
    const m = await this.owned(userId, id);
    if (!m || m.status !== "draft") return fail(404, "Movie not found.");
    return { ok: true, movie: await this.movies.update(id, { cast: m.cast.map((c) => (c.id === charId ? { ...c, photo: null, consent: null } : c)) }) };
  }

  /* ── 4. Shots and price ── */
  async saveShots(userId: string, id: string, quality: MovieQuality, edits: { id: string; sec?: number; model?: string }[]): Promise<MovieResult> {
    const m = await this.owned(userId, id);
    if (!m || m.status !== "draft") return fail(404, "Movie not found.");
    const byId = new Map(edits.map((e) => [e.id, e]));
    const shots = m.shots.map((sh) => {
      const e = byId.get(sh.id);
      const model = quality !== "custom" ? autoModel(sh, quality) : e?.model && e.model in MODELS ? (e.model as Shot["model"]) : sh.model;
      return { ...sh, model, sec: fitDuration(e?.sec ?? sh.sec, model) };
    });
    return { ok: true, movie: await this.movies.update(id, { quality, shots }) };
  }

  /** Holds the price and marks the movie as being made. The caller starts the workflow. */
  async start(userId: string, id: string): Promise<MovieResult> {
    const m = await this.owned(userId, id);
    if (!m) return fail(404, "Movie not found.");
    if (m.status !== "draft") return fail(409, "This movie is already being made.");
    const acc = await this.credits.getAccount(userId);
    if (acc?.plan === "free") return fail(403, "AI movies come with Creator and Studio.");
    if (m.settings.shotsStale) return fail(409, "The shots need planning first. Open the Shots step again.");
    const est = estimateMovie(m.shots);
    if (!(await this.credits.hold(userId, est.total, `AI movie · ${m.shots.length} shots`, m.name))) return fail(402, `Not enough credits. You need ${est.total}.`);
    const shots = m.shots.map((sh) => ({ ...sh, state: "queued" as const, frame: null, file: null, requestId: null, error: null }));
    return { ok: true, movie: await this.movies.update(id, { status: "making", held: est.total, used: 0, shots, error: null }) };
  }

  /* ── 5. Making (workflow steps; each loads the movie again) ── */
  private async load(id: string) {
    const m = await this.movies.findById(id);
    if (!m) throw new Error(`Movie ${id} not found`);
    return m;
  }
  private setShot(id: string, shotId: string, patch: Partial<Shot>) {
    return this.movies.mutate(id, (m) => ({ shots: m.shots.map((s) => (s.id === shotId ? { ...s, ...patch } : s)) }));
  }

  /** Picture (portrait or photo) for each character in the shot; portraits are made if missing. */
  private async references(m: Movie, sh: Shot) {
    const refs: string[] = [];
    let cast = m.cast;
    for (const cid of sh.cast) {
      const c = cast.find((x) => x.id === cid);
      if (!c) continue;
      let key = c.photo ?? c.portrait ?? null;
      if (!key) {
        const name = `portrait-${c.id}-v${c.ver}.jpg`;
        const local = this.local(m, name);
        await this.media.portrait(this.portraitPrompt(m, c), local);
        key = `${this.dir(m)}/${name}`;
        await this.store.save(key, local);
        cast = cast.map((x) => (x.id === cid ? { ...x, portrait: key } : x));
        const made = key;
        await this.movies.mutate(m.id, (cur) => ({ cast: cur.cast.map((x) => (x.id === cid && !x.portrait && !x.photo ? { ...x, portrait: made } : x)) }));
      }
      refs.push(await this.store.fetch(key));
    }
    return refs;
  }

  private shotPrompt(m: Movie, sh: Shot) {
    if (m.settings.kind === "clip") {
      const who = sh.cast.length ? ` The ${sh.cast.length > 1 ? "people look" : "person looks"} exactly like the reference photo${sh.cast.length > 1 ? "s" : ""}.` : "";
      return `${STYLES[m.settings.style]} short video. ${sh.desc}.${who} Natural movement and sound.`;
    }
    const people = sh.cast.map((cid) => m.cast.find((c) => c.id === cid)).filter(Boolean).map((c) => `${c!.name}: ${c!.desc}`).join(" ");
    return [`${STYLES[m.settings.style]} ${m.settings.genre} movie shot.`, sh.desc, people && `Characters: ${people}`, sh.say && `Dialogue (spoken in English): ${sh.say}`, "Natural sound."].filter(Boolean).join(" ");
  }

  /** a. First frame of the shot. Returns false when the shot was blocked. */
  async makeFrame(id: string, shotId: string): Promise<boolean> {
    const m = await this.load(id);
    const sh = m.shots.find((s) => s.id === shotId)!;
    if (sh.state === "done" || sh.state === "blocked") return sh.state === "done";
    await this.setShot(id, shotId, { state: "frame" });
    try {
      const refs = await this.references(m, sh);
      if (refs.length && this.media.usesReferences(sh.model)) return true; // the model works from the pictures directly
      const name = `frame-${sh.id}-${Date.now()}.jpg`;
      const local = this.local(m, name);
      const keepFaces = refs.length ? " Everyone’s face is clearly visible (not turned away or hidden) and exactly the same as in the reference photos: same face, hair and skin." : "";
      await this.media.frame(`The very first moment of this video: ${this.shotPrompt(m, sh)}${keepFaces} ${m.settings.ratio} frame.`, refs, m.settings.ratio, local);
      await this.store.save(`${this.dir(m)}/${name}`, local);
      await this.setShot(id, shotId, { frame: `${this.dir(m)}/${name}` });
      return true;
    } catch (e) {
      if (e instanceof BlockedContentError) { await this.setShot(id, shotId, { state: "blocked", error: e.message }); return false; }
      throw e;
    }
  }

  /** b. Asks the model for the shot. Returns false when it was blocked. */
  async startShot(id: string, shotId: string): Promise<boolean> {
    const m = await this.load(id);
    const sh = m.shots.find((s) => s.id === shotId)!;
    if (sh.requestId) return true; // already asked (a retry)
    try {
      const refs = this.media.usesReferences(sh.model) ? await this.references(m, sh) : [];
      const frame = sh.frame ? await this.store.fetch(sh.frame) : null;
      if (!frame && !refs.length) throw new Error("The shot has no first frame.");
      const requestId = await this.media.startShot(sh.model, this.shotPrompt(m, sh), frame, sh.sec, m.settings.ratio, refs);
      await this.setShot(id, shotId, { state: "making", requestId });
      return true;
    } catch (e) {
      if (e instanceof BlockedContentError) { await this.setShot(id, shotId, { state: "blocked", error: e.message }); return false; }
      throw e;
    }
  }

  /** c. Is the shot ready? "running" means check again later. */
  async checkShot(id: string, shotId: string): Promise<"running" | "done" | "blocked" | "failed"> {
    const m = await this.load(id);
    const sh = m.shots.find((s) => s.id === shotId)!;
    if (sh.state === "done" || sh.state === "blocked" || sh.state === "failed") return sh.state;
    const name = `shot-${sh.id}-${Date.now()}.mp4`;
    const r = await this.media.checkShot(sh.model, sh.requestId!, this.local(m, name));
    if (r.state === "running") return "running";
    if (r.state === "done") {
      await this.store.save(`${this.dir(m)}/${name}`, r.file);
      await this.setShot(id, shotId, { state: "done", file: `${this.dir(m)}/${name}`, requestId: null });
      return "done";
    }
    await this.setShot(id, shotId, { state: r.state, error: r.reason, requestId: null });
    return r.state;
  }

  /** The model took too long: the shot counts as failed (not charged). */
  async shotTimedOut(id: string, shotId: string) {
    await this.setShot(id, shotId, { state: "failed", error: "The model took too long.", requestId: null });
  }

  /** d. All finished shots in order, as one video (also usable for Translate and Auto-split). */
  async join(id: string) {
    const m = await this.load(id);
    const done = m.shots.filter((s) => s.state === "done" && s.file);
    if (!done.length) return false;
    const clips = await Promise.all(done.map((s) => this.store.fetch(s.file!)));
    const local = this.local(m, "original.mp4");
    await this.ffmpeg.joinClips(clips, local, m.settings.ratio === "9:16" ? { w: 720, h: 1280 } : { w: 1280, h: 720 });
    const key = `${this.dir(m)}/original.mp4`;
    await this.store.save(key, local);
    const info = await this.ffmpeg.probe(local);
    // register it like an upload, so "Dub into Khmer" and "Split into parts" can use it
    await this.store.saveText(`${this.dir(m)}/upload.json`, JSON.stringify({ name: `${m.name}.mp4`, size: 0, ext: ".mp4", ...info }));
    await this.movies.mutate(id, (cur) => ({ files: { ...cur.files, video: key } }));
    return true;
  }

  /** e. Charge what was made; blocked and failed shots and the unused buffer come back. */
  async finish(id: string) {
    const m = await this.load(id);
    if (m.status !== "making") return;
    const used = Math.min(m.held, m.shots.filter((s) => s.state === "done").reduce((a, s) => a + shotCost(s), 0));
    await this.credits.settle(m.userId, m.held, used, m.name);
    await this.movies.update(id, { status: m.files.video ? "done" : "failed", used, error: m.files.video ? null : "No shot could be made. All held credits were returned." });
  }

  async failMovie(id: string, message: string) {
    const m = await this.movies.findById(id);
    if (!m || m.status !== "making") return;
    await this.credits.settle(m.userId, m.held, 0, m.name);
    await this.movies.mutate(id, (cur) => ({
      status: "failed", error: message,
      shots: cur.shots.map((s) => (s.state === "done" || s.state === "blocked" || s.state === "failed" ? s : { ...s, state: "failed" as const, requestId: null })),
    }));
  }

  /**
   * A failed movie or clip, ready to make again with the same script, characters, photos
   * and shots (nothing is written again). A clip starts right away; a movie goes back to
   * its Shots step. Credits are held again only when it starts.
   */
  async retry(userId: string, id: string): Promise<MovieResult> {
    const m = await this.owned(userId, id);
    if (!m) return fail(404, "Movie not found.");
    if (m.status !== "failed") return fail(409, "This movie didn’t fail.");
    const shots = m.shots.map((s) => ({ ...s, state: "planned" as const, frame: null, file: null, requestId: null, error: null }));
    await this.movies.update(id, { status: "draft", held: 0, used: 0, error: null, shots, files: {} });
    if (m.settings.kind !== "clip") return { ok: true, movie: (await this.movies.findById(id))! };
    const started = await this.start(userId, id);
    if (!started.ok) await this.movies.update(id, { status: "failed", error: started.message });
    return started;
  }

  /* ── Result: make one shot again ── */
  async startRemake(userId: string, id: string, shotId: string, desc: string): Promise<MovieResult> {
    const m = await this.owned(userId, id);
    const sh = m?.shots.find((s) => s.id === shotId);
    if (!m || !sh) return fail(404, "Shot not found.");
    if (m.status !== "done" || m.shots.some((s) => s.state === "queued" || s.state === "frame" || s.state === "making")) return fail(409, "Wait until the movie is finished.");
    const text = desc.trim().slice(0, 600) || sh.desc;
    if (!(await this.check(text))) return fail(422, NOT_ALLOWED);
    const cost = shotCost(sh);
    if (!(await this.credits.hold(userId, cost, `AI movie · remake shot`, m.name))) return fail(402, `Not enough credits. You need ${cost}.`);
    const shots = m.shots.map((s) => (s.id === shotId ? { ...s, desc: text, state: "queued" as const, frame: null, requestId: null, error: null } : s));
    return { ok: true, movie: await this.movies.update(id, { shots }) };
  }

  /** After a remake: join again and charge only if the shot was made. */
  async finishRemake(id: string, shotId: string) {
    const m = await this.load(id);
    const sh = m.shots.find((s) => s.id === shotId)!;
    const cost = shotCost(sh);
    const made = sh.state === "done";
    if (made) await this.join(id);
    else if (sh.file) await this.setShot(id, shotId, { state: "done", error: "The new version couldn’t be made, so the old shot stays. Your credits came back." });
    await this.credits.settle(m.userId, cost, made ? cost : 0, m.name);
    const fresh = await this.load(id);
    await this.movies.update(id, { used: fresh.used + (made ? cost : 0) });
  }
}
