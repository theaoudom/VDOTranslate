import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/session";
import { usesBlob } from "@/lib/uploads";

const VIDEO = /^([0-9a-f-]{36})\/([0-9a-f-]{36})\/original\.(mp4|mov|webm|mkv|m4v|avi)$/i;
const ASSET = /^([0-9a-f-]{36})\/assets\/([0-9a-f-]{36})\.(png|jpe?g|webp|mp4|mov|webm|m4v)$/i;
const MOVIE = /^([0-9a-f-]{36})\/movies\/([0-9a-f-]{36})\.(png|jpe?g|webp|pdf|docx|txt)$/i;
const MB = 1024 * 1024;
// Processing copies the video to the function's temp disk (512 MB there), so keep room for the output.
const MAX_VIDEO_BYTES = 400 * MB;

/** Where the browser should send files: straight to storage, or through /api/uploads. */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  return NextResponse.json({ direct: usesBlob, userId: auth.user.id });
}

/** Gives the browser a short-lived token to upload one file into the signed-in user's own folder. */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  if (!usesBlob) return NextResponse.json({ error: "Not available." }, { status: 404 });
  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        const video = VIDEO.exec(pathname);
        const asset = ASSET.exec(pathname);
        const movie = MOVIE.exec(pathname);
        const owner = video?.[1] ?? asset?.[1] ?? movie?.[1];
        if (!owner || owner !== auth.user.id) throw new Error("Not allowed");
        const image = asset && /png|jpe?g|webp/i.test(asset[3]);
        if (movie) return { allowedContentTypes: ["image/*", "application/pdf", "text/plain", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/octet-stream"], maximumSizeInBytes: 20 * MB, addRandomSuffix: false, allowOverwrite: false };
        return {
          allowedContentTypes: image ? ["image/*"] : ["video/*", "application/octet-stream"],
          maximumSizeInBytes: video ? MAX_VIDEO_BYTES : image ? 10 * MB : 200 * MB,
          addRandomSuffix: false,
          allowOverwrite: false,
        };
      },
    });
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 400 });
  }
}
