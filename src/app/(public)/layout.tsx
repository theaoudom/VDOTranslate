import { Suspense } from "react";
import { getCurrentUser } from "@/lib/supabase/server";
import { Flash } from "@/presentation/samesay/Flash";
import { PublicFooter } from "@/presentation/samesay/PublicFooter";
import { PublicNav } from "@/presentation/samesay/PublicNav";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <div className="pub">
      <PublicNav isMember={Boolean(user)} />
      <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>{children}</main>
      <PublicFooter />
      <Suspense><Flash /></Suspense>
    </div>
  );
}
