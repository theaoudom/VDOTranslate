import fs from "fs";
import path from "path";
import type { Metadata } from "next";
import { PLANS, type VoiceKind } from "@/domain/billing/pricing";
import { SupabaseTemplateRepository } from "@/data/repositories/SupabaseRepositories";
import type { Template } from "@/domain/entities/Template";
import { loadAccount } from "@/lib/account";
import { buildContainer, jobDir } from "@/lib/container";
import { getCurrentUser } from "@/lib/supabase/server";
import { TranslateForm } from "@/presentation/samesay/app/TranslateForm";
import { NewUpload } from "@/presentation/samesay/app/NewUpload";

export const metadata: Metadata = { title: "Translate video" };

function readUpload(userId: string, id?: string) {
  if (!id) return null;
  try {
    const meta = path.join(jobDir(userId, id), "upload.json");
    if (!fs.existsSync(meta)) return null;
    const m = JSON.parse(fs.readFileSync(meta, "utf8")) as { name: string; size: number; durationSec: number };
    return { uploadId: id, name: m.name, size: m.size, durationSec: m.durationSec };
  } catch {
    return null;
  }
}

export default async function NewTranslationPage({ searchParams }: { searchParams: { upload?: string; to?: string; voice?: string } }) {
  const user = (await getCurrentUser())!;
  const account = await loadAccount(user);
  const upload = readUpload(user.id, searchParams.upload);

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
