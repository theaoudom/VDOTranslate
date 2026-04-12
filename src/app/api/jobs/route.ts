import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { buildContainer, getUploadsDir } from "@/lib/container";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    
    const targetLanguage = formData.get("targetLanguage") as string | null;
    if (!targetLanguage) {
      return NextResponse.json({ error: "targetLanguage is required" }, { status: 400 });
    }

    const videoFile = formData.get("video") as File | null;
    if (!videoFile || typeof videoFile === "string") {
      return NextResponse.json({ error: "video file is required" }, { status: 400 });
    }

    const container = buildContainer();
    const uploadsDir = getUploadsDir();

    // Create job first with a placeholder path so we can get the generated UUID
    const job = await container.createJob.execute("", targetLanguage);

    // Save directly to the final destination path to avoid Windows EBUSY locking during rename
    const finalVideoPath = path.join(uploadsDir, `${job.id}_original${path.extname(videoFile.name)}`);
    const arrayBuffer = await videoFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(finalVideoPath, buffer);

    // Update the job with the real path
    await container.processJob["jobRepository"].update(job.id, { originalVideoPath: finalVideoPath });

    // Fire & forget — process in background
    container.processJob.execute(job.id, uploadsDir).catch((err) => {
      console.error(`[ProcessJob] Job ${job.id} failed:`, err);
    });

    return NextResponse.json({ jobId: job.id }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/jobs]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
