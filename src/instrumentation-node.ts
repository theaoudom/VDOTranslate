import { isAdminConfigured } from "@/lib/supabase/admin";
import { cleanupFiles, recoverStuckJobs } from "@/lib/maintenance";

const safely = (name: string, fn: () => Promise<void>) => fn().catch((e) => console.error(`[maintenance] ${name} failed:`, e));

if (isAdminConfigured) {
  // Jobs that were running when the server stopped can't continue: return their credits.
  void safely("startup recovery", () => recoverStuckJobs(true)).then(() => safely("cleanup", cleanupFiles));
  setInterval(() => safely("recovery", () => recoverStuckJobs(false)), 5 * 60_000).unref();
  setInterval(() => safely("cleanup", cleanupFiles), 6 * 3600_000).unref();
}
