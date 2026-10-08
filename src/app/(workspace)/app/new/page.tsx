import type { Metadata } from "next";
import { PLANS, type VoiceKind } from "@/domain/billing/pricing";
import { SupabaseTemplateRepository } from "@/data/repositories/SupabaseRepositories";
import type { Template } from "@/domain/entities/Template";
import { loadAccount } from "@/lib/account";
import { buildContainer } from "@/lib/container";
import { readUpload } from "@/lib/uploads";
import { getCurrentUser } from "@/lib/supabase/server";
import { TranslateForm } from "@/presentation/samesay/app/TranslateForm";
import { NewUpload } from "@/presentation/samesay/app/NewUpload";

export const metadata: Metadata = { title: "Translate video" };

export default async function NewTranslationPage({ searchParams }: { searchParams: { upload?: string; to?: string; voice?: string } }) {
  const user = (await getCurrentUser())!;
  const account = await loadAccount(user);
  const up = searchParams.upload ? await readUpload(user.id, searchParams.upload) : null;
  const upload = up && { uploadId: searchParams.upload!, name: up.name, size: up.size, durationSec: up.durationSec };

  if (!upload) return <NewUpload maxMin={PLANS[account.plan].maxMin} planName={PLANS[account.plan].name} />;

  const c = buildContainer();
  const list: Template[] = account.ready ? await new SupabaseTemplateRepository().listForUser(user.id).catch(() => []) : [];
  const templates = list.map((t) => ({ id: t.id, name: t.name, ratio: t.ratio }));
  return (
    <TranslateForm
      upload={upload}
      plan={account.plan}
      credits={account.credits}
      ready={account.ready}
      available={{ voiceLanguages: c.ai.voiceLanguages(), background: c.separator.available }}
      initial={{ to: searchParams.to, voice: searchParams.voice as VoiceKind | undefined }}
      templates={templates}
    />
  );
}
