"use client";

import { useState } from "react";
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
  const { profile, isCoach, isStudentLeader, signOut } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!profile) return null;

  const canSeeMetrics = isCoach || isStudentLeader;

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
    ...(canSeeMetrics ? [{ href: "/metrics", label: "Metrics" }] : []),
    { href: "/reports", label: "Reports" },
    ...(isCoach ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <header className="border-b border-steel-line bg-paper-raised">
      <div className="w-full px-4 sm:px-6 flex items-center h-14 gap-3">
        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="md:hidden text-steel p-1 -ml-1"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        <Link
          href="/board"
          className="tracked-label shrink-0 text-xs font-bold text-blueprint hover:text-blueprint-deep"
        >
          401 Ops
        </Link>

        <nav className="hidden md:flex items-center gap-1 flex-1 overflow-x-auto">
          {links.map((link) => {
            const className = `tracked-label text-xs px-3 py-2 rounded whitespace-nowrap ${
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
              <Link key={link.href} href={link.href} className={className}>
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 whitespace-nowrap ml-auto md:ml-0">
          <span className="text-sm text-steel hidden sm:inline">
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
        <nav className="md:hidden border-t border-steel-line bg-paper-raised px-2 py-2">
          <p className="text-xs text-steel px-2 py-1 sm:hidden">
            {profile.displayName} · {profile.role.replace("_", " ")}
          </p>
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
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
