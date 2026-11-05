/// <reference types="@cloudflare/workers-types" />

import webpush from "web-push";

export interface NotificationEnv {
  DB: D1Database;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}

type TaskNotification = { type: string; title: string; body: string; taskId?: string | null };

export function isNotificationRoute(pathname: string) {
  return pathname === "/notifications" || pathname.startsWith("/notifications/") ||
    pathname === "/notification-preferences" || pathname === "/push-subscriptions";
}

export async function handleNotifications(request: Request, env: NotificationEnv, uid: string, cors: Headers) {
  const url = new URL(request.url);
  if (url.pathname === "/notification-preferences") {
    if (request.method === "GET") {
      const preferences = await readPreferences(env.DB, uid);
      return json({ ...preferences, vapidPublicKey: env.VAPID_PUBLIC_KEY ?? null }, 200, cors);
    }
    if (request.method === "PUT") {
      const body = await request.json<Record<string, unknown>>();
      const preferences = { inAppEnabled: body.inAppEnabled !== false, pushEnabled: body.pushEnabled === true };
      await env.DB.prepare(`INSERT INTO notification_preferences (uid, in_app_enabled, push_enabled, updated_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(uid) DO UPDATE SET in_app_enabled=excluded.in_app_enabled, push_enabled=excluded.push_enabled, updated_at=excluded.updated_at`)
        .bind(uid, preferences.inAppEnabled ? 1 : 0, preferences.pushEnabled ? 1 : 0, new Date().toISOString()).run();
      return json({ ...preferences, vapidPublicKey: env.VAPID_PUBLIC_KEY ?? null }, 200, cors);
    }
    return methodNotAllowed(cors, "GET, PUT, OPTIONS");
  }

  if (url.pathname === "/push-subscriptions") {
    if (request.method === "POST") {
      const body = await request.json<Record<string, unknown>>();
      const endpoint = text(body.endpoint);
      const keys = record(body.keys);
      const p256dh = text(keys.p256dh);
      const auth = text(keys.auth);
      if (!endpoint.startsWith("https://") || !p256dh || !auth || endpoint.length > 2000) return json({ error: "Invalid push subscription" }, 400, cors);
      await env.DB.prepare(`INSERT INTO push_subscriptions (endpoint, uid, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(endpoint) DO UPDATE SET uid=excluded.uid, p256dh=excluded.p256dh, auth=excluded.auth`)
        .bind(endpoint, uid, p256dh, auth, new Date().toISOString()).run();
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method === "DELETE") {
      const body = await request.json<Record<string, unknown>>();
      await env.DB.prepare("DELETE FROM push_subscriptions WHERE uid = ? AND endpoint = ?").bind(uid, text(body.endpoint)).run();
      return new Response(null, { status: 204, headers: cors });
    }
    return methodNotAllowed(cors, "POST, DELETE, OPTIONS");
  }

  if (url.pathname === "/notifications" && request.method === "GET") {
    const preferences = await readPreferences(env.DB, uid);
    if (!preferences.inAppEnabled) return json([], 200, cors);
    const result = await env.DB.prepare(`SELECT id, type, title, body, task_id AS taskId, created_at AS createdAt, read_at AS readAt
      FROM notifications WHERE uid = ? ORDER BY created_at DESC LIMIT 50`).bind(uid).all();
    return json(result.results, 200, cors);
  }
  if (url.pathname === "/notifications/read-all" && request.method === "POST") {
    await env.DB.prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE uid = ?").bind(new Date().toISOString(), uid).run();
    return new Response(null, { status: 204, headers: cors });
  }
  const match = url.pathname.match(/^\/notifications\/([A-Za-z0-9_-]+)\/read$/);
  if (match && request.method === "POST") {
    await env.DB.prepare("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND uid = ?").bind(new Date().toISOString(), match[1], uid).run();
    return new Response(null, { status: 204, headers: cors });
  }
  return methodNotAllowed(cors, "GET, POST, OPTIONS");
}

export async function notifyUsers(env: NotificationEnv, recipientUids: string[], notification: TaskNotification) {
  const uniqueUids = [...new Set(recipientUids.filter(Boolean))];
  if (uniqueUids.length === 0) return;
  const createdAt = new Date().toISOString();
  await env.DB.batch(uniqueUids.map((uid) => env.DB.prepare(`INSERT INTO notifications (id, uid, type, title, body, task_id, created_at, read_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`).bind(crypto.randomUUID(), uid, notification.type, notification.title, notification.body, notification.taskId ?? null, createdAt)));

  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) return;
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  const placeholders = uniqueUids.map(() => "?").join(",");
  const subscriptions = await env.DB.prepare(`SELECT endpoint, uid, p256dh, auth FROM push_subscriptions
    WHERE uid IN (${placeholders}) AND uid IN (SELECT uid FROM notification_preferences WHERE push_enabled = 1)`).bind(...uniqueUids).all<{ endpoint: string; uid: string; p256dh: string; auth: string }>();
  await Promise.all(subscriptions.results.map(async (subscription) => {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify(notification));
    } catch (error) {
      const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
      if (statusCode === 404 || statusCode === 410) await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").bind(subscription.endpoint).run();
      else console.error("Push notification failed", error);
    }
  }));
}

async function readPreferences(db: D1Database, uid: string) {
  const row = await db.prepare("SELECT in_app_enabled AS inAppEnabled, push_enabled AS pushEnabled FROM notification_preferences WHERE uid = ?").bind(uid).first<{ inAppEnabled: number; pushEnabled: number }>();
  return { inAppEnabled: row ? row.inAppEnabled === 1 : true, pushEnabled: row ? row.pushEnabled === 1 : false };
}

function text(value: unknown) { return typeof value === "string" ? value : ""; }
function record(value: unknown) { return value && typeof value === "object" ? value as Record<string, unknown> : {}; }
function json(body: unknown, status: number, headers: Headers) { const next = new Headers(headers); next.set("Content-Type", "application/json; charset=utf-8"); return new Response(JSON.stringify(body), { status, headers: next }); }
function methodNotAllowed(headers: Headers, allow: string) { return new Response("Method not allowed", { status: 405, headers: { ...Object.fromEntries(headers), Allow: allow } }); }
