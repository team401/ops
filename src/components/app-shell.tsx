"use client";

import { ReactNode } from "react";
import { RequireAuth } from "@/components/require-auth";
import { NavBar } from "@/components/nav-bar";

export function AppShell({ children, lockDesktopViewport = false }: { children: ReactNode; lockDesktopViewport?: boolean }) {
  return (
    <RequireAuth>
      <NavBar />
      <main className={`grid-paper flex min-h-0 min-w-0 flex-1 flex-col ${lockDesktopViewport ? "xl:h-[calc(100dvh-3.5rem)] xl:flex-none xl:overflow-hidden" : ""}`}>
        <div className="flex w-full min-h-0 flex-1 flex-col px-3 py-4 sm:px-4 lg:px-5 lg:py-5 xl:px-6 xl:py-6">{children}</div>
      </main>
    </RequireAuth>
  );
}
