const baseUrl = () => typeof window !== "undefined" && window.location.hostname.endsWith(".pages.dev")
  ? "/api"
  : process.env.NEXT_PUBLIC_OPS_API_URL?.replace(/\/$/, "");

export async function apiRequest<T>(path: string, init?: RequestInit, fallback = "The Ops data request failed."): Promise<T> {
  const base = baseUrl();
  if (!base) throw new Error("The Ops data service is unavailable.");
  const response = await fetch(`${base}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(body?.error ?? fallback);
  return body as T;
}

export function opsApiUrl() {
  const base = baseUrl();
  if (!base) throw new Error("The Ops data service is unavailable.");
  return base;
}
