"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ExternalLink, Menu, UserRound, X } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { ThemeToggle } from "@/components/theme-toggle";

type NavLink = {
  href: string;
  label: string;
  external?: boolean;
};

export function NavBar() {
  const { profile, isCoach, signOut } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    if (!mobileOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileOpen(false);
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);

  if (!profile) return null;

  const links: NavLink[] = [
    { href: "/board", label: "Kanban" },
    ...(profile.subteam
      ? [{ href: `/board/${profile.subteam}`, label: "My subteam" }]
      : []),
    { href: "/calendar", label: "Calendar" },
    ...(isCoach ? [{ href: "/timeclock", label: "Timeclock" }] : []),
    { href: "/my-tasks", label: "My tasks" },
    { href: "https://partexporter.app/dashboard/", label: "Parts", external: true },
    { href: "https://scout.team401.org", label: "Scouting", external: true },
    { href: "https://battery.team401.org", label: "Batteries", external: true },
    { href: "/inventory", label: "Inventory" },
    { href: "/certifications", label: "Certifications" },
    ...(isCoach ? [{ href: "/metrics", label: "Metrics" }] : []),
    ...(isCoach ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  const currentPath = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const activeHref = links
    .filter((link) => !link.external)
    .filter((link) => currentPath === link.href || currentPath.startsWith(link.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  function isActive(href: string) {
    return href === activeHref;
  }

  return (
    <header className="app-header relative z-50 border-b">
      <div className="flex h-14 w-full items-center gap-3 px-3 sm:px-4 xl:px-6">
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="-ml-1 flex min-h-10 min-w-10 items-center justify-center rounded text-white hover:bg-white/10 xl:hidden"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          aria-controls="primary-navigation"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <Link
          href="/board"
          className="tracked-label shrink-0 text-xs font-bold text-white hover:text-white"
        >
          401 Ops
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto xl:flex">
          {links.map((link) => {
            const className = `tracked-label inline-flex items-center gap-1 whitespace-nowrap rounded px-2.5 py-2 text-[11px] 2xl:px-3 2xl:text-xs ${
              !link.external && isActive(link.href)
                ? "bg-white text-blueprint"
                : "text-white/80 hover:bg-white/10 hover:text-white"
            }`;

            return link.external ? (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                title={`${link.label} — opens in a new tab`}
                className={className}
              >
                {link.label}
                <ExternalLink aria-hidden="true" size={11} strokeWidth={2.2} />
              </a>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                className={className}
                aria-current={isActive(link.href) ? "page" : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="relative ml-auto flex items-center gap-2 whitespace-nowrap xl:ml-0 2xl:gap-3">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setAccountOpen((value) => !value)}
            className="flex min-h-9 items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-2.5 text-xs font-medium text-white hover:bg-white/15"
            aria-expanded={accountOpen}
            aria-haspopup="menu"
          >
            <UserRound size={15} /><span className="hidden max-w-40 truncate sm:inline">{profile.displayName}</span><ChevronDown size={13} />
          </button>
          {accountOpen && <div role="menu" className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-52 rounded-lg border border-steel-line bg-paper-raised p-1.5 text-ink shadow-xl">
            <p className="px-2 py-1.5 text-xs text-steel">{profile.role.replace("_", " ")}</p>
            <Link role="menuitem" href="/account" onClick={() => setAccountOpen(false)} className="block rounded-md px-2 py-2 text-sm hover:bg-blueprint/10">Account &amp; settings</Link>
            <Link role="menuitem" href="/reports" onClick={() => setAccountOpen(false)} className="block rounded-md px-2 py-2 text-sm hover:bg-blueprint/10">Reports</Link>
            <button role="menuitem" type="button" onClick={() => signOut()} className="w-full rounded-md px-2 py-2 text-left text-sm text-danger hover:bg-danger/10">Sign out</button>
          </div>}
        </div>
      </div>

      {mobileOpen && (
        <nav
          id="primary-navigation"
          className="absolute left-0 right-0 top-full max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-t border-white/20 bg-blueprint p-2 shadow-lg xl:hidden"
        >
          <p className="px-3 py-2 text-xs text-white/75 sm:hidden">
            {profile.displayName} · {profile.role.replace("_", " ")}
          </p>
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((link) => {
            const className = `block tracked-label text-xs px-3 py-2.5 rounded ${
              !link.external && isActive(link.href)
                ? "bg-white text-blueprint"
                : "text-white/80 hover:bg-white/10 hover:text-white"
            }`;

            return link.external ? (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                title={`${link.label} — opens in a new tab`}
                onClick={() => setMobileOpen(false)}
                className={className}
              >
                <span className="flex items-center gap-1.5">
                  {link.label}
                  <ExternalLink aria-hidden="true" size={12} strokeWidth={2.2} />
                </span>
              </a>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={className}
                aria-current={isActive(link.href) ? "page" : undefined}
              >
                {link.label}
              </Link>
            );
          })}
            <Link href="/account" onClick={() => setMobileOpen(false)} className="tracked-label rounded px-3 py-2.5 text-xs text-white/80 hover:bg-white/10">Account &amp; settings</Link>
            <Link href="/reports" onClick={() => setMobileOpen(false)} className="tracked-label rounded px-3 py-2.5 text-xs text-white/80 hover:bg-white/10">Reports</Link>
          </div>
        </nav>
      )}
    </header>
  );
}
