"use client";

import Link from "next/link";
import { BrandMark } from "./BrandMark";
import { useAnchor } from "./PublicNav";
import { SoonLink } from "./Toast";

export function PublicFooter() {
  const anchor = useAnchor();
  return (
    <footer className="foot-pub">
      <div className="wrap">
        <div className="stack" style={{ gap: 6 }}>
          <Link className="brand" href="/" style={{ color: "var(--text)", margin: 0, padding: 0, textDecoration: "none" }}><BrandMark />Samesay</Link>
          <span>Same voice. New language.</span>
          <span>© 2026 Samesay</span>
        </div>
        <div className="hstack" style={{ gap: "var(--sp-12)", alignItems: "flex-start" }}>
          <div className="stack" style={{ gap: 6 }}>
            <b>Product</b>
            <a href="/#quality" onClick={anchor("quality")}>Why it sounds real</a>
            <a href="/#languages" onClick={anchor("languages")}>Languages</a>
            <Link href="/pricing">Pricing</Link>
          </div>
          <div className="stack" style={{ gap: 6 }}>
            <b>Company</b>
            <SoonLink>Contact</SoonLink>
            <SoonLink>Terms</SoonLink>
            <SoonLink>Privacy</SoonLink>
          </div>
        </div>
      </div>
    </footer>
  );
}
