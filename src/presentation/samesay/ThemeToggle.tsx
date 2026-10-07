"use client";

import { SunMoon } from "lucide-react";

export const THEME_KEY = "samesay-theme";

/** Runs before paint (inlined in <head>) so the saved theme never flashes. */
export const themeBootScript = `try{var t=localStorage.getItem('${THEME_KEY}');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

export function toggleTheme() {
  const root = document.documentElement;
  const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  try { localStorage.setItem(THEME_KEY, next); } catch {}
}

export function ThemeToggle() {
  return (
    <button className="btn ghost icon sm" onClick={toggleTheme} aria-label="Switch theme">
      <SunMoon />
    </button>
  );
}
