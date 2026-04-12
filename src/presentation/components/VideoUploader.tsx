"use client";
import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { UploadCloud, Film, X, CheckCircle2 } from "lucide-react";
import clsx from "clsx";

interface VideoUploaderProps {
  onFileSelected: (file: File) => void;
  selectedFile: File | null;
  onClear: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function VideoUploader({ onFileSelected, selectedFile, onClear }: VideoUploaderProps) {
  const [preview, setPreview] = useState<string | null>(null);

  const onDrop = useCallback(
    (accepted: File[]) => {
      const file = accepted[0];
      if (!file) return;
      onFileSelected(file);
      setPreview(URL.createObjectURL(file));
    },
    [onFileSelected],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "video/*": [".mp4", ".mov", ".avi", ".mkv", ".webm"] },
    maxFiles: 1,
    disabled: !!selectedFile,
  });

  const handleClear = () => {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    onClear();
  };

  return (
    <div className="w-full">
      <AnimatePresence mode="wait">
        {!selectedFile ? (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            {...getRootProps()}
            className={clsx(
              "relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-12 cursor-pointer transition-all duration-300",
              isDragActive
                ? "border-brand-400 bg-brand-400/10 shadow-glow-sm"
                : "border-surface-300 bg-surface-50 hover:border-brand-400 hover:bg-brand-400/5",
            )}
          >
            <input {...getInputProps()} id="video-upload-input" />
            <motion.div
              animate={isDragActive ? { scale: 1.1 } : { scale: 1 }}
              className="flex h-20 w-20 items-center justify-center rounded-full bg-card-gradient border border-surface-300 shadow-glow-sm"
            >
              <UploadCloud className="h-9 w-9 text-brand-400" />
            </motion.div>
            <div className="text-center">
              <p className="text-lg font-semibold text-white">
                {isDragActive ? "Drop your video here" : "Upload your video"}
              </p>
              <p className="mt-1 text-sm text-gray-400">
                Drag & drop or <span className="text-brand-400 font-medium">browse files</span>
              </p>
              <p className="mt-2 text-xs text-gray-500">MP4, MOV, AVI, MKV, WEBM · Max 500 MB</p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="preview"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="relative rounded-2xl border border-surface-200 bg-surface-50 overflow-hidden"
          >
            {preview && (
              <video
                src={preview}
                className="w-full max-h-72 object-contain bg-black"
                controls
                muted
              />
            )}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/20">
                <Film className="h-5 w-5 text-brand-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-white">{selectedFile.name}</p>
                <p className="text-xs text-gray-400">{formatBytes(selectedFile.size)}</p>
              </div>
              <CheckCircle2 className="h-5 w-5 text-green-400 shrink-0" />
              <button
                onClick={handleClear}
                id="clear-video-btn"
                className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                title="Remove video"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
