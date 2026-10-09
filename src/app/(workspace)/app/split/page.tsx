import type { Metadata } from "next";
import { SupabaseTemplateRepository } from "@/data/repositories/SupabaseRepositories";
import type { Template } from "@/domain/entities/Template";
import { loadAccount } from "@/lib/account";
import { buildContainer } from "@/lib/container";
import { getCurrentUser } from "@/lib/supabase/server";
import { readUpload } from "@/lib/uploads";
import { SplitForm, SplitUpload, type SplitSource } from "@/presentation/samesay/app/SplitForm";

export const metadata: Metadata = { title: "Auto-split" };

/** /app/split?upload=<id> splits a fresh upload; ?video=<jobId> splits a finished video. */
export default async function SplitPage({ searchParams }: { searchParams: { upload?: string; video?: string } }) {
  const user = (await getCurrentUser())!;
  let source: SplitSource | null = null;
  if (searchParams.video) {
    const job = await buildContainer().jobs.findById(searchParams.video).catch(() => null);
    if (job && job.userId === user.id && job.status === "completed" && job.files.video) {
      source = { kind: "job", id: job.id, name: job.name, durationSec: job.trimSec ?? job.durationSec, size: null };
    }
  } else if (searchParams.upload) {
    const up = await readUpload(user.id, searchParams.upload);
    if (up) source = { kind: "upload", id: searchParams.upload, name: up.name, durationSec: up.durationSec, size: up.size };
  }
  if (!source) return <SplitUpload />;

  const account = await loadAccount(user);
  const templates: Template[] = account.ready ? await new SupabaseTemplateRepository().listForUser(user.id).catch(() => []) : [];
  return <SplitForm source={source} plan={account.plan} credits={account.credits} templates={templates.map((t) => ({ id: t.id, name: t.name }))} />;
}
