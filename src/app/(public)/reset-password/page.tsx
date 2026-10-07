import type { Metadata } from "next";
import { ResetPasswordForm } from "@/presentation/samesay/auth/AuthForms";

export const metadata: Metadata = { title: "Set a new password" };

export default function ResetPasswordPage() {
  return (
    <section className="auth">
      <ResetPasswordForm />
    </section>
  );
}
