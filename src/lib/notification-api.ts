import { apiRequest } from "@/lib/api-request";
import type { NotificationPreferences, OpsNotification } from "@/types";

const request = <T>(path: string, init?: RequestInit) => apiRequest<T>(path, init, "The notification request failed.");

export const fetchNotifications = () => request<OpsNotification[]>("/notifications");
export const fetchNotificationPreferences = () => request<NotificationPreferences>("/notification-preferences");
export const saveNotificationPreferences = (preferences: Pick<NotificationPreferences, "inAppEnabled" | "pushEnabled" | "emailEnabled">) => request<NotificationPreferences>("/notification-preferences", { method: "PUT", body: JSON.stringify(preferences) });
export const markNotificationRead = (id: string) => request<void>(`/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
export const markAllNotificationsRead = () => request<void>("/notifications/read-all", { method: "POST" });
export const dismissNotification = (id: string) => request<void>(`/notifications/${encodeURIComponent(id)}`, { method: "DELETE" });
export const dismissAllNotifications = () => request<void>("/notifications", { method: "DELETE" });
export const savePushSubscription = (subscription: PushSubscription) => request<void>("/push-subscriptions", { method: "POST", body: JSON.stringify(subscription.toJSON()) });
export const deletePushSubscription = (endpoint: string) => request<void>("/push-subscriptions", { method: "DELETE", body: JSON.stringify({ endpoint }) });
export const sendNotificationEmailPreview = () => request<{ sent: boolean; taskCount: number; channels: string[] }>("/notification-email-preview", { method: "POST" });

export function decodeVapidPublicKey(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}
