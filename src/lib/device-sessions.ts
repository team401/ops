import { collection, deleteDoc, doc, getDoc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { deleteD1Device, fetchDeviceSessions, operationsUseD1, registerD1Device, revokeD1Device } from "@/lib/operations-api";

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
  if (operationsUseD1()) {
    await registerD1Device(id, formatDeviceName(userAgent), userAgent);
    return id;
  }
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
  if (operationsUseD1()) {
    let active = true;
    const check = () => fetchDeviceSessions().then((sessions) => {
      if (active && sessions.find((session) => session.id === deviceId)?.revoked) onRevoked();
    }).catch(() => undefined);
    void check();
    const interval = window.setInterval(check, 15_000);
    return () => { active = false; window.clearInterval(interval); };
  }
  return onSnapshot(doc(db, "userSessions", uid, "devices", deviceId), (snapshot) => {
    if (snapshot.exists() && snapshot.data().revoked === true) onRevoked();
  });
}

export function watchDeviceSessions(uid: string, onChange: (sessions: DeviceSession[]) => void) {
  if (operationsUseD1()) {
    let active = true;
    const load = () => fetchDeviceSessions().then((sessions) => { if (active) onChange(sessions); }).catch(() => { if (active) onChange([]); });
    void load();
    const interval = window.setInterval(load, 30_000);
    return () => { active = false; window.clearInterval(interval); };
  }
  return onSnapshot(
    collection(db, "userSessions", uid, "devices"),
    (snapshot) => onChange(snapshot.docs.map((item) => item.data() as DeviceSession).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))),
    () => onChange([]),
  );
}

export async function revokeDeviceSession(uid: string, deviceId: string) {
  if (operationsUseD1()) return revokeD1Device(deviceId);
  await updateDoc(doc(db, "userSessions", uid, "devices", deviceId), { revoked: true });
}

export async function removeCurrentDeviceSession(uid: string) {
  if (operationsUseD1()) return deleteD1Device(getDeviceId()).catch(() => undefined);
  await deleteDoc(doc(db, "userSessions", uid, "devices", getDeviceId())).catch(() => undefined);
}
