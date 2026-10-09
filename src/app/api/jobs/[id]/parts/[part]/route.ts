import { Zip, ZipPassThrough } from "fflate";
import { NextResponse, type NextRequest } from "next/server";
import { buildContainer } from "@/lib/container";
import { streamFile } from "@/lib/serveFile";
import { requireUser } from "@/lib/session";

export const maxDuration = 300;

const safe = (s: string) => s.replace(/[^\w.\- ]+/g, "_");

/**
 * Parts of a split video: /parts/3 plays or (with ?download=1) saves part 3;
 * /parts/zip saves every part in one .zip (streamed, never held in memory).
 */
export async function GET(req: NextRequest, { params }: { params: { id: string; part: string } }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const c = buildContainer();
  const job = await c.jobs.findById(params.id).catch(() => null);
  if (!job || job.userId !== auth.user.id || !job.split) return NextResponse.json({ error: "Video not found." }, { status: 404 });
  const parts = job.split.parts;
  const base = safe(job.name.replace(/\.[^.]+$/, ""));
  const fileName = (i: number) => `${base}-part-${String(i + 1).padStart(2, "0")}.mp4`;

  if (params.part !== "zip") {
    const i = Number(params.part) - 1;
    const key = parts[i]?.file;
    if (!Number.isInteger(i) || !key) return NextResponse.json({ error: "Not ready yet." }, { status: 404 });
    return streamFile(key, req.headers.get("range"), { cache: "private, no-store", downloadName: req.nextUrl.searchParams.has("download") ? fileName(i) : undefined });
  }

  if (!parts.length || parts.some((p) => !p.file)) return NextResponse.json({ error: "Not ready yet." }, { status: 404 });
  const store = c.store;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (err) { controller.error(err); return; }
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      try {
        for (let i = 0; i < parts.length; i++) {
          const s = await store.stream(parts[i].file!, null);
          if (!s) throw new Error(`Missing part ${i + 1}`);
          const entry = new ZipPassThrough(fileName(i)); // videos don't compress: store them as they are
          zip.add(entry);
          const reader = s.body.getReader();
          for (;;) {
            const { done, value } = await reader.read();
            if (done || cancelled) break;
            entry.push(value);
            // wait while the browser is slower than storage, instead of buffering the whole zip
            while (!cancelled && (controller.desiredSize ?? 1) <= 0) await new Promise((r) => setTimeout(r, 25));
          }
          if (cancelled) { await reader.cancel().catch(() => {}); return; }
          entry.push(new Uint8Array(0), true);
        }
        zip.end();
      } catch (e) {
        if (!cancelled) controller.error(e);
      }
    },
    cancel() {
      cancelled = true; // the browser stopped the download
    },
  }, new CountQueuingStrategy({ highWaterMark: 32 }));
  return new NextResponse(body, {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${base}-parts.zip"`, "Cache-Control": "private, no-store" },
  });
}
