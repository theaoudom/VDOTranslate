"use client";
import { useEffect, useState, useRef } from "react";
import type { TranslationJob } from "@/domain/entities/TranslationJob";

interface UseTranslationJobResult {
  job: TranslationJob | null;
  error: string | null;
  isLoading: boolean;
}

export function useTranslationJob(jobId: string | null): UseTranslationJobResult {
  const [job, setJob] = useState<TranslationJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!jobId) return;

    setIsLoading(true);

    const poll = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) throw new Error(`Failed to fetch job: ${res.statusText}`);
        const data: TranslationJob = await res.json();
        setJob(data);
        setError(null);

        if (data.status === "completed" || data.status === "failed") {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setIsLoading(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setIsLoading(false);
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 2000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [jobId]);

  return { job, error, isLoading };
}
