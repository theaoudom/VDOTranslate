import "server-only";
import fs from "fs";
import path from "path";
import { GENRES, STYLES, TIMES, type Character, type MovieSettings, type Scene, type Shot, type ShotKind } from "@/domain/movie/Movie";
import type { IMovieWriter, OwnScript, WrittenMovie } from "@/domain/movie/ports";

/*
 * Writes and reads scripts with OpenAI. Answers are JSON that matches a schema, so the
 * app never has to guess. Content rules are part of every request.
 */
const API = "https://api.openai.com/v1";
const KEY = () => process.env.OPENAI_API_KEY ?? "";
const WRITER = "gpt-4o-mini";
const READER = "gpt-4o"; // reads photos of paper and PDFs

const RULES = `Content rules (always follow them):
- No sexual content, nudity or sexual acts. Romance may include dates, hugs and kisses only.
- No gore or graphic injuries. Action and fights are fine without blood detail.
- No real or famous people, brands' logos or copyrighted characters.
- Everyone in the story is an adult.
All dialogue is in English.`;

const KINDS: ShotKind[] = ["wide", "detail", "close", "action"];

const SCHEMA = {
  name: "movie",
  strict: true,
  schema: {
    type: "object", additionalProperties: false, required: ["name", "scenes", "characters", "shots"],
    properties: {
      name: { type: "string", description: "Short catchy title, max 40 characters" },
      scenes: { type: "array", items: { type: "object", additionalProperties: false, required: ["place", "time", "text", "lines"], properties: {
        place: { type: "string" }, time: { type: "string", enum: TIMES }, text: { type: "string", description: "What happens, 1-3 short sentences" },
        lines: { type: "array", items: { type: "object", additionalProperties: false, required: ["who", "text"], properties: { who: { type: "string" }, text: { type: "string" } } } },
      } } },
      characters: { type: "array", items: { type: "object", additionalProperties: false, required: ["name", "role", "desc"], properties: {
        name: { type: "string" }, role: { type: "string", enum: ["Lead", "Villain", "Ally", "Support"] },
        desc: { type: "string", description: "Age, looks, clothes and personality in one or two sentences, for a picture" },
      } } },
      shots: { type: "array", items: { type: "object", additionalProperties: false, required: ["scene", "title", "desc", "sec", "kind", "cast", "say"], properties: {
        scene: { type: "integer", description: "1-based scene number" }, title: { type: "string", description: "3-5 words" },
        desc: { type: "string", description: "What the camera sees: framing, action, light. One sentence." },
        sec: { type: "integer", enum: [4, 5, 6, 7, 8, 10] }, kind: { type: "string", enum: KINDS },
        cast: { type: "array", items: { type: "string" }, description: "names of characters in the shot" },
        say: { type: "string", description: "The one line spoken in this shot as 'Name: line', or empty" },
      } } },
    },
  },
};

const SCENE_SCHEMA = {
  name: "scene",
  strict: true,
  schema: {
    type: "object", additionalProperties: false, required: ["place", "time", "text", "lines"],
    properties: (SCHEMA.schema.properties.scenes.items as { properties: object }).properties,
  },
};

const SHOTS_SCHEMA = {
  name: "shots",
  strict: true,
  schema: { type: "object", additionalProperties: false, required: ["shots"], properties: { shots: SCHEMA.schema.properties.shots } },
};

type Raw = { name: string; scenes: Omit<Scene, "id">[]; characters: { name: string; role: string; desc: string }[]; shots: { scene: number; title: string; desc: string; sec: number; kind: ShotKind; cast: string[]; say: string }[] };

async function chat<T>(model: string, messages: unknown[], schema: object): Promise<T> {
  const res = await fetch(`${API}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, response_format: { type: "json_schema", json_schema: schema }, temperature: 0.8 }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenAI failed (${res.status}): ${json?.error?.message ?? ""}`);
  const msg = json.choices?.[0]?.message;
  if (msg?.refusal) throw new Error(`refused: ${msg.refusal}`);
  return JSON.parse(msg?.content ?? "{}") as T;
}

function brief(s: MovieSettings) {
  return `Kind: ${GENRES[s.genre].name}. Look: ${STYLES[s.style]}. Frame: ${s.ratio}. Length: about ${s.length} seconds in total.`;
}

/** Turns the model's answer into the app's movie: ids, links between shots, scenes and characters. */
function toWritten(r: Raw, length: number): WrittenMovie {
  const script: Scene[] = (r.scenes ?? []).map((sc, i) => ({ id: `s${i + 1}`, place: sc.place, time: TIMES.includes(sc.time) ? sc.time : "Day", text: sc.text, lines: sc.lines ?? [] }));
  const cast: Omit<Character, "hue" | "ver">[] = (r.characters ?? []).slice(0, 6).map((c, i) => ({ id: `c${i + 1}`, name: c.name, role: c.role, desc: c.desc }));
  const idOf = (name: string) => cast.find((c) => c.name.toLowerCase() === name.trim().toLowerCase())?.id;
  let shots = (r.shots ?? []).map((sh, i) => ({
    id: `h${i + 1}`, scene: script[Math.max(0, Math.min(script.length - 1, sh.scene - 1))]?.id ?? "s1", title: sh.title, desc: sh.desc,
    sec: sh.sec, kind: KINDS.includes(sh.kind) ? sh.kind : "wide",
    cast: Array.from(new Set(sh.cast.map(idOf).filter((x): x is string => Boolean(x)))), say: sh.say || "",
  }));
  // keep within the chosen length (+15%)
  let total = 0;
  shots = shots.filter((sh) => (total += sh.sec) <= length * 1.15 || total === sh.sec);
  return { name: (r.name || "Untitled movie").slice(0, 60), script, cast, shots };
}

export class OpenAIMovieWriter implements IMovieWriter {
  async allowed(text: string) {
    if (!text.trim()) return true;
    const res = await fetch(`${API}/moderations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "omni-moderation-latest", input: text.slice(0, 8000) }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Moderation failed (${res.status})`);
    const r = json.results?.[0];
    if (!r) return true;
    const c = r.categories ?? {};
    // fights and danger are part of action movies; sexual content and minors never are
    return !(c.sexual || c["sexual/minors"] || c["self-harm/instructions"] || c["violence/graphic"] || c.harassment_threatening || c["hate/threatening"]);
  }

  async write(s: MovieSettings): Promise<WrittenMovie> {
    const raw = await chat<Raw>(WRITER, [
      { role: "system", content: `You write short vertical-video movies for social media (TikTok, Reels). Tight scenes, clear action, short punchy lines. Plan shots of 4-10 seconds that together last about the chosen length; 1-3 shots per scene. ${RULES}` },
      { role: "user", content: `${brief(s)}\nIdea: ${s.idea}` },
    ], SCHEMA);
    return toWritten(raw, s.length);
  }

  async read(own: OwnScript, s: MovieSettings): Promise<WrittenMovie> {
    const parts: unknown[] = [{ type: "text", text: `${brief(s)}\nHere is my script. Do NOT rewrite it: keep every line word for word. Only split it into scenes and spoken lines, list the characters, and plan shots. If a line isn't in English, translate it to English.` }];
    if (own.text) parts.push({ type: "text", text: own.text.slice(0, 20000) });
    if (own.pdf) parts.push({ type: "file", file: { filename: path.basename(own.pdf), file_data: `data:application/pdf;base64,${fs.readFileSync(own.pdf).toString("base64")}` } });
    for (const img of own.images ?? []) {
      const ext = path.extname(img).slice(1).toLowerCase().replace("jpg", "jpeg") || "jpeg";
      parts.push({ type: "image_url", image_url: { url: `data:image/${ext};base64,${fs.readFileSync(img).toString("base64")}`, detail: "high" } });
    }
    const raw = await chat<Raw>(READER, [
      { role: "system", content: `You turn a user's own movie script (typed, a document, or photos of handwritten or printed pages) into structured scenes and shots. Keep their words exactly. ${RULES}` },
      { role: "user", content: parts },
    ], SCHEMA);
    return toWritten(raw, s.length);
  }

  async rewriteScene(scene: Scene, script: Scene[], s: MovieSettings, tones: string[], ask: string): Promise<Scene> {
    const raw = await chat<Omit<Scene, "id">>(WRITER, [
      { role: "system", content: `You edit one scene of a short movie script. Keep the same characters and place unless asked. ${RULES}` },
      { role: "user", content: `${brief(s)}\nWhole script for context:\n${JSON.stringify(script.map(({ id: _id, ...x }) => x))}\n\nRewrite only this scene:\n${JSON.stringify({ place: scene.place, time: scene.time, text: scene.text, lines: scene.lines })}\nChanges wanted: ${[...tones, ask].filter(Boolean).join("; ")}` },
    ], SCENE_SCHEMA);
    return { id: scene.id, place: raw.place, time: TIMES.includes(raw.time) ? raw.time : scene.time, text: raw.text, lines: raw.lines ?? [] };
  }

  async planShots(script: Scene[], cast: Character[], s: MovieSettings): Promise<Omit<Shot, "model" | "state">[]> {
    const raw = await chat<{ shots: Raw["shots"] }>(WRITER, [
      { role: "system", content: `You plan camera shots for a short movie. 1-3 shots per scene, 4-10 seconds each, about the chosen length in total. ${RULES}` },
      { role: "user", content: `${brief(s)}\nCharacters: ${cast.map((c) => c.name).join(", ")}\nScript:\n${JSON.stringify(script.map(({ id: _id, ...x }) => x))}` },
    ], SHOTS_SCHEMA);
    const written = toWritten({ name: "", scenes: script, characters: cast, shots: raw.shots }, s.length);
    // keep the real character ids
    return written.shots.map((sh) => ({ ...sh, cast: sh.cast.map((cid) => cast[Number(cid.slice(1)) - 1]?.id).filter((x): x is string => Boolean(x)) }));
  }
}
