"use client";

import { upload } from "@vercel/blob/client";

type Target = { direct: boolean; userId: string };
let target: Promise<Target> | null = null;
/** Whether files go straight from the browser to storage (on Vercel) or through our server. */
const uploadTarget = () =>
  (target ??= fetch("/api/uploads/blob").then((r) => r.json() as Promise<Target>).catch(() => {
    target = null;
    return { direct: false, userId: "" };
  }));

const ENDPOINT = { video: "/api/uploads", asset: "/api/templates/assets" } as const;
const FIELD = { video: "video", asset: "file" } as const;

/**
 * Uploads a video (to translate) or an image / clip (for a template) with real progress,
 * then lets the server read it. Resolves with the server's JSON answer.
 */
export async function sendFile<T>(kind: "video" | "asset", file: File, onProgress: (p: number) => void = () => {}): Promise<T> {
  const t = await uploadTarget();
  if (!t.direct) return viaServer<T>(kind, file, onProgress);

  const ext = /\.[^.]+$/.exec(file.name)?.[0].toLowerCase() ?? "";
  const id = crypto.randomUUID();
  const pathname = kind === "video" ? `${t.userId}/${id}/original${ext}` : `${t.userId}/assets/${id}${ext}`;
  try {
    await upload(pathname, file, {
      access: "private",
      handleUploadUrl: "/api/uploads/blob",
      contentType: file.type || undefined,
      multipart: file.size > 20 * 1024 * 1024,
      onUploadProgress: (e) => onProgress(e.percentage / 100),
    });
  } catch (e) {
    throw new Error(e instanceof Error && /size|type/i.test(e.message) ? "That file is too large or not a supported type." : "Upload failed. Check your connection and try again.");
  }
  const res = await fetch(ENDPOINT[kind], {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, name: file.name, size: file.size, ext }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Upload failed. Please try again.");
  return body as T;
}

function viaServer<T>(kind: "video" | "asset", file: File, onProgress: (p: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append(FIELD[kind], file);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: { error?: string } = {};
      try { body = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else reject(new Error(body.error ?? "Upload failed. Please try again."));
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    xhr.open("POST", ENDPOINT[kind]);
    xhr.send(form);
  });
}
