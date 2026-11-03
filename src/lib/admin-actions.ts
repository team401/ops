import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  deleteUser,
  signOut as secondarySignOut,
} from "firebase/auth";
import { doc, setDoc, updateDoc, deleteDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import app, { db } from "@/lib/firebase";
import type { Role, Subteam, UserProfile, Certification } from "@/types";
import { assignAvailableTimeclockPin, removeTimeclockPin } from "@/lib/timeclock-actions";
import { certificationsUseD1, createD1Certification, deleteD1Certification, fetchCertifications, updateD1Certification } from "@/lib/certification-api";

function randomTempPassword() {
  // Readable-ish temp password: e.g. "shop-4821-forge". Coach hands this to
  // the student, who is forced to replace it on first login.
  const words = ["shop", "forge", "gear", "volt", "torque", "weld", "drill", "pivot"];
  const w1 = words[Math.floor(Math.random() * words.length)];
  const w2 = words[Math.floor(Math.random() * words.length)];
  const n = Math.floor(1000 + Math.random() * 9000);
  return `${w1}-${n}-${w2}`;
}

interface CreateAccountInput {
  displayName: string;
  email: string;
  role: Role;
  subteam: Subteam | null;
}

export async function createAccount(input: CreateAccountInput) {
  const tempPassword = randomTempPassword();

  // Use a throwaway secondary app + auth instance so this createUser call
  // doesn't switch the current browser session (the coach) over to the new
  // account. This is the standard client-side workaround for the fact that
  // createUserWithEmailAndPassword always signs in as the new user.
  const secondaryApp = initializeApp(app.options, `secondary-${Date.now()}`);
  const secondaryAuth = getAuth(secondaryApp);

  try {
    const cred = await createUserWithEmailAndPassword(
      secondaryAuth,
      input.email,
      tempPassword
    );
    const uid = cred.user.uid;

    const profile: UserProfile = {
      uid,
      displayName: input.displayName,
      email: input.email,
      role: input.role,
      subteam: input.subteam,
      certificationIds: [],
      createdAt: new Date().toISOString(),
      mustResetPassword: true,
    };

    let timeclockPin: string;
    try {
      // Written with the coach's own (still-authenticated, main-app)
      // Firestore instance, so these writes are subject to the normal rules.
      await setDoc(doc(db, "users", uid), profile);
      timeclockPin = await assignAvailableTimeclockPin(uid);
    } catch (firestoreError) {
      // Account creation is all-or-nothing from the UI's perspective. Remove
      // any partial PIN/profile/Auth records so retrying is safe.
      await removeTimeclockPin(uid).catch(() => {});
      await deleteDoc(doc(db, "users", uid)).catch(() => {});
      await deleteUser(cred.user).catch(() => {});
      throw firestoreError;
    }

    await secondarySignOut(secondaryAuth).catch(() => {});
    return { uid, tempPassword, timeclockPin };
  } finally {
    await deleteApp(secondaryApp);
  }
}

export async function updateUserRoleAndSubteam(
  uid: string,
  changes: { role?: Role; subteam?: Subteam | null }
) {
  await updateDoc(doc(db, "users", uid), changes);
}

export async function deleteUserProfile(uid: string) {
  // Note: this removes the Firestore profile (so they lose access and drop
  // off rosters/boards) but not the underlying Firebase Auth account, which
  // requires the Admin SDK to delete from a client app. If you need the
  // login itself fully revoked, remove the user from Authentication > Users
  // in the Firebase console as well.
  await deleteDoc(doc(db, "users", uid));
}

export async function grantCertification(uid: string, certificationId: string) {
  await updateDoc(doc(db, "users", uid), {
    certificationIds: arrayUnion(certificationId),
  });
}

export async function revokeCertification(uid: string, certificationId: string) {
  await updateDoc(doc(db, "users", uid), {
    certificationIds: arrayRemove(certificationId),
  });
}

export async function createCertification(cert: Omit<Certification, "id">) {
  const ref = doc(db, "certifications", crypto.randomUUID());
  const full: Certification = { ...cert, id: ref.id };
  if (certificationsUseD1()) return createD1Certification(full);
  await setDoc(ref, full);
  return full;
}

export async function updateCertification(
  certId: string,
  changes: Partial<Omit<Certification, "id">>
) {
  if (certificationsUseD1()) {
    const current = await fetchCertifications();
    const certification = current.find((item) => item.id === certId);
    if (!certification) throw new Error("Certification not found.");
    await updateD1Certification({ ...certification, ...changes });
    return;
  }
  await updateDoc(doc(db, "certifications", certId), changes);
}

export async function deleteCertification(certId: string) {
  if (certificationsUseD1()) return deleteD1Certification(certId);
  await deleteDoc(doc(db, "certifications", certId));
}
