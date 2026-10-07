"use client";

import { useRouter } from "next/navigation";
import { FolderOpen, Upload } from "lucide-react";
import { UploadDrop } from "./UploadDrop";

export function NewUpload({ maxMin, planName }: { maxMin: number; planName: string }) {
  const router = useRouter();
  return (
    <section>
      <div className="page-head"><div><h1 className="t-h2">Translate video</h1><p className="sub">Every speaker keeps their voice and timing. You’ll see the price before anything starts.</p></div></div>
      <UploadDrop className="drop drop-xl" onUploaded={(v) => router.push(`/app/new?upload=${v.uploadId}`)}>
        <span className="ic-box" style={{ width: 52, height: 52, margin: 0 }}><Upload style={{ width: 22, height: 22 }} /></span>
        <div className="t-h3">Drop your video here</div>
        <div className="t-small muted">MP4, MOV or WEBM · up to 2 GB · up to {maxMin} min on {planName}</div>
        <span className="btn primary lg"><FolderOpen />Choose video</span>
      </UploadDrop>
    </section>
  );
}
