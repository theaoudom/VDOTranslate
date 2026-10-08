import { isAdminConfigured } from "@/lib/supabase/admin";
import { cleanupFiles, recoverStuckJobs } from "@/lib/maintenance";

const safely = (name: string, fn: () => Promise<void>) => fn().catch((e) => console.error(`[maintenance] ${name} failed:`, e));

// On Vercel a daily cron calls /api/cron/maintenance instead.
if (isAdminConfigured && !process.env.VERCEL) {
  void safely("recovery", recoverStuckJobs).then(() => safely("cleanup", cleanupFiles));
  setInterval(() => safely("recovery", recoverStuckJobs), 5 * 60_000).unref();
  setInterval(() => safely("cleanup", cleanupFiles), 6 * 3600_000).unref();
}
