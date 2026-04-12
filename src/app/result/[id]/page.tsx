"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Download, PlayCircle, ArrowLeft, CheckCircle2 } from "lucide-react";
import { useTranslationJob } from "@/presentation/hooks/useTranslationJob";
import { SUPPORTED_LANGUAGES } from "@/domain/entities/Language";

export default function ResultPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { job, isLoading } = useTranslationJob(params.id);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (job?.status === "completed") {
      setVideoUrl(`/api/jobs/${job.id}/video`);
    } else if (job?.status === "failed") {
      router.push(`/processing/${job.id}`);
    }
  }, [job, router]);

  if (isLoading || !job || job.status !== "completed") {
    return (
      <div className="glass-panel p-16 rounded-3xl flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  const targetLang = SUPPORTED_LANGUAGES.find((l) => l.code === job.targetLanguage);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel rounded-3xl overflow-hidden shadow-2xl border border-surface-200"
    >
      <div className="p-6 sm:p-8 bg-surface-100/50 border-b border-surface-200 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex w-10 h-10 items-center justify-center bg-green-500/20 text-green-400 rounded-full">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">Translation Complete</h1>
            <p className="text-sm text-gray-400">
              Translated to {targetLang?.name} {targetLang?.flag}
            </p>
          </div>
        </div>
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-2 px-4 py-2 bg-surface-200 hover:bg-surface-300 text-sm font-medium text-white rounded-xl transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Start New
        </button>
      </div>

      <div className="p-6 sm:p-8">
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border border-surface-300 shadow-xl mb-8 group">
          {videoUrl ? (
            <video
              src={videoUrl}
              controls
              className="w-full h-full object-contain"
              poster="/poster-placeholder.jpg" // Optional if you have one
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-100">
              <PlayCircle className="w-12 h-12 text-surface-300 mb-2" />
              <p className="text-gray-500 text-sm">Loading video player...</p>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <a
            href={videoUrl!}
            download={`translated_${targetLang?.name}.mp4`}
            className="flex-1 flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-500 active:scale-[0.98] transition-all py-4 px-6 rounded-xl font-semibold text-white shadow-glow"
          >
            <Download className="w-5 h-5" />
            Download Video
          </a>
          <button className="flex-1 flex items-center justify-center gap-2 bg-surface-200 hover:bg-surface-300 active:scale-[0.98] transition-all py-4 px-6 rounded-xl font-semibold text-white">
            Share Link
          </button>
        </div>
      </div>
    </motion.div>
  );
}
