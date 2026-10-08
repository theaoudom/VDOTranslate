import type { Metadata } from "next";
import { SupabaseTemplateRepository } from "@/data/repositories/SupabaseRepositories";
import type { Template } from "@/domain/entities/Template";
import type { TranslationJob } from "@/domain/entities/TranslationJob";
import { loadAccount } from "@/lib/account";
import { buildContainer } from "@/lib/container";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";
import { TemplateEditor, type PreviewSource } from "@/presentation/samesay/app/TemplateEditor";

export const metadata: Metadata = { title: "Templates" };

export default async function TemplatesPage({ searchParams }: { searchParams: { video?: string } }) {
  const user = (await getCurrentUser())!;
  const account = await loadAccount(user);
  if (!isAdminConfigured) return null;

  const repo = new SupabaseTemplateRepository();
  let templates: Template[] = await repo.listForUser(user.id).catch(() => []);
  if (!templates.length) templates = [await repo.create({ userId: user.id, name: "My brand", ratio: "16:9", pan: 50, layers: [] })];

  // Finished videos you can preview the template on (and export).
  const jobs: TranslationJob[] = await buildContainer().jobs.listForUser(user.id, 50).catch(() => []);
  const sources: PreviewSource[] = jobs
    .filter((j) => j.status === "completed" && j.files.video)
    .map((j) => ({ kind: "job", id: j.id, name: j.name, durationSec: j.durationSec, url: `/api/jobs/${j.id}/files/video` }));
  const initialSource = sources.find((s) => s.id === searchParams.video) ?? sources[0] ?? null;

  return (
    <TemplateEditor
      initialTemplates={JSON.parse(JSON.stringify(templates))}
      sources={sources}
      initialSource={initialSource}
      credits={account.credits}
      plan={account.plan}
    />
  );
}
