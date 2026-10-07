import fs from "fs";
import path from "path";
import { SupabaseCreditRepository, SupabaseJobRepository } from "@/data/repositories/SupabaseRepositories";
import { activeJobs } from "@/domain/use-cases/activeJobs";
import { RecoverStuckJobsUseCase } from "@/domain/use-cases/RecoverStuckJobs";
import { getUploadsDir } from "./uploads";

export const FILE_RETENTION_DAYS = 30;
const UNUSED_UPLOAD_HOURS = 24;

/**
 * Gives back credits held by jobs that stopped half-way.
 * On boot, nothing can still be running in this new process, so every unfinished job is stuck.
 * (This assumes one server process. With several, run recovery from one place only.)
 */
export async function recoverStuckJobs(onBoot: boolean) {
  const recover = new RecoverStuckJobsUseCase(new SupabaseJobRepository(), new SupabaseCreditRepository());
  const n = await recover.execute({ isActive: activeJobs.has, staleMinutes: onBoot ? 0 : 20, hardLimitMinutes: 240 });
  if (n) console.log(`[maintenance] recovered ${n} stuck job(s) and returned their credits`);
}

/** Deletes video files older than 30 days, and uploads that were never translated after 24 hours. */
export async function cleanupFiles() {
  const jobs = new SupabaseJobRepository();
  const uploads = getUploadsDir();
  let removed = 0;

  const cutoff = new Date(Date.now() - FILE_RETENTION_DAYS * 86400_000);
  for (const job of await jobs.listWithFilesBefore(cutoff)) {
    if (job.status !== "completed" && job.status !== "failed") continue;
    if (job.files.dir && isInside(uploads, job.files.dir)) fs.rmSync(job.files.dir, { recursive: true, force: true });
    await jobs.update(job.id, { files: {} });
    removed++;
  }

  // Folders from uploads that never became a job.
  const unusedBefore = Date.now() - UNUSED_UPLOAD_HOURS * 3600_000;
  for (const user of safeList(uploads)) {
    const userDir = path.join(uploads, user);
    if (!/^[0-9a-f-]{36}$/i.test(user) || !fs.statSync(userDir).isDirectory()) continue;
    for (const id of safeList(userDir)) {
      const dir = path.join(userDir, id);
      if (!/^[0-9a-f-]{36}$/i.test(id) || fs.statSync(dir).mtimeMs > unusedBefore) continue;
      if (await jobs.findById(id)) continue;
      fs.rmSync(dir, { recursive: true, force: true });
      removed++;
    }
  }
  if (removed) console.log(`[maintenance] removed files of ${removed} old video(s)/upload(s)`);
}

const safeList = (dir: string) => { try { return fs.readdirSync(dir); } catch { return []; } };
const isInside = (root: string, p: string) => !path.relative(root, p).startsWith("..") && path.resolve(p) !== path.resolve(root);
