"use client";

import { useState, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { KioskGuard } from "@/components/kiosk-guard";
import { AuthRouteGuard } from "@/components/auth-route-guard";
import { AuthProvider } from "@/context/auth-context";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AuthRouteGuard><KioskGuard>{children}</KioskGuard></AuthRouteGuard>
      </AuthProvider>
    </QueryClientProvider>
  );
}
