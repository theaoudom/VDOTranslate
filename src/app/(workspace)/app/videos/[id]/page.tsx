import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { toPublicJob } from "@/domain/entities/TranslationJob";
import { buildContainer } from "@/lib/container";
import { getCurrentUser } from "@/lib/supabase/server";
import { JobView } from "@/presentation/samesay/app/JobView";

export const metadata: Metadata = { title: "Result" };

export default async function VideoPage({ params }: { params: { id: string } }) {
  const user = (await getCurrentUser())!;
  const job = await buildContainer().jobs.findById(params.id).catch(() => null);
  if (!job || job.userId !== user.id) notFound();
  return <JobView initial={JSON.parse(JSON.stringify(toPublicJob(job)))} />;
}
