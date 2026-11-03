import { collection, deleteDoc, doc, getDoc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface DeviceSession {
  id: string;
  label: string;
  userAgent: string;
  createdAt: string;
  lastSeenAt: string;
  revoked: boolean;
}

const DEVICE_ID_KEY = "team401-ops-device-id";

export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function formatDeviceName(userAgent: string) {
  const platform = /iPhone|iPad/.test(userAgent) ? (/iPad/.test(userAgent) ? "iPad" : "iPhone")
    : /Android/.test(userAgent) ? "Android" : /Windows/.test(userAgent) ? "Windows"
      : /Macintosh|Mac OS/.test(userAgent) ? "Mac" : /Linux/.test(userAgent) ? "Linux" : "device";
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Firefox\//.test(userAgent) ? "Firefox"
    : /CriOS|Chrome\//.test(userAgent) ? "Chrome" : /Safari\//.test(userAgent) ? "Safari" : "Browser";
  return `${browser} on ${platform}`;
}

export async function registerDeviceSession(uid: string) {
  const id = getDeviceId();
  const ref = doc(db, "userSessions", uid, "devices", id);
  const existing = await getDoc(ref);
  const now = new Date().toISOString();
  const userAgent = navigator.userAgent;
  await setDoc(ref, {
    id,
    label: formatDeviceName(userAgent),
    userAgent,
    createdAt: existing.data()?.createdAt ?? now,
    lastSeenAt: now,
    revoked: false,
  } satisfies DeviceSession);
  return id;
}

export function watchDeviceRevocation(uid: string, deviceId: string, onRevoked: () => void) {
  return onSnapshot(doc(db, "userSessions", uid, "devices", deviceId), (snapshot) => {
    if (snapshot.exists() && snapshot.data().revoked === true) onRevoked();
  });
}

export function watchDeviceSessions(uid: string, onChange: (sessions: DeviceSession[]) => void) {
  return onSnapshot(
    collection(db, "userSessions", uid, "devices"),
    (snapshot) => onChange(snapshot.docs.map((item) => item.data() as DeviceSession).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))),
    () => onChange([]),
  );
}

export async function revokeDeviceSession(uid: string, deviceId: string) {
  await updateDoc(doc(db, "userSessions", uid, "devices", deviceId), { revoked: true });
}

export async function removeCurrentDeviceSession(uid: string) {
  await deleteDoc(doc(db, "userSessions", uid, "devices", getDeviceId())).catch(() => undefined);
}
