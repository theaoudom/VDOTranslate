"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sparkles, ArrowLeft } from "lucide-react";
import { useTranslationJob } from "@/presentation/hooks/useTranslationJob";
import { ProcessingSteps } from "@/presentation/components/ProcessingSteps";

export default function ProcessingPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { job, error, isLoading } = useTranslationJob(params.id);

  // Auto-redirect to results when complete
  useEffect(() => {
    if (job?.status === "completed") {
      // Small delay so user sees the 100% completion state briefly
      const t = setTimeout(() => {
        router.push(`/result/${job.id}`);
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [job?.status, job?.id, router]);

  if (error) {
    return (
      <div className="glass-panel p-8 sm:p-10 rounded-3xl text-center">
        <h2 className="text-xl font-bold text-red-400 mb-4">Error loading job</h2>
        <p className="text-gray-400 mb-6">{error}</p>
        <button
          onClick={() => router.push("/")}
          className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-surface-200 hover:bg-surface-300 rounded-xl text-white font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Go Back
        </button>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="glass-panel p-16 rounded-3xl flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-panel p-8 sm:p-10 rounded-3xl"
    >
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center p-3 bg-brand-500/20 rounded-2xl mb-4 border border-brand-500/30 shadow-glow-sm">
          <Sparkles className="w-8 h-8 text-brand-400 animate-pulse" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Processing Video</h1>
        <p className="text-sm text-gray-400">
          This may take a few minutes depending on the video length.
        </p>

        {job.status === "failed" && job.error && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm text-left">
            <strong>Pipeline Error:</strong> {job.error}
          </div>
        )}
      </div>

      <ProcessingSteps
        status={job.status}
        progress={job.progress}
        sourceLanguage={job.sourceLanguage}
        targetLanguage={job.targetLanguage}
      />
    </motion.div>
  );
}
