import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  if (isSupabaseConfigured) await createClient().auth.signOut();
  return NextResponse.redirect(new URL("/?bye=1", request.url), { status: 303 });
}
