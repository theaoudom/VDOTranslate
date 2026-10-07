"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type FieldErrors = Partial<Record<"email" | "password" | "name" | "agree" | "form", string>>;
export type AuthState = { errors?: FieldErrors; checkEmail?: string; sent?: boolean } | undefined;

const NOT_CONFIGURED: AuthState = { errors: { form: "Sign-in isn’t set up yet. Add your Supabase keys to .env.local and restart the server." } };
const EMAIL_RE = /.+@.+\..+/;

function siteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

/** Only allow redirects back into this site. */
function safeNext(value: FormDataEntryValue | null, fallback = "/app") {
  const v = typeof value === "string" ? value : "";
  return v.startsWith("/") && !v.startsWith("//") ? v : fallback;
}

function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "That email and password don’t match.";
  if (m.includes("email not confirmed")) return "Confirm your email first. Check your inbox for the link.";
  if (m.includes("already registered") || m.includes("already been registered")) return "There’s already an account with this email. Log in instead.";
  if (m.includes("rate limit")) return "Too many tries. Wait a minute and try again.";
  return message;
}

export async function logIn(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const errors: FieldErrors = {};
  if (!email) errors.email = "Enter your email.";
  if (!password) errors.password = "Enter your password.";
  if (Object.keys(errors).length) return { errors };
  if (!isSupabaseConfigured) return NOT_CONFIGURED;

  const { error } = await createClient().auth.signInWithPassword({ email, password });
  if (error) return { errors: { form: friendly(error.message) } };
  const next = safeNext(form.get("next"));
  redirect(next + (next.includes("?") ? "&" : "?") + "welcome=back");
}

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const agree = form.get("agree") === "on";
  const errors: FieldErrors = {};
  if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email.";
  if (password.length < 8) errors.password = "At least 8 characters.";
  if (!agree) errors.agree = "Please accept the terms to continue.";
  if (Object.keys(errors).length) return { errors };
  if (!isSupabaseConfigured) return NOT_CONFIGURED;

  const { data, error } = await createClient().auth.signUp({
    email,
    password,
    options: { data: { full_name: name }, emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent("/app?welcome=new")}` },
  });
  if (error) return { errors: { form: friendly(error.message) } };
  // Supabase returns no session while the email still needs confirming.
  if (!data.session) return { checkEmail: email };
  redirect("/app?welcome=new");
}

export async function continueWithGoogle(form: FormData) {
  if (!isSupabaseConfigured) redirect("/login?setup=1");
  const next = safeNext(form.get("next"));
  const { data, error } = await createClient().auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next + "?welcome=back")}` },
  });
  if (error || !data.url) redirect("/login?error=google");
  redirect(data.url);
}

export async function sendPasswordReset(email: string): Promise<AuthState> {
  const e = email.trim();
  if (!e) return { errors: { email: "Enter your email." } };
  if (!isSupabaseConfigured) return NOT_CONFIGURED;
  const { error } = await createClient().auth.resetPasswordForEmail(e, { redirectTo: `${siteUrl()}/auth/callback?next=/reset-password` });
  if (error) return { errors: { form: friendly(error.message) } };
  return { sent: true };
}

export async function setNewPassword(_: AuthState, form: FormData): Promise<AuthState> {
  const password = String(form.get("password") ?? "");
  if (password.length < 8) return { errors: { password: "At least 8 characters." } };
  if (!isSupabaseConfigured) return NOT_CONFIGURED;
  const { error } = await createClient().auth.updateUser({ password });
  if (error) return { errors: { form: friendly(error.message) } };
  redirect("/app?welcome=password");
}
