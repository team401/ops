/// <reference types="@cloudflare/workers-types" />

import { createRemoteJWKSet, jwtVerify } from "jose";
import { handleOperations, isOperationsRoute } from "./operations";
import { handleCore, isCoreRoute } from "./core";
import { handleNotifications, isNotificationRoute, sendDailyEmailDigests } from "./notifications";

interface Env {
  ATTACHMENTS: R2Bucket;
  DB: D1Database;
  FIREBASE_PROJECT_ID: string;
  ALLOWED_ORIGINS: string;
  PAGES_HOST_SUFFIX: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
}

const firebaseKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);
const attachmentRoute = /^\/attachments\/([^/]+)\/([^/]+)\/([^/]+)$/;
const certificationRoute = /^\/certifications(?:\/([^/]+))?$/;
const maxAttachmentSize = 20 * 1024 * 1024;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      if (origin && !cors.has("Access-Control-Allow-Origin")) {
        return new Response("Origin not allowed", { status: 403 });
      }
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return json({ ok: true }, 200, cors);
    }

    if (isCoreRoute(url.pathname)) {
      try {
        const token = bearerToken(request);
        const uid = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
        return handleCore(request, env, uid, cors);
      } catch (error) {
        return authenticatedError(error, cors, "Data request failed");
      }
    }

    if (isOperationsRoute(url.pathname)) {
      try {
        const token = bearerToken(request);
        const uid = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
        return handleOperations(request, env, uid, cors);
      } catch (error) {
        return authenticatedError(error, cors, "Data request failed");
      }
    }

    if (isNotificationRoute(url.pathname)) {
      try {
        const token = bearerToken(request);
        const uid = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
        return handleNotifications(request, env, uid, cors);
      } catch (error) {
        return authenticatedError(error, cors, "Notification request failed");
      }
    }

    const certificationMatch = url.pathname.match(certificationRoute);
    if (certificationMatch) {
      try {
        const token = bearerToken(request);
        const uid = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
        if (request.method === "GET" && !certificationMatch[1]) {
          if (!await fetchD1Profile(env.DB, uid)) throw new Error("Forbidden");
          const result = await env.DB.prepare("SELECT id, name, description, subteam FROM certifications ORDER BY name COLLATE NOCASE").all<CertificationRow>();
          return json(result.results, 200, cors);
        }
        await requireCoach(uid, env);
        if (request.method === "POST" && !certificationMatch[1]) {
          const certification = validateCertification(await request.json());
          await certificationUpsert(env.DB, certification).run();
          return json(certification, 201, cors);
        }
        const id = certificationMatch[1] ? decodeURIComponent(certificationMatch[1]) : "";
        if (!/^[A-Za-z0-9_-]+$/.test(id)) return json({ error: "Invalid certification ID" }, 400, cors);
        if (request.method === "PUT") {
          const certification = validateCertification({ ...await request.json<Record<string, unknown>>(), id });
          await certificationUpsert(env.DB, certification).run();
          return json(certification, 200, cors);
        }
        if (request.method === "DELETE") {
          await env.DB.prepare("DELETE FROM certifications WHERE id = ?").bind(id).run();
          return new Response(null, { status: 204, headers: cors });
        }
        return methodNotAllowed(cors, certificationMatch[1] ? "PUT, DELETE, OPTIONS" : "GET, POST, OPTIONS");
      } catch (error) {
        return authenticatedError(error, cors, "Certification request failed");
      }
    }

    const match = url.pathname.match(attachmentRoute);
    if (!match) return json({ error: "Not found" }, 404, cors);

    const [, encodedTaskId, encodedAttachmentId, encodedFileName] = match;
    const taskId = decodeURIComponent(encodedTaskId);
    const attachmentId = decodeURIComponent(encodedAttachmentId);
    const fileName = decodeURIComponent(encodedFileName);
    try { validateAttachmentPath(taskId, attachmentId, fileName); } catch { return json({ error: "Invalid attachment path" }, 400, cors); }
    const key = `task-attachments/${taskId}/${attachmentId}/${fileName}`;

    if (request.method === "GET") {
      const object = await env.ATTACHMENTS.get(key);
      if (!object) return json({ error: "Not found" }, 404, cors);
      const headers = new Headers(cors);
      object.writeHttpMetadata(headers);
      headers.set("ETag", object.httpEtag);
      headers.set("Cache-Control", "public,max-age=31536000,immutable");
      headers.set("X-Content-Type-Options", "nosniff");
      return new Response(object.body, { headers });
    }

    if (request.method !== "PUT" && request.method !== "DELETE") {
      return new Response("Method not allowed", { status: 405, headers: { ...Object.fromEntries(cors), Allow: "GET, PUT, DELETE, OPTIONS" } });
    }

    try {
      const token = bearerToken(request);
      const uid = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
      const [task, profile] = await Promise.all([fetchD1Task(env.DB, taskId), fetchD1Profile(env.DB, uid)]);
      const authorized = Boolean(task && profile && canChangeAttachments(uid, task, profile));
      if (!authorized) {
        return json({ error: "You cannot change attachments on this task" }, 403, cors);
      }

      if (request.method === "DELETE") {
        await env.ATTACHMENTS.delete(key);
        return new Response(null, { status: 204, headers: cors });
      }

      const contentLengthHeader = request.headers.get("Content-Length");
      const declaredLength = contentLengthHeader === null ? null : Number(contentLengthHeader);
      if (declaredLength !== null && (!Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > maxAttachmentSize)) {
        return json({ error: "Attachments must be 20 MB or smaller" }, 413, cors);
      }
      if (!request.body) return json({ error: "Missing file body" }, 400, cors);

      const bytes = await request.arrayBuffer();
      if (bytes.byteLength > maxAttachmentSize) {
        return json({ error: "Attachments must be 20 MB or smaller" }, 413, cors);
      }

      await env.ATTACHMENTS.put(key, bytes, {
        httpMetadata: {
          contentType: request.headers.get("Content-Type") ?? "application/octet-stream",
          cacheControl: "public,max-age=31536000,immutable",
          contentDisposition: "inline",
        },
        customMetadata: { taskId, attachmentId, uploadedByUid: uid },
      });

      return json({
        key,
        url: new URL(
          `/attachments/${encodeURIComponent(taskId)}/${encodeURIComponent(attachmentId)}/${encodeURIComponent(fileName)}`,
          request.url,
        ).href,
      }, 201, cors);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
      return json({ error: status === 500 ? "Attachment request failed" : message }, status, cors);
    }
  },
  async scheduled(_controller: ScheduledController, env: Env, context: ExecutionContext) {
    context.waitUntil(sendDailyEmailDigests(env));
  },
} satisfies ExportedHandler<Env>;

function bearerToken(request: Request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Error("Unauthorized");
  return authorization.slice("Bearer ".length);
}

interface CertificationRow {
  id: string;
  name: string;
  description: string;
  subteam: string | null;
}

function validateCertification(value: unknown): CertificationRow {
  if (!value || typeof value !== "object") throw new Error("Invalid certification");
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : "";
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const description = typeof record.description === "string" ? record.description.trim() : "";
  const subteam = record.subteam === null ? null : typeof record.subteam === "string" ? record.subteam : "";
  const subteams = ["mechanical", "electrical", "programming", "cad", "outreach", "finance"];
  if (!/^[A-Za-z0-9_-]+$/.test(id) || name.length < 1 || name.length > 120 || description.length > 1000 || (subteam !== null && !subteams.includes(subteam))) {
    throw new Error("Invalid certification");
  }
  return { id, name, description, subteam };
}

function certificationUpsert(db: D1Database, certification: CertificationRow) {
  return db.prepare(`INSERT INTO certifications (id, name, description, subteam, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description,
      subteam = excluded.subteam, updated_at = excluded.updated_at`)
    .bind(certification.id, certification.name, certification.description, certification.subteam, new Date().toISOString());
}

async function verifyFirebaseToken(token: string, projectId: string) {
  const { payload } = await jwtVerify(token, firebaseKeys, {
    algorithms: ["RS256"],
    audience: projectId,
    issuer: `https://securetoken.google.com/${projectId}`,
  });
  if (!payload.sub) throw new Error("Unauthorized");
  return payload.sub;
}

async function requireCoach(uid: string, env: Env) {
  const profile = await fetchD1Profile(env.DB, uid);
  if (profile?.role !== "coach") throw new Error("Forbidden");
}

function canChangeAttachments(uid: string, task: { subteam?: string; assigneeUids?: string[]; createdByUid?: string }, profile: { role?: string; subteam?: string | null }) {
  const role = profile.role;
  const profileSubteam = profile.subteam;
  const taskSubteam = task.subteam;
  const assignees = task.assigneeUids ?? [];
  return role === "coach" || role === "student_leader" || task.createdByUid === uid || profileSubteam === taskSubteam || assignees.includes(uid);
}

async function fetchD1Task(db: D1Database, id: string) {
  const row = await db.prepare("SELECT data FROM tasks WHERE id = ?").bind(id).first<{ data: string }>();
  return row ? JSON.parse(row.data) as { subteam?: string; assigneeUids?: string[]; createdByUid?: string } : null;
}

async function fetchD1Profile(db: D1Database, uid: string) {
  return db.prepare("SELECT role, subteam FROM users WHERE uid = ?").bind(uid).first<{ role: string; subteam: string | null }>();
}

function validateAttachmentPath(taskId: string, attachmentId: string, fileName: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(taskId) || !/^[A-Za-z0-9_-]+$/.test(attachmentId) || !/^[A-Za-z0-9._-]+$/.test(fileName)) {
    throw new Error("Invalid attachment path");
  }
}

function corsHeaders(origin: string | null, env: Env) {
  const headers = new Headers({
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, PUT, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  });
  if (origin && isAllowedOrigin(origin, env)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

function isAllowedOrigin(origin: string, env: Env) {
  const exactOrigins = env.ALLOWED_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean);
  if (exactOrigins.includes(origin)) return true;
  try {
    const url = new URL(origin);
    const pageHostSuffixes = env.PAGES_HOST_SUFFIX.split(",").map((value) => value.trim()).filter(Boolean);
    return url.protocol === "https:" && pageHostSuffixes.some((suffix) =>
      url.hostname === suffix || url.hostname.endsWith(`.${suffix}`));
  } catch {
    return false;
  }
}

function json(body: unknown, status: number, headers: Headers) {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

function methodNotAllowed(headers: Headers, allow: string) {
  return new Response("Method not allowed", { status: 405, headers: { ...Object.fromEntries(headers), Allow: allow } });
}

function authenticatedError(error: unknown, cors: Headers, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : message.startsWith("Invalid") ? 400 : 500;
  return json({ error: status === 500 ? fallback : message }, status, cors);
}
