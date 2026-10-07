"use client";

import type { ReactNode } from "react";
import { useAnchor } from "../PublicNav";

export function AnchorButton({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  const anchor = useAnchor();
  return <button className={className} onClick={anchor(to)}>{children}</button>;
}
