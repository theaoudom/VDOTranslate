import "server-only";
import fs from "fs";
import path from "path";
import { SupabasePaymentRepository } from "@/data/repositories/SupabasePaymentRepository";
import { TelegramPaymentNotifier } from "@/data/telegram/TelegramPaymentNotifier";
import type { Customer } from "@/domain/payments/Payment";
import { PaymentUseCases } from "@/domain/payments/PaymentUseCases";
import { reviewLink, reviewLinksReady } from "./paymentLinks";
import { adminClient } from "./supabase/admin";

export function buildPayments() {
  return new PaymentUseCases(new SupabasePaymentRepository(), new TelegramPaymentNotifier((p, action) => reviewLink(p.id, action), reviewLinksReady()));
}

/** Where people send the money: set in .env.local, plus the KHQR picture at assets/khqr.png. */
export const QR_FILE = path.join(process.cwd(), "assets", "khqr.png");
export function payDetails() {
  return {
    bank: process.env.PAY_BANK ?? "",
    name: process.env.PAY_ACCOUNT_NAME ?? "",
    account: process.env.PAY_ACCOUNT_NUMBER ?? "",
    hasQr: fs.existsSync(QR_FILE),
  };
}

/** Name and email to show the team in Telegram. */
export async function customerOf(userId: string): Promise<Customer> {
  const admin = adminClient();
  const [{ data: u }, { data: profile }] = await Promise.all([
    admin.auth.admin.getUserById(userId),
    admin.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
  ]);
  return { name: (profile as { full_name?: string } | null)?.full_name ?? "", email: u?.user?.email ?? "" };
}
