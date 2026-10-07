import { Suspense } from "react";
import { redirect } from "next/navigation";
import { OctagonAlert } from "lucide-react";
import { buildContainer } from "@/lib/container";
import { loadAccount } from "@/lib/account";
import { isAdminConfigured } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";
import { Flash } from "@/presentation/samesay/Flash";
import { AppShell } from "@/presentation/samesay/app/AppShell";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/app");
  const account = await loadAccount(user);
  const jobCount = account.ready ? (await buildContainer().jobs.listForUser(user.id, 200).catch(() => [])).length : 0;

  return (
    <AppShell account={{ name: account.name, email: account.email, plan: account.plan, credits: account.credits, held: account.held, jobCount }}>
      {!account.ready && (
        <section>
          <div className="note rec" style={{ marginBottom: "var(--sp-4)" }}>
            <OctagonAlert />
            <div>
              <b>Credits aren’t connected yet.</b>{" "}
              {isAdminConfigured
                ? "Run supabase/migrations/0002_jobs_and_credit_functions.sql in the Supabase SQL Editor."
                : "Add SUPABASE_SECRET_KEY to .env.local and restart the server."}
            </div>
          </div>
        </section>
      )}
      {children}
      <Suspense><Flash firstName={account.firstName} /></Suspense>
    </AppShell>
  );
}
