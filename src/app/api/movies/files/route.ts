import fs from "fs";
import os from "os";
import path from "path";
import { NextResponse, type NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { requireUser } from "@/lib/session";
import { fileStore } from "@/lib/uploads";

const ALLOWED = [".png", ".jpg", ".jpeg", ".webp", ".pdf", ".docx", ".txt"];
const MAX_MB = 20;

/**
 * A file for an AI movie: a photo for a character, or a script (text, PDF, Word, or a photo
 * of a paper page). Either the file itself (multipart) or `{ id, name, ext }` for a file the
 * browser already put in storage. Returns its storage key.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const store = fileStore();
  let id: string, name: string, ext: string;
  if (req.headers.get("content-type")?.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    id = String(body?.id ?? "");
    name = String(body?.name ?? "file").slice(0, 200);
    ext = String(body?.ext ?? "").toLowerCase();
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Upload not found." }, { status: 404 });
  } else {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file." }, { status: 400 });
    if (file.size > MAX_MB * 1024 * 1024) return NextResponse.json({ error: `That file is larger than ${MAX_MB} MB.` }, { status: 413 });
    id = uuidv4();
    name = file.name;
    ext = path.extname(file.name).toLowerCase();
    if (ALLOWED.includes(ext)) {
      const tmp = path.join(os.tmpdir(), `samesay-movie-${id}${ext}`);
      fs.writeFileSync(tmp, Buffer.from(await file.arrayBuffer()));
      await store.save(`${auth.user.id}/movies/${id}${ext}`, tmp);
      fs.rmSync(tmp, { force: true });
    }
  }
  if (!ALLOWED.includes(ext)) return NextResponse.json({ error: "Use a photo (JPG, PNG), a PDF, a Word file or a text file." }, { status: 400 });
  const key = `${auth.user.id}/movies/${id}${ext}`;
  if (!(await store.exists(key))) return NextResponse.json({ error: "Upload not found. Please try again." }, { status: 404 });
  return NextResponse.json({ key, name }, { status: 201 });
}
