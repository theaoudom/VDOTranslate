"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { VideoUploader } from "@/presentation/components/VideoUploader";
import { LanguageSelector } from "@/presentation/components/LanguageSelector";
import { Sparkles, ArrowRight } from "lucide-react";
import clsx from "clsx";

export default function Home() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [targetLanguage, setTargetLanguage] = useState("");
  const [blurSubtitles, setBlurSubtitles] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    if (!file || !targetLanguage) return;

    try {
      setIsUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append("video", file);
      formData.append("targetLanguage", targetLanguage);
      formData.append("blurSubtitles", blurSubtitles.toString());

      const res = await fetch("/api/jobs", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to upload video");
      }

      const { jobId } = await res.json();
      router.push(`/processing/${jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsUploading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel p-8 sm:p-10 rounded-3xl"
    >
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center p-3 bg-brand-500/20 rounded-2xl mb-4 border border-brand-500/30">
          <Sparkles className="w-8 h-8 text-brand-400" />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3 tracking-tight">
          AI Video <span className="text-brand-400 bg-clip-text">Translator</span>
        </h1>
        <p className="text-gray-400">
          Upload any video. We'll auto-detect the language and translate the speech seamlessly.
        </p>
      </div>

      <div className="space-y-8">
        <VideoUploader
          selectedFile={file}
          onFileSelected={setFile}
          onClear={() => setFile(null)}
        />

        <motion.div 
          initial={false}
          animate={{ opacity: file ? 1 : 0.5, y: 0 }}
          className={clsx("transition-all duration-300", !file && "pointer-events-none")}
        >
          <LanguageSelector
            value={targetLanguage}
            onChange={setTargetLanguage}
          />

          <label className="flex items-center gap-3 mt-4 cursor-pointer group">
            <div className="relative flex items-center justify-center">
              <input 
                type="checkbox"
                checked={blurSubtitles}
                onChange={(e) => setBlurSubtitles(e.target.checked)}
                className="w-5 h-5 appearance-none border-2 border-brand-500/50 rounded-md bg-surface-200 checked:bg-brand-500 checked:border-brand-500 transition-all peer"
              />
              <svg className="absolute w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" viewBox="0 0 14 10" fill="none">
                <path d="M1 5L5 9L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="text-sm font-medium text-gray-300 group-hover:text-white transition-colors">
              Blur Original Subtitles (Removes burned-in text)
            </span>
          </label>
        </motion.div>

        {error && (
          <div className="p-4 bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={handleStart}
          disabled={!file || !targetLanguage || isUploading}
          className="w-full relative group overflow-hidden rounded-xl bg-brand-600 disabled:bg-surface-300 px-6 py-4 font-semibold text-white transition-all hover:bg-brand-500 disabled:text-gray-500 disabled:cursor-not-allowed border border-brand-500/50 disabled:border-transparent flex items-center justify-center gap-2"
        >
          {isUploading ? (
            <span className="flex items-center gap-2">
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Uploading & Starting...
            </span>
          ) : (
            <>
              Start Translation
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </>
          )}
          {/* Shine effect */}
          {!isUploading && file && targetLanguage && (
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-shimmer" />
          )}
        </button>
      </div>
    </motion.div>
  );
}
