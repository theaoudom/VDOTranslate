import { createClient as createPlainClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/session";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

/** Change the password after checking the current one. */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => ({}));
  const current = String(body?.current ?? "");
  const next = String(body?.next ?? "");
  if (next.length < 8) return NextResponse.json({ error: "Use at least 8 characters." }, { status: 400 });

  // Check the current password with a throwaway client, so the real session isn't touched.
  const check = createPlainClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: wrong } = await check.auth.signInWithPassword({ email: auth.user.email ?? "", password: current });
  if (wrong) return NextResponse.json({ error: "Your current password isn’t right." }, { status: 400 });
  await check.auth.signOut().catch(() => {});

  const { error } = await createClient().auth.updateUser({ password: next });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
