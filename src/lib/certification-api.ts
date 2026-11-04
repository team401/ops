import { auth } from "@/lib/firebase";
import type { Certification } from "@/types";

function apiUrl() {
  return process.env.NEXT_PUBLIC_OPS_API_URL?.replace(/\/$/, "");
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = apiUrl();
  const token = await auth.currentUser?.getIdToken();
  if (!baseUrl || !token) throw new Error("The Ops data service is unavailable.");
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "The Ops data request failed.");
  return body;
}

export function fetchCertifications() {
  return request<Certification[]>("/certifications");
}

function notifyCertificationChange() {
  window.dispatchEvent(new Event("ops:certifications-changed"));
}

export async function createD1Certification(certification: Certification) {
  const result = await request<Certification>("/certifications", { method: "POST", body: JSON.stringify(certification) });
  notifyCertificationChange();
  return result;
}

export async function updateD1Certification(certification: Certification) {
  const result = await request<Certification>(`/certifications/${encodeURIComponent(certification.id)}`, { method: "PUT", body: JSON.stringify(certification) });
  notifyCertificationChange();
  return result;
}

export async function deleteD1Certification(id: string) {
  await request<void>(`/certifications/${encodeURIComponent(id)}`, { method: "DELETE" });
  notifyCertificationChange();
}
