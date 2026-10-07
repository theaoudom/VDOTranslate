"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useToast } from "./Toast";

/** One-time toasts after a redirect (log in, sign up, log out), then cleans the URL. */
export function Flash({ firstName }: { firstName?: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();

  useEffect(() => {
    const welcome = params.get("welcome");
    const bye = params.get("bye");
    let msg = "";
    if (welcome === "back") msg = firstName ? `Welcome back, ${firstName}` : "Welcome back";
    else if (welcome === "new") msg = "Account created. 60 free credits added.";
    else if (welcome === "password") msg = "Password updated";
    else if (bye) msg = "You’re logged out";
    if (!msg) return;
    toast(msg);
    const rest = new URLSearchParams(params.toString());
    rest.delete("welcome");
    rest.delete("bye");
    const q = rest.toString();
    router.replace(pathname + (q ? "?" + q : ""), { scroll: false });
  }, [params, pathname, router, toast, firstName]);

  return null;
}
