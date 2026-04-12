import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { buildContainer } from "@/lib/container";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const container = buildContainer();
    const job = await container.getJob.execute(params.id);

    if (!job.translatedVideoPath || !fs.existsSync(job.translatedVideoPath)) {
      return NextResponse.json({ error: "Video not ready yet" }, { status: 404 });
    }

    const stat = fs.statSync(job.translatedVideoPath);
    const fileStream = fs.createReadStream(job.translatedVideoPath);
    const ext = path.extname(job.translatedVideoPath).slice(1) || "mp4";

    return new NextResponse(fileStream as unknown as ReadableStream, {
      headers: {
        "Content-Type": `video/${ext}`,
        "Content-Length": stat.size.toString(),
        "Content-Disposition": `attachment; filename="translated_${params.id}.${ext}"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
