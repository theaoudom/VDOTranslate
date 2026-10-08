import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";

const PROTECTED = ["/app", "/api/jobs", "/api/uploads", "/api/templates", "/api/edits"];
const GUEST_ONLY = ["/login", "/signup"];

const matches = (path: string, prefixes: string[]) =>
  prefixes.some((p) => path === p || path.startsWith(p + "/"));

/** Refreshes the Supabase session cookie and guards private and guest-only routes. */
export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;

  if (!isSupabaseConfigured) {
    if (!matches(path, PROTECTED)) return NextResponse.next({ request });
    return redirectOrDeny(request, "/login");
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Must run right after creating the client so the session is refreshed.
  const { data: { user } } = await supabase.auth.getUser();

  if (!user && matches(path, PROTECTED)) return redirectOrDeny(request, "/login", response);
  if (user && matches(path, GUEST_ONLY)) return redirectTo(request, "/app", response);
  return response;
}

function redirectOrDeny(request: NextRequest, to: string, from?: NextResponse) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Please log in." }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = to;
  url.search = "";
  url.searchParams.set("next", request.nextUrl.pathname);
  return redirectTo(request, url, from);
}

function redirectTo(request: NextRequest, to: string | URL, from?: NextResponse) {
  const url = typeof to === "string" ? new URL(to, request.url) : to;
  const res = NextResponse.redirect(url);
  // keep refreshed auth cookies on the redirect
  from?.cookies.getAll().forEach((c) => res.cookies.set(c));
  return res;
}
