import type { Metadata } from "next";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { LoginForm } from "@/presentation/samesay/auth/AuthForms";

export const metadata: Metadata = { title: "Log in" };

export default function LoginPage({ searchParams }: { searchParams: { next?: string; error?: string; setup?: string } }) {
  const next = searchParams.next?.startsWith("/") && !searchParams.next.startsWith("//") ? searchParams.next : undefined;
  const notice = !isSupabaseConfigured || searchParams.setup ? "setup" : searchParams.error;
  return (
    <section className="auth">
      <LoginForm next={next} notice={notice} />
    </section>
  );
}
