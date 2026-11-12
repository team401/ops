import { auth } from "@/lib/firebase";

const baseUrl = () => process.env.NEXT_PUBLIC_OPS_API_URL?.replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit, authenticated = false): Promise<T> {
  const url = baseUrl();
  if (!url) throw new Error("The Ops authentication service is unavailable.");
  const token = authenticated ? await auth.currentUser?.getIdToken() : null;
  if (authenticated && !token) throw new Error("Sign in before approving another device.");
  const response = await fetch(`${url}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const body = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(body?.error ?? "The authentication request failed.");
  return body as T;
}

export interface DeviceLinkStart {
  id: string;
  pollToken: string;
  approvalUrl: string;
  expiresAt: number;
}

export function requestPasswordReset(email: string) {
  return request<{ sent: true }>("/auth/password-reset", { method: "POST", body: JSON.stringify({ email }) });
}

export function beginDeviceLink() {
  return request<DeviceLinkStart>("/auth/device-link", { method: "POST" });
}

export function pollDeviceLink(id: string, token: string) {
  const query = new URLSearchParams({ id, token });
  return request<{ status: "pending" } | { status: "approved"; customToken: string }>(`/auth/device-link?${query}`);
}

export function respondToDeviceLink(id: string, token: string, approve: boolean) {
  return request<{ status: "approved" | "denied" }>("/auth/device-link", {
    method: approve ? "PATCH" : "DELETE",
    body: JSON.stringify({ id, token }),
  }, true);
}
