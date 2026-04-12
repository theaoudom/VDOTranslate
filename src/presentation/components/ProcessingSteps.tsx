"use client";
import { motion } from "framer-motion";
import {
  FileVideo,
  Mic,
  Languages,
  Volume2,
  Clapperboard,
  CheckCircle2,
  Loader2,
  XCircle,
} from "lucide-react";
import type { TranslationJobStatus } from "@/domain/entities/TranslationJob";
import clsx from "clsx";

interface Step {
  id: TranslationJobStatus;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const STEPS: Step[] = [
  { id: "extracting",   label: "Extracting Audio",      description: "Separating audio from video track",      icon: <FileVideo className="h-5 w-5" /> },
  { id: "transcribing", label: "Transcribing Speech",   description: "Converting speech to text via AI",        icon: <Mic className="h-5 w-5" /> },
  { id: "translating",  label: "Translating Text",      description: "Translating to your target language",     icon: <Languages className="h-5 w-5" /> },
  { id: "synthesizing", label: "Synthesizing Voice",    description: "Generating AI voiceover",                 icon: <Volume2 className="h-5 w-5" /> },
  { id: "merging",      label: "Merging Into Video",    description: "Combining translated audio with video",   icon: <Clapperboard className="h-5 w-5" /> },
];

const STATUS_ORDER: TranslationJobStatus[] = [
  "pending",
  "extracting",
  "transcribing",
  "translating",
  "synthesizing",
  "merging",
  "completed",
  "failed",
];

function getStepState(
  stepId: TranslationJobStatus,
  currentStatus: TranslationJobStatus,
  progress: number,
): "done" | "active" | "waiting" | "failed" {
  const stepProgressMap: Record<string, number> = {
    pending: 0,
    extracting: 10,
    transcribing: 30,
    translating: 55,
    synthesizing: 75,
    merging: 90,
  };

  const currentStepProgress = stepProgressMap[stepId] ?? 0;

  if (currentStatus === "failed") {
    if (progress === currentStepProgress) return "failed";
    if (currentStepProgress < progress) return "done";
    return "waiting";
  }

  if (currentStatus === "completed") return "done";
  if (currentStepProgress < progress) return "done";
  if (currentStepProgress === progress && currentStatus !== "pending") return "active";
  return "waiting";
}

interface ProcessingStepsProps {
  status: TranslationJobStatus;
  progress: number;
  sourceLanguage: string | null;
  targetLanguage: string;
}

export function ProcessingSteps({
  status,
  progress,
  sourceLanguage,
  targetLanguage,
}: ProcessingStepsProps) {
  return (
    <div className="w-full">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex justify-between text-sm text-gray-400 mb-2">
          <span>Overall Progress</span>
          <span className="font-mono text-brand-400">{progress}%</span>
        </div>
        <div className="h-2 rounded-full bg-surface-200 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-500"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>
        {sourceLanguage && (
          <p className="mt-2 text-xs text-gray-500">
            Detected: <span className="text-brand-400 font-medium">{sourceLanguage.toUpperCase()}</span>
            {" → "}
            <span className="text-accent-400 font-medium">{targetLanguage.toUpperCase()}</span>
          </p>
        )}
      </div>

      {/* Steps */}
      <div className="flex flex-col gap-3">
        {STEPS.map((step, i) => {
          const state = getStepState(step.id, status, progress);
          return (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.07 }}
              className={clsx(
                "flex items-center gap-4 rounded-xl border px-4 py-3 transition-all duration-300",
                state === "done"    && "border-green-500/30 bg-green-500/10",
                state === "active"  && "border-brand-400/50 bg-brand-400/10 shadow-glow-sm",
                state === "waiting" && "border-surface-200 bg-surface-50 opacity-50",
                state === "failed"  && "border-red-500/30 bg-red-500/10",
              )}
            >
              <div
                className={clsx(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                  state === "done"    && "bg-green-500/20 text-green-400",
                  state === "active"  && "bg-brand-500/20 text-brand-400",
                  state === "waiting" && "bg-surface-200 text-gray-500",
                  state === "failed"  && "bg-red-500/20 text-red-400",
                )}
              >
                {state === "active"  && <Loader2 className="h-5 w-5 animate-spin" />}
                {state === "done"    && <CheckCircle2 className="h-5 w-5" />}
                {state === "failed"  && <XCircle className="h-5 w-5" />}
                {state === "waiting" && step.icon}
              </div>
              <div className="flex-1">
                <p className={clsx("text-sm font-semibold", state === "waiting" ? "text-gray-500" : "text-white")}>
                  {step.label}
                </p>
                <p className="text-xs text-gray-400">{step.description}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
