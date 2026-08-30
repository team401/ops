"use client";

import { ReactNode } from "react";
import { RequireAuth } from "@/components/require-auth";
import { NavBar } from "@/components/nav-bar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <NavBar />
      <main className="min-w-0 flex-1 grid-paper">
        <div className="w-full px-3 py-4 sm:px-4 lg:px-5 lg:py-5 xl:px-6 xl:py-6">{children}</div>
      </main>
    </RequireAuth>
  );
}
