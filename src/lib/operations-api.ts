import { auth } from "@/lib/firebase";
import type { CalendarEvent, TimeEntry, TimeclockActivity, TimeclockPin } from "@/types";

const baseUrl = () => process.env.NEXT_PUBLIC_OPS_API_URL?.replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!baseUrl() || !token) throw new Error("The Ops data service is unavailable.");
  const response = await fetch(`${baseUrl()}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers } });
  if (response.status === 204) return undefined as T;
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "The Ops data request failed.");
  return body;
}

function changed(domain: string) { window.dispatchEvent(new Event(`ops:${domain}-changed`)); }
export const fetchCalendarEvents = () => request<CalendarEvent[]>("/calendar-events");
export async function saveCalendarEvent(event: CalendarEvent, create: boolean) { const result = await request<CalendarEvent>(create ? "/calendar-events" : `/calendar-events/${encodeURIComponent(event.id)}`, { method: create ? "POST" : "PUT", body: JSON.stringify(event) }); changed("calendar"); return result; }
export async function deleteD1CalendarEvent(id: string) { await request<void>(`/calendar-events/${encodeURIComponent(id)}`, { method: "DELETE" }); changed("calendar"); }

export const fetchTimeEntries = (all: boolean) => request<TimeEntry[]>(`/time-entries${all ? "?scope=all" : ""}`);
export async function createD1TimeEntry(uid: string, activity: TimeclockActivity, activityName: string) { const result = await request<TimeEntry>("/time-entries", { method: "POST", body: JSON.stringify({ uid, activity, activityName }) }); changed("time"); return result; }
export async function clockOutD1Entry(id: string) { await request<void>(`/time-entries/${encodeURIComponent(id)}`, { method: "PUT" }); changed("time"); }
export async function clockOutD1Entries(ids: string[]) { await request<void>("/time-entries/clock-out-all", { method: "POST", body: JSON.stringify({ ids }) }); changed("time"); }

export const fetchTimeclockPins = () => request<TimeclockPin[]>("/timeclock-pins");
export async function lookupD1Pin(pin: string) { return (await request<{ uid: string | null }>(`/timeclock-pins?pin=${encodeURIComponent(pin)}`)).uid; }
export async function setD1Pin(uid: string, pin: string) { await request<void>(`/timeclock-pins/${encodeURIComponent(uid)}`, { method: "PUT", body: JSON.stringify({ pin }) }); changed("pins"); }
export async function deleteD1Pin(uid: string) { await request<void>(`/timeclock-pins/${encodeURIComponent(uid)}`, { method: "DELETE" }); changed("pins"); }

export interface D1DeviceSession { id: string; label: string; userAgent: string; createdAt: string; lastSeenAt: string; revoked: boolean }
export const fetchDeviceSessions = () => request<D1DeviceSession[]>("/device-sessions");
export const registerD1Device = (id: string, label: string, userAgent: string) => request<void>(`/device-sessions/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ label, userAgent }) });
export const revokeD1Device = (id: string) => request<void>(`/device-sessions/${encodeURIComponent(id)}`, { method: "POST" });
export const deleteD1Device = (id: string) => request<void>(`/device-sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
