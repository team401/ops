"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";

export default function RootPage() {
  const { authUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(authUser ? "/board" : "/login");
  }, [loading, authUser, router]);

  return (
    <main className="flex-1 flex items-center justify-center">
      <p className="tracked-label text-sm text-steel">Loading…</p>
    </main>
  );
}
