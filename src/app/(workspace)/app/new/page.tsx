import type { Metadata } from "next";
import { PLANS, type VoiceKind } from "@/domain/billing/pricing";
import { SupabaseTemplateRepository } from "@/data/repositories/SupabaseRepositories";
import type { Template } from "@/domain/entities/Template";
import { loadAccount } from "@/lib/account";
import { buildContainer } from "@/lib/container";
import { readUpload } from "@/lib/uploads";
import { adminClient } from "@/lib/supabase/admin";
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

  // Translation defaults from Settings; links like ?to=km&voice=natural win.
  const { data: profile } = await adminClient().from("profiles").select("defaults").eq("id", user.id).maybeSingle();
  const d = ((profile as { defaults?: Record<string, unknown> } | null)?.defaults ?? {}) as { to?: string; voice?: VoiceKind; bg?: boolean; subs?: boolean };
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
      initial={{ to: searchParams.to ?? d.to, voice: (searchParams.voice as VoiceKind | undefined) ?? d.voice, bg: d.bg, subs: d.subs }}
      templates={templates}
    />
  );
}
