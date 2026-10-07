import "server-only";
import { NextResponse } from "next/server";
import { isAdminConfigured } from "./supabase/admin";
import { getCurrentUser } from "./supabase/server";

/** The signed-in user for an API route, or a ready-made error response. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "Please log in." }, { status: 401 }) } as const;
  if (!isAdminConfigured) {
    return { error: NextResponse.json({ error: "Credits aren’t set up yet (SUPABASE_SECRET_KEY is missing)." }, { status: 503 }) } as const;
  }
  return { user } as const;
}
