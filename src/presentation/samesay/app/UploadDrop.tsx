"use client";

import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { useToast } from "../Toast";

export interface UploadedVideo {
  uploadId: string;
  name: string;
  size: number;
  durationSec: number;
}

/** Sends the file to /api/uploads with real progress. */
function upload(file: File, onProgress: (p: number) => void): Promise<UploadedVideo> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append("video", file);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: { error?: string } & Partial<UploadedVideo> = {};
      try { body = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as UploadedVideo);
      else reject(new Error(body.error ?? "Upload failed. Please try again."));
    };
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    xhr.open("POST", "/api/uploads");
    xhr.send(form);
  });
}

/**
 * The drop zone from the prototype. While a file uploads, the same box shows its progress.
 * `children` is the idle content (icon, title, hint, button).
 */
export function UploadDrop({ className, onUploaded, children }: { className: string; onUploaded: (v: UploadedVideo) => void; children: ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [name, setName] = useState("");
  const toast = useToast();

  async function start(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("video/") && !/\.(mp4|mov|webm|mkv|m4v|avi)$/i.test(file.name)) {
      toast("Please choose a video file", true);
      return;
    }
    setName(file.name);
    setProgress(0);
    try {
      const v = await upload(file, setProgress);
      setProgress(1);
      onUploaded(v);
    } catch (e) {
      setProgress(null);
      toast(e instanceof Error ? e.message : "Upload failed", true);
    }
  }

  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); start(e.dataTransfer.files[0]); };
  const busy = progress !== null;

  return (
    <label
      className={className + (over ? " over" : "")}
      tabIndex={0}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      onKeyDown={(e) => { if (!busy && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); input.current?.click(); } }}
      aria-busy={busy}
    >
      <input ref={input} type="file" accept="video/*" hidden disabled={busy} onChange={(e) => { start(e.target.files?.[0]); e.target.value = ""; }} />
      {busy ? (
        <>
          <div className="t-h4">{progress! < 1 ? "Uploading…" : "Reading the video…"}</div>
          <div className="t-small muted">{name}</div>
          <div className="progress" style={{ width: "min(320px, 80%)" }}><span style={{ width: Math.round(progress! * 100) + "%" }} /></div>
          <div className="faint t-xs num">{Math.round(progress! * 100)}%</div>
        </>
      ) : children}
    </label>
  );
}
