import { estimateDub, type DubOptions } from "@/domain/billing/estimate";
import { PLANS, type VoiceKind } from "@/domain/billing/pricing";
import type { JobTemplate, TranslationJob } from "@/domain/entities/TranslationJob";
import type { IAIRepository } from "@/domain/repositories/IAIRepository";
import type { IAudioSeparator } from "@/domain/repositories/IAudioSeparator";
import type { ICreditRepository } from "@/domain/repositories/ICreditRepository";
import type { ITranslationJobRepository } from "@/domain/repositories/ITranslationJobRepository";

export interface StartTranslationInput {
  userId: string;
  jobId: string;
  name: string;
  /** storage key of the uploaded video */
  videoPath: string;
  /** storage folder for the job */
  jobDir: string;
  durationSec: number;
  targetLanguage: string;
  sourceLanguage: string | null;
  voice: VoiceKind;
  keepBackground: boolean;
  burnSubtitles: boolean;
  blurSubtitles: boolean;
  trimSec: number | null;
  template: JobTemplate | null;
}

export type StartResult = { ok: true; job: TranslationJob } | { ok: false; code: "no_account" | "too_long" | "voice_locked" | "voice_unavailable" | "background_unavailable" | "not_enough_credits"; message: string };

/** Checks the plan, the chosen options and the balance, then holds the credits and creates the job. */
export class StartTranslationUseCase {
  constructor(
    private readonly jobs: ITranslationJobRepository,
    private readonly credits: ICreditRepository,
    private readonly ai: IAIRepository,
    private readonly separator: IAudioSeparator,
  ) {}

  async execute(input: StartTranslationInput): Promise<StartResult> {
    const account = await this.credits.getAccount(input.userId);
    if (!account) return { ok: false, code: "no_account", message: "We couldn’t find your account. Log out and in again." };
    const plan = PLANS[account.plan];

    const opts: DubOptions = { voice: input.voice, keepBackground: input.keepBackground, burnSubtitles: input.burnSubtitles, blurSubtitles: input.blurSubtitles };
    const trim = input.trimSec && input.trimSec < input.durationSec ? input.trimSec : null;
    const est = estimateDub(input.durationSec, opts, account.plan, trim);

    if (est.overLength) return { ok: false, code: "too_long", message: `The ${plan.name} plan handles videos up to ${plan.maxMin} min.` };
    if (input.voice === "cloned" && !plan.clone) return { ok: false, code: "voice_locked", message: "Their own voice comes with Creator and Studio." };
    if (!this.ai.voiceAvailability(input.targetLanguage)[input.voice]) return { ok: false, code: "voice_unavailable", message: "This voice isn’t available for that language yet. Choose the standard AI voice." };
    if (input.keepBackground && !this.separator.available) return { ok: false, code: "background_unavailable", message: "Keeping background sound isn’t available yet. Turn it off under More options." };

    const route = `${(input.sourceLanguage ?? "auto").toUpperCase()} → ${input.targetLanguage.toUpperCase()}`;
    const held = await this.credits.hold(input.userId, est.total, `Translation hold · ${route}`, input.name);
    if (!held) return { ok: false, code: "not_enough_credits", message: `Not enough credits. You need ${est.total}.` };

    try {
      const now = new Date();
      const job = await this.jobs.create({
        id: input.jobId, userId: input.userId, kind: "dub", template: input.template, split: null, name: input.name, durationSec: est.sec, status: "pending", progress: 0,
        sourceLanguage: input.sourceLanguage, targetLanguage: input.targetLanguage, voice: input.voice,
        keepBackground: input.keepBackground, burnSubtitles: input.burnSubtitles, blurSubtitles: input.blurSubtitles,
        trimSec: trim, held: est.total, used: 0, lines: null, speakers: null, error: null,
        files: { dir: input.jobDir, original: input.videoPath }, createdAt: now, updatedAt: now,
      });
      return { ok: true, job };
    } catch (e) {
      await this.credits.settle(input.userId, est.total, 0, input.name); // give the hold back
      throw e;
    }
  }
}
