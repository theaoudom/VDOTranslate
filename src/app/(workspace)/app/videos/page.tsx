import type { Metadata } from "next";
import { toPublicJob } from "@/domain/entities/TranslationJob";
import { buildContainer } from "@/lib/container";
import { getCurrentUser } from "@/lib/supabase/server";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { VideosTable } from "@/presentation/samesay/app/VideosTable";

export const metadata: Metadata = { title: "My videos" };

export default async function VideosPage() {
  const user = (await getCurrentUser())!;
  const jobs = isAdminConfigured ? (await buildContainer().jobs.listForUser(user.id, 200).catch(() => [])).map(toPublicJob) : [];
  return <VideosTable jobs={JSON.parse(JSON.stringify(jobs))} />;
}
