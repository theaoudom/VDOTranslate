import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/** Connect Google to this account: returns the Google sign-in page to open. */
export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { data, error } = await createClient().auth.linkIdentity({
    provider: "google",
    options: { redirectTo: `${req.nextUrl.origin}/auth/callback?next=/app` },
  });
  if (error || !data?.url) return NextResponse.json({ error: "Connecting Google isn’t available right now." }, { status: 400 });
  return NextResponse.json({ url: data.url });
}

/** Disconnect Google (only when there's another way to log in). */
export async function DELETE() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const supabase = createClient();
  const { data } = await supabase.auth.getUserIdentities();
  const identities = data?.identities ?? [];
  const google = identities.find((i) => i.provider === "google");
  if (!google) return NextResponse.json({ ok: true });
  if (identities.length < 2) return NextResponse.json({ error: "Set a password first, so you can still log in without Google." }, { status: 400 });
  const { error } = await supabase.auth.unlinkIdentity(google);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
