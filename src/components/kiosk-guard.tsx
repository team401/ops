"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import {
  clearKioskSession,
  getKioskSession,
  subscribeToKioskSession,
} from "@/lib/kiosk-session";

function isTimeclockPath(pathname: string) {
  return pathname === "/timeclock" || pathname === "/timeclock/";
}

export function KioskGuard({ children }: { children: ReactNode }) {
  const { authUser, profile, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [kioskActive, setKioskActive] = useState(false);

  useEffect(() => {
    function syncKioskState() {
      setKioskActive(Boolean(getKioskSession()));
      setChecked(true);
    }

    syncKioskState();
    return subscribeToKioskSession(syncKioskState);
  }, []);

  useEffect(() => {
    if (!checked || loading || !kioskActive) return;

    // A kiosk lock must never survive a coach sign-out or become attached to
    // a non-coach session that later uses the same browser tab.
    if (!authUser || profile?.role !== "coach") {
      clearKioskSession();
      return;
    }

    if (!isTimeclockPath(pathname)) {
      router.replace("/timeclock", { scroll: false });
    }
  }, [checked, authUser, kioskActive, loading, pathname, profile, router]);

  // Check sessionStorage before showing any route. Once locked, hide every
  // route reached through Back/Forward while its URL is replaced with the
  // timeclock. This avoids flashing privileged coach content during redirect.
  if (!checked) {
    return (
      <main className="fixed inset-0 z-[100] grid place-items-center bg-paper grid-paper">
        <p className="tracked-label text-sm text-steel">Loading…</p>
      </main>
    );
  }

  if (kioskActive && !isTimeclockPath(pathname)) {
    return (
      <main className="fixed inset-0 z-[100] grid place-items-center bg-paper grid-paper">
        <div className="rounded border border-steel-line bg-paper-raised px-6 py-5 text-center shadow-sm">
          <p className="tracked-label text-[10px] font-bold text-blueprint">Timeclock kiosk</p>
          <p className="mt-2 text-sm text-steel">Returning to the locked timeclock…</p>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
