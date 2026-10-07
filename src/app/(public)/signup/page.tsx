import type { Metadata } from "next";
import { SignupForm } from "@/presentation/samesay/auth/AuthForms";

export const metadata: Metadata = { title: "Create your account" };

export default function SignupPage() {
  return (
    <section className="auth">
      <SignupForm />
    </section>
  );
}
