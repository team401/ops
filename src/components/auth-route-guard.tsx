"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { withBasePath } from "@/lib/base-path";

function isPublicPath(pathname: string) {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return normalized === "/" || normalized === "/login";
}

export function AuthRouteGuard({ children }: { children: ReactNode }) {
  const { firebaseUser, loading } = useAuth();
  const pathname = usePathname();
  const publicPath = isPublicPath(pathname);
  const mustSignIn = !loading && !firebaseUser && !publicPath;

  useEffect(() => {
    if (mustSignIn) window.location.replace(withBasePath("/login/"));
  }, [mustSignIn]);

  if (loading && !publicPath) {
    return <main className="flex flex-1 items-center justify-center"><p className="tracked-label text-sm text-steel">Loading…</p></main>;
  }

  if (mustSignIn) {
    return <main className="flex flex-1 items-center justify-center"><p className="tracked-label text-sm text-steel">Redirecting to sign in…</p></main>;
  }

  return <>{children}</>;
}

