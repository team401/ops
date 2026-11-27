"use client";

import { ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { authUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !authUser) {
      router.replace("/login");
    }
  }, [loading, authUser, router]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="tracked-label text-sm text-steel">Loading…</p>
      </div>
    );
  }

  if (!authUser) return null;

  return <>{children}</>;
}
