"use client";

import { ReactNode } from "react";
import { AppShell as Team401AppShell, PageContent } from "@team401/web-ui";
import { RequireAuth } from "@/components/require-auth";
import { NavBar } from "@/components/nav-bar";

export function AppShell({ children, lockDesktopViewport = false }: { children: ReactNode; lockDesktopViewport?: boolean }) {
  return (
    <RequireAuth>
      <Team401AppShell className="min-h-0 flex-1 flex-col">
        <NavBar />
        <PageContent
          style={lockDesktopViewport ? { width: "100%", maxWidth: "none" } : undefined}
          className={`grid-paper flex min-h-0 max-w-none flex-1 flex-col px-3 py-4 sm:px-4 lg:px-5 lg:py-5 xl:px-6 xl:py-6 ${lockDesktopViewport ? "xl:h-[calc(100dvh-3.5rem)] xl:flex-none xl:overflow-hidden" : ""}`}
        >
          {children}
        </PageContent>
      </Team401AppShell>
    </RequireAuth>
  );
}
