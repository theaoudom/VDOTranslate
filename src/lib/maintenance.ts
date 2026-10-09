import { SupabaseCreditRepository, SupabaseJobRepository } from "@/data/repositories/SupabaseRepositories";
import { RecoverStuckJobsUseCase } from "@/domain/use-cases/RecoverStuckJobs";
import { SupabasePaymentRepository } from "@/data/repositories/SupabasePaymentRepository";
import { adminClient } from "./supabase/admin";
import { fileStore } from "./uploads";

export const FILE_RETENTION_DAYS = 30;
const UNUSED_UPLOAD_HOURS = 24;
const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Gives back credits held by jobs that stopped half-way. Jobs run as workflows that resume
 * after restarts and update the job at every step, so only a job that hasn't moved
 * for a long time is treated as stuck.
 */
/** Ends paid plans whose month is over, and forgets pay windows nobody finished. */
export async function tidyBilling() {
  const { error } = await adminClient().rpc("expire_plans");
  if (error) throw new Error(error.message);
  await new SupabasePaymentRepository().deleteOpenBefore(new Date(Date.now() - 86400_000));
}

export async function recoverStuckJobs() {
  const recover = new RecoverStuckJobsUseCase(new SupabaseJobRepository(), new SupabaseCreditRepository());
  const n = await recover.execute({ isActive: () => false, staleMinutes: 45, hardLimitMinutes: 240 });
  if (n) console.log(`[maintenance] recovered ${n} stuck job(s) and returned their credits`);
}

/** Deletes video files older than 30 days, and uploads that were never translated after 24 hours. */
export async function cleanupFiles() {
  const jobs = new SupabaseJobRepository();
  const store = fileStore();
  let removed = 0;

  const cutoff = new Date(Date.now() - FILE_RETENTION_DAYS * 86400_000);
  for (const job of await jobs.listWithFilesBefore(cutoff)) {
    if (job.status !== "completed" && job.status !== "failed") continue;
    const dir = job.files.dir;
    if (dir && dir.startsWith(`${job.userId}/`)) await store.deletePrefix(`${dir}/`);
    else if (dir) await store.deletePrefix(dir); // older jobs kept a full local path
    await jobs.update(job.id, { files: {} });
    removed++;
  }

  // Folders from uploads that never became a job.
  const unusedBefore = Date.now() - UNUSED_UPLOAD_HOURS * 3600_000;
  for (const user of await store.listFolders("")) {
    if (!UUID.test(user.prefix.slice(0, -1))) continue;
    for (const folder of await store.listFolders(user.prefix)) {
      const id = folder.prefix.slice(user.prefix.length, -1);
      if (!UUID.test(id) || folder.updatedAt.getTime() > unusedBefore) continue;
      if (await jobs.findById(id)) continue;
      await store.deletePrefix(folder.prefix);
      removed++;
    }
  }
  if (removed) console.log(`[maintenance] removed files of ${removed} old video(s)/upload(s)`);
}
