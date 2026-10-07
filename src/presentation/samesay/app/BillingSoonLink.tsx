"use client";

import type { ReactNode } from "react";
import { useToast } from "../Toast";

/** Billing lives in the settings dialog (next phase); until then these links say so. */
export function BillingSoonLink({ children }: { children: ReactNode }) {
  const toast = useToast();
  return <a href="#" onClick={(e) => { e.preventDefault(); toast("Top-ups and plans are coming in the next update"); }}>{children}</a>;
}
