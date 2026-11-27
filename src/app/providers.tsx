"use client";

import { useState, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "@team401/web-ui";
import { KioskGuard } from "@/components/kiosk-guard";
import { AuthRouteGuard } from "@/components/auth-route-guard";
import { AuthProvider } from "@/context/auth-context";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <AuthRouteGuard><KioskGuard>{children}</KioskGuard></AuthRouteGuard>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
