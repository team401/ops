/// <reference types="@cloudflare/workers-types" />

import { createFirebaseCustomToken, verifyFirebaseToken } from "./firebase-auth";

export interface AuthEnv {
  DB: D1Database;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_WEB_API_KEY?: string;
  FIREBASE_SERVICE_ACCOUNT_EMAIL?: string;
  FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY?: string;
}

const linkLifetimeMs = 5 * 60 * 1000;
const idPattern = /^[0-9a-f-]{36}$/i;
const tokenPattern = /^[A-Za-z0-9_-]{40,100}$/;

export function isAuthRoute(path: string) {
  return path === "/auth/password-reset" || path === "/auth/device-link";
}

export async function handleAuth(request: Request, env: AuthEnv, cors: Headers) {
  try {
    const path = new URL(request.url).pathname;
    if (path === "/auth/password-reset") return passwordReset(request, env, cors);
    return deviceLink(request, env, cors);
  } catch (error) {
    console.error("Auth request failed", error);
    const message = error instanceof Error ? error.message : "Authentication request failed";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : message.includes("not configured") ? 503 : message.startsWith("Invalid") ? 400 : message.includes("expired") || message.includes("used") || message.includes("denied") || message.includes("already answered") ? 410 : 500;
    return json({ error: status === 500 ? "Authentication request failed" : message }, status, cors);
  }
}

async function passwordReset(request: Request, env: AuthEnv, cors: Headers) {
  if (request.method !== "POST") return methodNotAllowed(cors, "POST, OPTIONS");
  const clientIp = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const limit = await consumeRateLimit(env.DB, `password-reset:${clientIp}`, 5 * 60_000, 3);
  if (!limit.allowed) {
    const headers = new Headers(cors);
    headers.set("Retry-After", String(Math.ceil(limit.retryAfterMs / 1000)));
    return json({ error: "Too many reset requests. Wait a few minutes and try again." }, 429, headers);
  }
  const body = await request.json<{ email?: unknown }>().catch(() => ({} as { email?: unknown }));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 320 || !email.includes("@")) return json({ error: "Enter a valid email address." }, 400, cors);
  if (!env.FIREBASE_WEB_API_KEY) throw new Error("Firebase password reset is not configured");
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestType: "PASSWORD_RESET", email }),
  });
  if (!response.ok) {
    const providerError = await response.text();
    console.error("Firebase password reset failed", response.status, providerError);
    // Preserve account privacy while still telling the UI that delivery did not start.
    if (!providerError.includes("EMAIL_NOT_FOUND")) throw new Error("Firebase password reset failed");
  }
  return json({ sent: true }, 200, cors);
}

async function deviceLink(request: Request, env: AuthEnv, cors: Headers) {
  if (request.method === "POST") {
    if (!env.FIREBASE_SERVICE_ACCOUNT_EMAIL || !env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY) throw new Error("QR sign-in is not configured yet");
    const clientIp = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const limit = await consumeRateLimit(env.DB, `device-link:${clientIp}`, 60_000, 10);
    if (!limit.allowed) return json({ error: "Too many sign-in requests. Try again shortly." }, 429, cors);
    const origin = request.headers.get("Origin");
    if (!origin) throw new Error("Invalid sign-in origin");
    const id = crypto.randomUUID();
    const approvalToken = randomToken();
    const pollToken = randomToken();
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare("DELETE FROM device_sign_in_requests WHERE expires_at < ? OR consumed_at IS NOT NULL").bind(now - 24 * 60 * 60 * 1000),
      env.DB.prepare(`INSERT INTO device_sign_in_requests
        (id, approval_token_hash, poll_token_hash, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?)`).bind(id, await hashToken(approvalToken), await hashToken(pollToken), now + linkLifetimeMs, now),
    ]);
    const approvalUrl = new URL("/device-link", origin);
    approvalUrl.searchParams.set("id", id);
    approvalUrl.searchParams.set("token", approvalToken);
    return json({ id, pollToken, approvalUrl: approvalUrl.toString(), expiresAt: now + linkLifetimeMs }, 201, cors);
  }

  if (request.method === "GET") {
    const url = new URL(request.url);
    const id = url.searchParams.get("id") ?? "";
    const token = url.searchParams.get("token") ?? "";
    validateLinkCredentials(id, token);
    const now = Date.now();
    const row = await env.DB.prepare(`SELECT approved_uid AS approvedUid, expires_at AS expiresAt,
      denied_at AS deniedAt, consumed_at AS consumedAt FROM device_sign_in_requests
      WHERE id = ? AND poll_token_hash = ?`).bind(id, await hashToken(token)).first<{
        approvedUid: string | null; expiresAt: number; deniedAt: number | null; consumedAt: number | null;
      }>();
    if (!row) throw new Error("Invalid device sign-in request");
    if (row.expiresAt <= now) throw new Error("This QR code has expired");
    if (row.deniedAt) throw new Error("Sign-in was denied");
    if (row.consumedAt) throw new Error("This QR code has already been used");
    if (!row.approvedUid) return json({ status: "pending" }, 200, cors);
    if (!env.FIREBASE_SERVICE_ACCOUNT_EMAIL || !env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY) throw new Error("QR sign-in is not configured");
    const profile = await env.DB.prepare("SELECT uid FROM users WHERE uid = ?").bind(row.approvedUid).first();
    if (!profile) throw new Error("Forbidden");
    const customToken = await createFirebaseCustomToken(row.approvedUid, env.FIREBASE_SERVICE_ACCOUNT_EMAIL, env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY);
    const claimed = await env.DB.prepare("UPDATE device_sign_in_requests SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL").bind(now, id).run();
    if (claimed.meta.changes !== 1) throw new Error("This QR code has already been used");
    return json({ status: "approved", customToken }, 200, cors);
  }

  if (request.method === "PATCH" || request.method === "DELETE") {
    const uid = await verifyFirebaseToken(bearerToken(request), env.FIREBASE_PROJECT_ID);
    const profile = await env.DB.prepare("SELECT uid FROM users WHERE uid = ?").bind(uid).first();
    if (!profile) throw new Error("Forbidden");
    const body = await request.json<{ id?: unknown; token?: unknown }>().catch(() => ({} as { id?: unknown; token?: unknown }));
    const id = typeof body.id === "string" ? body.id : "";
    const token = typeof body.token === "string" ? body.token : "";
    validateLinkCredentials(id, token);
    const now = Date.now();
    const result = request.method === "PATCH"
      ? await env.DB.prepare(`UPDATE device_sign_in_requests SET approved_uid = ?, approved_at = ?
          WHERE id = ? AND approval_token_hash = ? AND approved_uid IS NULL AND denied_at IS NULL
            AND consumed_at IS NULL AND expires_at > ?`).bind(uid, now, id, await hashToken(token), now).run()
      : await env.DB.prepare(`UPDATE device_sign_in_requests SET denied_at = ?
          WHERE id = ? AND approval_token_hash = ? AND approved_uid IS NULL AND denied_at IS NULL
            AND consumed_at IS NULL AND expires_at > ?`).bind(now, id, await hashToken(token), now).run();
    if (result.meta.changes !== 1) throw new Error("This QR code is invalid, expired, or already answered");
    return json({ status: request.method === "PATCH" ? "approved" : "denied" }, 200, cors);
  }

  return methodNotAllowed(cors, "GET, POST, PATCH, DELETE, OPTIONS");
}

async function consumeRateLimit(db: D1Database, key: string, windowMs: number, maximum: number) {
  const now = Date.now();
  const row = await db.prepare("SELECT window_started_at AS windowStartedAt, attempts FROM auth_rate_limits WHERE key = ?").bind(key).first<{ windowStartedAt: number; attempts: number }>();
  if (!row || now - row.windowStartedAt >= windowMs) {
    await db.prepare(`INSERT INTO auth_rate_limits (key, window_started_at, attempts) VALUES (?, ?, 1)
      ON CONFLICT(key) DO UPDATE SET window_started_at = excluded.window_started_at, attempts = 1`).bind(key, now).run();
    return { allowed: true, retryAfterMs: 0 };
  }
  if (row.attempts >= maximum) return { allowed: false, retryAfterMs: Math.max(1000, windowMs - (now - row.windowStartedAt)) };
  await db.prepare("UPDATE auth_rate_limits SET attempts = attempts + 1 WHERE key = ?").bind(key).run();
  return { allowed: true, retryAfterMs: 0 };
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validateLinkCredentials(id: string, token: string) {
  if (!idPattern.test(id) || !tokenPattern.test(token)) throw new Error("Invalid device sign-in request");
}

function bearerToken(request: Request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Error("Unauthorized");
  return authorization.slice("Bearer ".length);
}

function json(body: unknown, status: number, headers: Headers) {
  const next = new Headers(headers);
  next.set("Content-Type", "application/json; charset=utf-8");
  next.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status, headers: next });
}

function methodNotAllowed(headers: Headers, allow: string) {
  const next = new Headers(headers);
  next.set("Allow", allow);
  return new Response("Method not allowed", { status: 405, headers: next });
}
