import { apiRequest } from "@/lib/api-request";
import type { Certification } from "@/types";

const request = apiRequest;

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
