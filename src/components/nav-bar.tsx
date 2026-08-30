"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useAuth } from "@/context/auth-context";

type NavLink = {
  href: string;
  label: string;
  external?: boolean;
};

export function NavBar() {
  const { profile, isCoach, signOut } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

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
    { href: "https://team401.org/export/", label: "Parts", external: true },
    { href: "/inventory", label: "Inventory" },
    { href: "/certifications", label: "Certifications" },
    ...(isCoach ? [{ href: "/metrics", label: "Metrics" }] : []),
    { href: "/reports", label: "Reports" },
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
    <header className="relative z-50 border-b border-steel-line bg-paper-raised">
      <div className="flex h-14 w-full items-center gap-3 px-3 sm:px-4 xl:px-6">
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="-ml-1 flex min-h-10 min-w-10 items-center justify-center rounded text-steel hover:bg-paper xl:hidden"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          aria-controls="primary-navigation"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <Link
          href="/board"
          className="tracked-label shrink-0 text-xs font-bold text-blueprint hover:text-blueprint-deep"
        >
          401 Ops
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto xl:flex">
          {links.map((link) => {
            const className = `tracked-label whitespace-nowrap rounded px-2.5 py-2 text-[11px] 2xl:px-3 2xl:text-xs ${
              !link.external && isActive(link.href)
                ? "bg-blueprint text-white"
                : "text-steel hover:text-ink"
            }`;

            return link.external ? (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className={className}
              >
                {link.label}
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

        <div className="ml-auto flex items-center gap-2 whitespace-nowrap xl:ml-0 2xl:gap-3">
          <span className="hidden max-w-56 truncate text-sm text-steel sm:inline xl:hidden 2xl:inline">
            {profile.displayName}
            <span className="tracked-label text-[10px] ml-2 text-blueprint">
              {profile.role.replace("_", " ")}
            </span>
          </span>
          <button onClick={() => signOut()} className="btn-secondary text-xs px-2 py-1">
            Sign out
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav
          id="primary-navigation"
          className="absolute left-0 right-0 top-full max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-t border-steel-line bg-paper-raised p-2 shadow-lg xl:hidden"
        >
          <p className="px-3 py-2 text-xs text-steel sm:hidden">
            {profile.displayName} · {profile.role.replace("_", " ")}
          </p>
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((link) => {
            const className = `block tracked-label text-xs px-3 py-2.5 rounded ${
              !link.external && isActive(link.href) ? "bg-blueprint text-white" : "text-steel"
            }`;

            return link.external ? (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileOpen(false)}
                className={className}
              >
                {link.label}
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
          </div>
        </nav>
      )}
    </header>
  );
}
