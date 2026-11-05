/// <reference types="@cloudflare/workers-types" />

import webpush from "web-push";

export interface NotificationEnv {
  DB: D1Database;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
}

type TaskNotification = { type: string; title: string; body: string; taskId?: string | null };
type DigestTask = { id: string; title: string; status: string; priority: string; dueDate: string | null; assigneeUids: string[]; archived: boolean };

export function isNotificationRoute(pathname: string) {
  return pathname === "/notifications" || pathname.startsWith("/notifications/") ||
    pathname === "/notification-preferences" || pathname === "/notification-email-preview" || pathname === "/push-subscriptions";
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
      const preferences = { inAppEnabled: body.inAppEnabled !== false, pushEnabled: body.pushEnabled === true, emailEnabled: body.emailEnabled === true };
      await env.DB.prepare(`INSERT INTO notification_preferences (uid, in_app_enabled, push_enabled, email_enabled, updated_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(uid) DO UPDATE SET in_app_enabled=excluded.in_app_enabled, push_enabled=excluded.push_enabled,
          email_enabled=excluded.email_enabled, updated_at=excluded.updated_at`)
        .bind(uid, preferences.inAppEnabled ? 1 : 0, preferences.pushEnabled ? 1 : 0, preferences.emailEnabled ? 1 : 0, new Date().toISOString()).run();
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

  if (url.pathname === "/notification-email-preview") {
    if (request.method !== "POST") return methodNotAllowed(cors, "POST, OPTIONS");
    if (!env.RESEND_API_KEY || !env.RESEND_FROM) return json({ error: "Email delivery is not configured" }, 503, cors);
    const recipient = await env.DB.prepare(`SELECT u.email, u.display_name AS displayName, p.last_email_preview_at AS lastPreviewAt
      FROM users u LEFT JOIN notification_preferences p ON p.uid = u.uid WHERE u.uid = ?`)
      .bind(uid).first<{ email: string; displayName: string; lastPreviewAt: string | null }>();
    if (!recipient?.email) return json({ error: "Your account does not have an email address" }, 400, cors);
    if (recipient.lastPreviewAt && Date.now() - new Date(recipient.lastPreviewAt).getTime() < 60_000) {
      return json({ error: "Wait a minute before sending another preview" }, 429, cors);
    }
    const tasks = await assignedTasks(env.DB, uid);
    await sendDigestEmail(env, recipient, tasks, true);
    const preferences = await readPreferences(env.DB, uid);
    if (preferences.inAppEnabled || preferences.pushEnabled) {
      await notifyUsers(env, [uid], {
        type: "preview",
        title: "Notification preview",
        body: `Your daily summary currently includes ${tasks.length} assigned task${tasks.length === 1 ? "" : "s"}.`,
      });
    }
    await env.DB.prepare(`INSERT INTO notification_preferences (uid, in_app_enabled, push_enabled, email_enabled, updated_at, last_email_preview_at)
      VALUES (?, 1, 0, 0, ?, ?) ON CONFLICT(uid) DO UPDATE SET last_email_preview_at=excluded.last_email_preview_at`)
      .bind(uid, new Date().toISOString(), new Date().toISOString()).run();
    const channels = ["email", ...(preferences.inAppEnabled ? ["in-app"] : []), ...(preferences.pushEnabled ? ["push"] : [])];
    return json({ sent: true, taskCount: tasks.length, channels }, 200, cors);
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
  const row = await db.prepare("SELECT in_app_enabled AS inAppEnabled, push_enabled AS pushEnabled, email_enabled AS emailEnabled FROM notification_preferences WHERE uid = ?").bind(uid).first<{ inAppEnabled: number; pushEnabled: number; emailEnabled: number }>();
  return { inAppEnabled: row ? row.inAppEnabled === 1 : true, pushEnabled: row ? row.pushEnabled === 1 : false, emailEnabled: row ? row.emailEnabled === 1 : false };
}

export async function sendDailyEmailDigests(env: NotificationEnv) {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) return;
  const recipients = await env.DB.prepare(`SELECT p.uid, u.email, u.display_name AS displayName, p.last_email_digest_at AS lastDigestAt
    FROM notification_preferences p JOIN users u ON u.uid = p.uid
    WHERE p.email_enabled = 1 AND u.email <> ''`).all<{ uid: string; email: string; displayName: string; lastDigestAt: string | null }>();
  const completedAt = new Date().toISOString();
  await Promise.all(recipients.results.map(async (recipient) => {
    const tasks = await assignedTasks(env.DB, recipient.uid);
    if (tasks.length === 0) {
      await markDigestComplete(env.DB, recipient.uid, completedAt);
      return;
    }
    await sendDigestEmail(env, recipient, tasks, false);
    await markDigestComplete(env.DB, recipient.uid, completedAt);
  }));
}

async function assignedTasks(db: D1Database, uid: string) {
  const taskRows = await db.prepare("SELECT data FROM tasks WHERE archived = 0 AND status <> 'done'").all<{ data: string }>();
  return taskRows.results.flatMap((row) => {
    try { return [JSON.parse(row.data) as DigestTask]; } catch { return []; }
  }).filter((task) => Array.isArray(task.assigneeUids) && task.assigneeUids.includes(uid)).sort(compareDigestTasks).slice(0, 25);
}

async function sendDigestEmail(env: NotificationEnv, recipient: { email: string; displayName: string }, tasks: DigestTask[], preview: boolean) {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM) throw new Error("Email delivery is not configured");
  const dueSoonCount = tasks.filter((task) => task.dueDate && daysUntil(task.dueDate) <= 7).length;
  const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.RESEND_FROM,
        to: [recipient.email],
        subject: `${preview ? "Preview · " : ""}${tasks.length} assigned Ops task${tasks.length === 1 ? "" : "s"}${dueSoonCount ? ` · ${dueSoonCount} due soon` : ""}`,
        text: digestText(recipient.displayName, tasks),
        html: digestHtml(recipient.displayName, tasks),
      }),
    });
  if (!response.ok) throw new Error(`Resend digest failed with ${response.status}`);
}

function markDigestComplete(db: D1Database, uid: string, completedAt: string) {
  return db.prepare("UPDATE notification_preferences SET last_email_digest_at = ? WHERE uid = ?").bind(completedAt, uid).run();
}

function compareDigestTasks(a: DigestTask, b: DigestTask) {
  const dueDifference = dueTimestamp(a.dueDate) - dueTimestamp(b.dueDate);
  if (dueDifference !== 0) return dueDifference;
  return priorityRank(a.priority) - priorityRank(b.priority) || a.title.localeCompare(b.title);
}

function dueTimestamp(dueDate: string | null) { return dueDate ? new Date(dueDate).getTime() : Number.MAX_SAFE_INTEGER; }
function priorityRank(priority: string) { return priority === "high" ? 0 : priority === "medium" ? 1 : 2; }
function daysUntil(dueDate: string) { return Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86_400_000); }

function dueLabel(dueDate: string | null) {
  if (!dueDate) return "No due date";
  const days = daysUntil(dueDate);
  const date = new Date(dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  if (days < 0) return `OVERDUE · ${date}`;
  if (days === 0) return `DUE TODAY · ${date}`;
  if (days === 1) return `DUE TOMORROW · ${date}`;
  return days <= 7 ? `DUE IN ${days} DAYS · ${date}` : `Due ${date}`;
}

function digestText(displayName: string, tasks: DigestTask[]) {
  if (tasks.length === 0) return `Hi ${displayName},\n\nYou have no open assigned tasks right now.\n\nOpen My Tasks: https://ops.team401.org/my-tasks`;
  const items = tasks.map((task) => `${dueLabel(task.dueDate)} — ${task.title}\n${statusLabel(task.status)} · ${task.priority} priority`).join("\n\n");
  return `Hi ${displayName},\n\nHere are your open assigned tasks, ordered by due date:\n\n${items}\n\nOpen My Tasks: https://ops.team401.org/my-tasks`;
}

function digestHtml(displayName: string, tasks: DigestTask[]) {
  const items = tasks.map((task) => {
    const urgent = task.dueDate && daysUntil(task.dueDate) <= 7;
    return `<div style="border-left:4px solid ${urgent ? "#a51d3d" : "#8d214d"};background:${urgent ? "#fff3f3" : "#f6f3f4"};padding:12px 14px;margin:0 0 10px"><div style="font-size:12px;font-weight:700;color:${urgent ? "#a51d3d" : "#6b6470"};text-transform:uppercase">${escapeHtml(dueLabel(task.dueDate))}</div><div style="font-size:16px;font-weight:700;margin-top:3px">${escapeHtml(task.title)}</div><div style="font-size:13px;color:#5f6268;margin-top:4px">${escapeHtml(statusLabel(task.status))} · ${escapeHtml(task.priority)} priority</div></div>`;
  }).join("");
  const summary = tasks.length === 0 ? "You have no open assigned tasks right now." : "Here are your open assigned tasks. The nearest due dates are shown first.";
  return `<div style="font-family:Arial,sans-serif;color:#202428;max-width:640px"><div style="background:#70193d;color:white;padding:18px 22px;font-size:20px;font-weight:700">401 Ops</div><div style="padding:22px"><p>Hi ${escapeHtml(displayName)},</p><p>${summary}</p>${items}<p><a href="https://ops.team401.org/my-tasks" style="display:inline-block;background:#8d214d;color:white;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:700">Open My Tasks</a></p></div></div>`;
}

function statusLabel(status: string) { return ({ backlog: "Backlog", in_progress: "In progress", blocked: "Stuck", review: "In review" } as Record<string, string>)[status] ?? status; }

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character); }

function text(value: unknown) { return typeof value === "string" ? value : ""; }
function record(value: unknown) { return value && typeof value === "object" ? value as Record<string, unknown> : {}; }
function json(body: unknown, status: number, headers: Headers) { const next = new Headers(headers); next.set("Content-Type", "application/json; charset=utf-8"); return new Response(JSON.stringify(body), { status, headers: next }); }
function methodNotAllowed(headers: Headers, allow: string) { return new Response("Method not allowed", { status: 405, headers: { ...Object.fromEntries(headers), Allow: allow } }); }
