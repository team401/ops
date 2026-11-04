import { deleteD1Device, fetchDeviceSessions, registerD1Device, revokeD1Device } from "@/lib/operations-api";

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
  void uid;
  const id = getDeviceId();
  const userAgent = navigator.userAgent;
  await registerD1Device(id, formatDeviceName(userAgent), userAgent);
  return id;
}

export function watchDeviceRevocation(uid: string, deviceId: string, onRevoked: () => void) {
  void uid;
  let active = true;
  const check = () => fetchDeviceSessions().then((sessions) => {
    if (active && sessions.find((session) => session.id === deviceId)?.revoked) onRevoked();
  }).catch(() => undefined);
  void check();
  const interval = window.setInterval(check, 15_000);
  return () => { active = false; window.clearInterval(interval); };
}

export function watchDeviceSessions(uid: string, onChange: (sessions: DeviceSession[]) => void) {
  void uid;
  let active = true;
  const load = () => fetchDeviceSessions().then((sessions) => { if (active) onChange(sessions); }).catch(() => { if (active) onChange([]); });
  void load();
  const interval = window.setInterval(load, 30_000);
  return () => { active = false; window.clearInterval(interval); };
}

export async function revokeDeviceSession(uid: string, deviceId: string) {
  void uid;
  return revokeD1Device(deviceId);
}

export async function removeCurrentDeviceSession(uid: string) {
  void uid;
  return deleteD1Device(getDeviceId()).catch(() => undefined);
}
