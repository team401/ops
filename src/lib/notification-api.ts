import { auth } from "@/lib/firebase";
import type { NotificationPreferences, OpsNotification } from "@/types";

const baseUrl = () => process.env.NEXT_PUBLIC_OPS_API_URL?.replace(/\/$/, "");

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  if (!baseUrl() || !token) throw new Error("The notification service is unavailable.");
  const response = await fetch(`${baseUrl()}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers } });
  if (response.status === 204) return undefined as T;
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "The notification request failed.");
  return body;
}

export const fetchNotifications = () => request<OpsNotification[]>("/notifications");
export const fetchNotificationPreferences = () => request<NotificationPreferences>("/notification-preferences");
export const saveNotificationPreferences = (preferences: Pick<NotificationPreferences, "inAppEnabled" | "pushEnabled" | "emailEnabled">) => request<NotificationPreferences>("/notification-preferences", { method: "PUT", body: JSON.stringify(preferences) });
export const markNotificationRead = (id: string) => request<void>(`/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
export const markAllNotificationsRead = () => request<void>("/notifications/read-all", { method: "POST" });
export const savePushSubscription = (subscription: PushSubscription) => request<void>("/push-subscriptions", { method: "POST", body: JSON.stringify(subscription.toJSON()) });
export const deletePushSubscription = (endpoint: string) => request<void>("/push-subscriptions", { method: "DELETE", body: JSON.stringify({ endpoint }) });
export const sendNotificationEmailPreview = () => request<{ sent: boolean; taskCount: number; channels: string[] }>("/notification-email-preview", { method: "POST" });

export function decodeVapidPublicKey(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}
