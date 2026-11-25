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

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export async function centralPasswordSignIn(email: string, password: string) {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const state = base64Url(crypto.getRandomValues(new Uint8Array(24)));
  const production = location.hostname === "ops.team401.org";
  const authOrigin = process.env.NEXT_PUBLIC_AUTH_SERVICE_URL ?? (production ? "https://auth.team401.org" : "https://auth-staging.team401.org");
  const redirectUri = `${location.origin}/auth/callback`;
  const authorization = await fetch(`${authOrigin}/api/in-situ/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ application: "ops", email, password, redirectUri, state, codeChallenge: challenge }),
  });
  const result = await authorization.json().catch(() => null) as { code?: string; state?: string } | null;
  if (!authorization.ok || !result?.code || result.state !== state) throw new Error("Invalid email or password.");
  return request<{ customToken: string }>("/auth/central-exchange", {
    method: "POST",
    body: JSON.stringify({ code: result.code, codeVerifier: verifier, redirectUri }),
  });
}
