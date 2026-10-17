"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Clapperboard, Coins, CreditCard, FolderOpen, Globe, Languages, LayoutDashboard, LayoutTemplate, LogOut, Menu, Scissors, Settings, SunMoon } from "lucide-react";
import { PLANS, type PlanId } from "@/domain/billing/pricing";
import { BrandMark } from "../BrandMark";
import { toggleTheme } from "../ThemeToggle";
import { fmt } from "./format";
import { SettingsProvider, useOpenSettings } from "./Settings";
import { UpdateNotice } from "./UpdateNotice";

export interface ShellAccount {
  name: string;
  email: string;
  plan: PlanId;
  credits: number;
  held: number;
  jobCount: number;
}

const NAV = [
  { href: "/app", key: "home", icon: LayoutDashboard, label: "Home" },
  { href: "/app/new", key: "new", icon: Languages, label: "Translate video" },
  { href: "/app/videos", key: "videos", icon: FolderOpen, label: "My videos", count: true },
];
const TOOLS = [
  { href: "/app/templates", key: "templates", icon: LayoutTemplate, label: "Templates" },
  { href: "/app/split", key: "split", icon: Scissors, label: "Auto-split" },
  { href: "/app/movie", key: "movie", icon: Clapperboard, label: "AI movie", badge: "New" },
];

function section(path: string) {
  if (path === "/app") return { key: "home", crumb: "Home" };
  if (path.startsWith("/app/new")) return { key: "new", crumb: "Translate video" };
  if (/^\/app\/videos\/[^/]+/.test(path)) return { key: "videos", crumb: "Result" };
  if (path.startsWith("/app/videos")) return { key: "videos", crumb: "My videos" };
  if (path.startsWith("/app/templates")) return { key: "templates", crumb: "Templates" };
  if (path.startsWith("/app/split")) return { key: "split", crumb: "Auto-split" };
  if (path === "/app/movie") return { key: "movie", crumb: "AI movie" };
  const mv = /^\/app\/movie\/[^/]+\/(script|cast|shots|make)/.exec(path);
  if (mv) return { key: "movie", crumb: "AI movie · " + ({ script: "Script", cast: "Characters", shots: "Shots", make: "Result" } as const)[mv[1] as "script"] };
  return { key: "", crumb: "" };
}

export function AppShell(props: { account: ShellAccount; children: ReactNode }) {
  return <SettingsProvider><Shell {...props} /></SettingsProvider>;
}

function Shell({ account, children }: { account: ShellAccount; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const openSettings = useOpenSettings();
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { key, crumb } = section(pathname);
  const plan = PLANS[account.plan];
  const cap = Math.max(plan.monthly, account.credits + account.held, 1);
  const initials = account.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const settings = (tab: "account" | "billing") => { setMenu(false); openSettings(tab); };

  useEffect(() => setDrawer(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenu(false); setDrawer(false); } };
    const onClick = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("click", onClick); };
  }, []);

  return (
    <div className="shell app">
      <aside className={"side" + (drawer ? " open" : "")}>
        <Link className="brand" href="/app" style={{ color: "var(--text)", textDecoration: "none" }}><BrandMark />Samesay</Link>
        <nav className="nav">
          {NAV.map((n) => (
            <Link key={n.key} href={n.href} aria-current={key === n.key ? "page" : undefined}>
              <n.icon />{n.label}{n.count && <span className="count">{account.jobCount}</span>}
            </Link>
          ))}
          <span className="grp eyebrow">Tools</span>
          {TOOLS.map((n) => (
            <Link key={n.key} href={n.href} aria-current={key === n.key ? "page" : undefined}><n.icon />{n.label}{"badge" in n && n.badge && <span className="badge accent" style={{ marginLeft: "auto" }}>{n.badge}</span>}</Link>
          ))}
        </nav>
        <button className="foot meter" onClick={() => settings("billing")}>
          <span className="meter-row"><span className="eyebrow">{plan.name}</span><span className="num t-small">{fmt(account.credits)}</span></span>
          <span className="meter-bar">
            <span style={{ width: (account.credits / cap) * 100 + "%" }} />
            <span className="reserve" style={{ width: (account.held / cap) * 100 + "%" }} />
          </span>
          <span className="btn sm block">Top up</span>
        </button>
      </aside>
      <header className="topbar">
        <button className="btn ghost icon sm mobile-only" onClick={() => setDrawer((d) => !d)} aria-label="Menu"><Menu /></button>
        <div className="crumbs"><b>{crumb}</b></div>
        <span className="spacer" />
        <button className="credit-pill" onClick={() => settings("billing")} aria-label="Credits and billing"><Coins /><span>{fmt(account.credits)} cr</span></button>
        <div className="menu-anchor" ref={menuRef}>
          <button className="avatar" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu} aria-label="Account">{initials}</button>
          <div className="menu" role="menu" hidden={!menu}>
            <div className="lbl"><div style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>{account.name}</div><div className="faint t-xs">{account.email}</div></div>
            <hr />
            <button role="menuitem" onClick={() => settings("account")}><Settings />Settings</button>
            <button role="menuitem" onClick={() => settings("billing")}><CreditCard />Billing &amp; credits</button>
            <button role="menuitem" onClick={() => { toggleTheme(); setMenu(false); }}><SunMoon />Switch theme</button>
            <button role="menuitem" onClick={() => { setMenu(false); router.push("/"); }}><Globe />View website</button>
            <hr />
            <form action="/auth/signout" method="post" style={{ display: "contents" }}>
              <button role="menuitem" type="submit"><LogOut />Log out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="content"><UpdateNotice />{children}</main>
      {drawer && <div className="drawer-scrim" onClick={() => setDrawer(false)} />}
    </div>
  );
}
