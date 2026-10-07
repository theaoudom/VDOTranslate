import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

// Secret (service-role) key: bypasses row-level security. Server code only — never import in a client component.
const SECRET = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const isAdminConfigured = Boolean(SUPABASE_URL && SECRET);

let client: ReturnType<typeof createClient> | null = null;

export function adminClient() {
  if (!isAdminConfigured) throw new Error("SUPABASE_SECRET_KEY is missing in .env.local.");
  client ??= createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}
