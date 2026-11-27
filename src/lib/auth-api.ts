import type { AuthorizationExchange } from "@team401/web-ui";
import { apiRequest } from "@/lib/api-request";

export interface AuthUser {
  uid: string;
  email: string;
  displayName: string;
}

export interface DeviceLinkStart {
  id: string;
  pollToken: string;
  approvalUrl: string;
  expiresAt: number;
}

type SessionIdentity = { memberId: string; email: string; displayName: string };

function user(identity: SessionIdentity): AuthUser {
  return { uid: identity.memberId, email: identity.email, displayName: identity.displayName };
}

export async function fetchAuthSession() {
  try {
    const result = await apiRequest<{ user: SessionIdentity }>("/auth/session", { cache: "no-store" });
    return user(result.user);
  } catch {
    return null;
  }
}

export async function completeCentralSignIn({ code, codeVerifier, redirectUri }: AuthorizationExchange) {
  const result = await apiRequest<{ user: SessionIdentity }>("/auth/session", {
    method: "POST",
    body: JSON.stringify({ code, codeVerifier, redirectUri }),
  }, "Central sign-in could not be completed.");
  return user(result.user);
}

export function signOutSession() {
  return apiRequest<{ signedOut: true }>("/auth/session", { method: "DELETE" });
}

export function requestPasswordReset(email: string) {
  return apiRequest<{ requested: true }>("/auth/session/password-reset", { method: "POST", body: JSON.stringify({ email }) });
}

export function beginDeviceLink() {
  return apiRequest<DeviceLinkStart>("/auth/session/device-link", { method: "POST" });
}

export function pollDeviceLink(id: string, token: string) {
  const query = new URLSearchParams({ id, token });
  return apiRequest<{ status: "pending" | "authenticated" }>(`/auth/session/device-link?${query}`, { cache: "no-store" });
}

export function respondToDeviceLink(id: string, token: string, approve: boolean) {
  return apiRequest<{ approved?: true; denied?: true; email?: string }>("/auth/session/device-link", {
    method: approve ? "PATCH" : "DELETE",
    body: JSON.stringify({ id, token }),
  });
}
