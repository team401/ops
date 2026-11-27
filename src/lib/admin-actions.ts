import type { Role, Subteam, Certification } from "@/types";
import { createD1Certification, deleteD1Certification, fetchCertifications, updateD1Certification } from "@/lib/certification-api";
import { deleteD1User, fetchUser, saveUser } from "@/lib/core-api";

export async function updateUserRoleAndSubteam(
  uid: string,
  changes: { role?: Role; subteam?: Subteam | null }
) {
  const user = await fetchUser(uid);
  await saveUser({ ...user, ...changes });
}

export async function deleteUserProfile(uid: string) {
  // Removes local Ops access. Team 401 Auth owns the central account.
  return deleteD1User(uid);
}

export async function grantCertification(uid: string, certificationId: string) {
  const user = await fetchUser(uid);
  await saveUser({ ...user, certificationIds: [...new Set([...user.certificationIds, certificationId])] });
}

export async function revokeCertification(uid: string, certificationId: string) {
  const user = await fetchUser(uid);
  await saveUser({ ...user, certificationIds: user.certificationIds.filter((id) => id !== certificationId) });
}

export async function createCertification(cert: Omit<Certification, "id">) {
  const full: Certification = { ...cert, id: crypto.randomUUID() };
  return createD1Certification(full);
}

export async function updateCertification(
  certId: string,
  changes: Partial<Omit<Certification, "id">>
) {
  const current = await fetchCertifications();
  const certification = current.find((item) => item.id === certId);
  if (!certification) throw new Error("Certification not found.");
  await updateD1Certification({ ...certification, ...changes });
}

export async function deleteCertification(certId: string) {
  return deleteD1Certification(certId);
}
