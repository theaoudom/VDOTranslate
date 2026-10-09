import { NextResponse, type NextRequest } from "next/server";
import { SupabaseCreditRepository } from "@/data/repositories/SupabaseRepositories";
import { SUPPORTED_LANGUAGES } from "@/domain/entities/Language";
import { requireUser } from "@/lib/session";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { fileStore } from "@/lib/uploads";

const VOICES = ["standard", "natural", "cloned"];

/** Everything the Settings dialog shows. */
export async function GET() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const credits = new SupabaseCreditRepository();
  const [acc, history, { data: profile }] = await Promise.all([
    credits.getAccount(auth.user.id),
    credits.history(auth.user.id, 8),
    adminClient().from("profiles").select("defaults").eq("id", auth.user.id).maybeSingle(),
  ]);
  const identities = auth.user.identities ?? [];
  return NextResponse.json({
    name: acc?.fullName ?? "",
    email: auth.user.email ?? "",
    plan: acc?.plan ?? "free",
    credits: acc?.credits ?? 0,
    held: acc?.held ?? 0,
    renewsAt: acc?.renewsAt?.toISOString() ?? null,
    defaults: (profile as { defaults?: unknown } | null)?.defaults ?? {},
    history: history.map((h) => ({ at: h.createdAt.toISOString(), reason: h.reason, job: h.jobName, delta: h.delta })),
    google: identities.some((i) => i.provider === "google"),
    canUnlinkGoogle: identities.length > 1,
  });
}

/** Save name, email (sends a confirmation link) or translation defaults. */
export async function PATCH(req: NextRequest) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const body = await req.json().catch(() => ({}));
  const admin = adminClient();
  let emailSent = false;

  if (typeof body?.name === "string") {
    const name = body.name.trim().slice(0, 80);
    if (!name) return NextResponse.json({ error: "Enter your name." }, { status: 400 });
    await admin.from("profiles").update({ full_name: name } as never).eq("id", auth.user.id);
    await createClient().auth.updateUser({ data: { full_name: name } });
  }
  if (typeof body?.email === "string" && body.email.trim().toLowerCase() !== (auth.user.email ?? "").toLowerCase()) {
    const email = body.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
    const { error } = await createClient().auth.updateUser({ email }, { emailRedirectTo: `${req.nextUrl.origin}/auth/callback?next=/app` });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    emailSent = true;
  }
  if (body?.defaults && typeof body.defaults === "object") {
    const d = body.defaults;
    const defaults = {
      to: SUPPORTED_LANGUAGES.some((l) => l.code === d.to) ? d.to : undefined,
      voice: VOICES.includes(d.voice) ? d.voice : undefined,
      bg: typeof d.bg === "boolean" ? d.bg : undefined,
      subs: typeof d.subs === "boolean" ? d.subs : undefined,
    };
    await admin.from("profiles").update({ defaults } as never).eq("id", auth.user.id);
  }
  return NextResponse.json({ ok: true, emailSent });
}

/** Delete the account: files, videos, templates, credits and the login itself. */
export async function DELETE() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  await fileStore().deletePrefix(`${auth.user.id}/`).catch((e) => console.error("[account] file delete failed", e));
  const { error } = await adminClient().auth.admin.deleteUser(auth.user.id);
  if (error) return NextResponse.json({ error: "We couldn’t delete the account. Please try again." }, { status: 500 });
  await createClient().auth.signOut().catch(() => {});
  return NextResponse.json({ ok: true });
}
