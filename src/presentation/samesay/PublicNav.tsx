"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import { BrandMark } from "./BrandMark";
import { ThemeToggle } from "./ThemeToggle";

/** Scrolls smoothly to a landing section, going to the landing page first if needed. */
export function useAnchor() {
  const pathname = usePathname();
  const router = useRouter();
  return (id: string) => (e: MouseEvent) => {
    e.preventDefault();
    if (pathname === "/") document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    else router.push("/#" + id);
  };
}

export function PublicNav({ isMember }: { isMember: boolean }) {
  const pathname = usePathname();
  const anchor = useAnchor();
  return (
    <header className="pubnav">
      <Link className="brand" href="/"><BrandMark />Samesay</Link>
      <nav className="links">
        <a href="/#quality" onClick={anchor("quality")}>Why it sounds real</a>
        <a href="/#languages" onClick={anchor("languages")}>Languages</a>
        <Link href="/pricing" aria-current={pathname === "/pricing" ? "page" : "false"}>Pricing</Link>
      </nav>
      <span style={{ flex: 1 }} />
      <ThemeToggle />
      {isMember ? (
        <Link className="btn primary sm" href="/app">Open app</Link>
      ) : (
        <>
          <Link className="btn ghost sm" href="/login">Log in</Link>
          <Link className="btn primary sm" href="/signup">Start free</Link>
        </>
      )}
    </header>
  );
}
