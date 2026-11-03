/// <reference types="@cloudflare/workers-types" />

import { createRemoteJWKSet, jwtVerify } from "jose";
import { handleOperations, isOperationsRoute } from "./operations";

interface Env {
  ATTACHMENTS: R2Bucket;
  DB: D1Database;
  FIREBASE_PROJECT_ID: string;
  ALLOWED_ORIGINS: string;
  PAGES_HOST_SUFFIX: string;
}

interface FirestoreDocument {
  fields?: Record<string, FirestoreValue>;
}

interface FirestoreValue {
  stringValue?: string;
  booleanValue?: boolean;
  arrayValue?: { values?: FirestoreValue[] };
  mapValue?: { fields?: Record<string, FirestoreValue> };
}

const firebaseKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);
const attachmentRoute = /^\/attachments\/([^/]+)\/([^/]+)\/([^/]+)$/;
const attachmentMigrationRoute = /^\/migrations\/attachments\/([^/]+)\/([^/]+)\/([^/]+)$/;
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

    if (isOperationsRoute(url.pathname)) {
      try {
        const token = bearerToken(request);
        const uid = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
        return handleOperations(request, env, uid, token, cors);
      } catch (error) {
        return authenticatedError(error, cors, "Data request failed");
      }
    }

    if (url.pathname === "/migrations/certifications") {
      if (request.method !== "POST") return methodNotAllowed(cors, "POST, OPTIONS");
      try {
        const token = bearerToken(request);
        const uid = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
        await requireCoach(uid, token, env);
        const documents = await fetchFirestoreCollection("certifications", token, env.FIREBASE_PROJECT_ID);
        const certifications = documents.map(parseFirestoreCertification);
        if (certifications.length > 0) {
          await env.DB.batch(certifications.map((certification) => certificationUpsert(env.DB, certification)));
        }
        const rows = await env.DB.prepare("SELECT id, name, description, subteam FROM certifications").all<CertificationRow>();
        const byId = new Map(rows.results.map((row) => [row.id, row]));
        const verified = certifications.every((certification) => {
          const row = byId.get(certification.id);
          return row?.name === certification.name && row.description === certification.description && row.subteam === certification.subteam;
        });
        if (!verified) return json({ error: "D1 verification failed" }, 500, cors);
        return json({ copied: certifications.length, verified: certifications.length, d1Count: rows.results.length }, 200, cors);
      } catch (error) {
        return authenticatedError(error, cors, "Certification migration failed");
      }
    }

    const certificationMatch = url.pathname.match(certificationRoute);
    if (certificationMatch) {
      try {
        const token = bearerToken(request);
        const uid = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
        if (request.method === "GET" && !certificationMatch[1]) {
          await fetchFirestoreDocument("users", uid, token, env.FIREBASE_PROJECT_ID);
          const result = await env.DB.prepare("SELECT id, name, description, subteam FROM certifications ORDER BY name COLLATE NOCASE").all<CertificationRow>();
          return json(result.results, 200, cors);
        }
        await requireCoach(uid, token, env);
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

    const migrationMatch = url.pathname.match(attachmentMigrationRoute);
    if (migrationMatch) {
      if (request.method !== "POST") {
        return new Response("Method not allowed", { status: 405, headers: { ...Object.fromEntries(cors), Allow: "POST, OPTIONS" } });
      }
      try {
        const token = bearerToken(request);
        const uid = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID);
        const profile = await fetchFirestoreDocument("users", uid, token, env.FIREBASE_PROJECT_ID);
        if (profile.fields?.role?.stringValue !== "coach") throw new Error("Forbidden");

        const [, encodedTaskId, encodedAttachmentId, encodedFileName] = migrationMatch;
        const taskId = decodeURIComponent(encodedTaskId);
        const attachmentId = decodeURIComponent(encodedAttachmentId);
        const fileName = decodeURIComponent(encodedFileName);
        validateAttachmentPath(taskId, attachmentId, fileName);
        const task = await fetchFirestoreDocument("tasks", taskId, token, env.FIREBASE_PROJECT_ID);
        const attachment = findLegacyAttachment(task, attachmentId);
        if (!attachment) return json({ error: "Legacy attachment not found" }, 404, cors);
        const sourceUrl = attachment.url;
        const storagePath = attachment.storagePath;
        if (!sourceUrl || !storagePath?.startsWith(`task-attachments/${taskId}/`)) {
          return json({ error: "Attachment source is invalid" }, 400, cors);
        }
        const source = new URL(sourceUrl);
        if (!isFirebaseStorageHost(source.hostname)) {
          return json({ error: "Attachment is not hosted by Firebase Storage" }, 400, cors);
        }

        const sourceResponse = await fetch(source);
        if (!sourceResponse.ok) return json({ error: "Could not download the Firebase attachment" }, 502, cors);
        const bytes = await sourceResponse.arrayBuffer();
        if (bytes.byteLength > maxAttachmentSize) return json({ error: "Attachments must be 20 MB or smaller" }, 413, cors);
        const sha256 = await digestHex(bytes);
        const key = `task-attachments/${taskId}/${attachmentId}/${fileName}`;
        const contentType = attachment.contentType || sourceResponse.headers.get("Content-Type") || "application/octet-stream";
        await env.ATTACHMENTS.put(key, bytes, {
          httpMetadata: { contentType, cacheControl: "public,max-age=31536000,immutable", contentDisposition: "inline" },
          customMetadata: { taskId, attachmentId, uploadedByUid: uid, migratedFrom: "firebase", sha256 },
        });
        const copied = await env.ATTACHMENTS.get(key);
        if (!copied || copied.size !== bytes.byteLength || await digestHex(await copied.arrayBuffer()) !== sha256) {
          await env.ATTACHMENTS.delete(key);
          return json({ error: "R2 verification failed" }, 500, cors);
        }
        return json({
          key,
          url: new URL(`/attachments/${encodeURIComponent(taskId)}/${encodeURIComponent(attachmentId)}/${encodeURIComponent(fileName)}`, request.url).href,
          size: bytes.byteLength,
          contentType,
          sha256,
        }, 201, cors);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Migration failed";
        const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
        return json({ error: status === 500 ? "Attachment migration failed" : message }, status, cors);
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
      const [task, profile] = await Promise.all([
        fetchFirestoreDocument("tasks", taskId, token, env.FIREBASE_PROJECT_ID),
        fetchFirestoreDocument("users", uid, token, env.FIREBASE_PROJECT_ID),
      ]);
      if (!canChangeAttachments(uid, task, profile)) {
        return json({ error: "You cannot change attachments on this task" }, 403, cors);
      }

      if (request.method === "DELETE") {
        await env.ATTACHMENTS.delete(key);
        return new Response(null, { status: 204, headers: cors });
      }

      const contentLengthHeader = request.headers.get("Content-Length");
      if (contentLengthHeader === null) return json({ error: "Content-Length is required" }, 411, cors);
      const contentLength = Number(contentLengthHeader);
      if (!Number.isFinite(contentLength) || contentLength < 0 || contentLength > maxAttachmentSize) {
        return json({ error: "Attachments must be 20 MB or smaller" }, 413, cors);
      }
      if (!request.body) return json({ error: "Missing file body" }, 400, cors);

      await env.ATTACHMENTS.put(key, request.body, {
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

async function fetchFirestoreDocument(collection: string, id: string, token: string, projectId: string) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (response.status === 401) throw new Error("Unauthorized");
  if (!response.ok) throw new Error("Forbidden");
  return response.json<FirestoreDocument>();
}

async function fetchFirestoreCollection(collection: string, token: string, projectId: string) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${collection}?pageSize=1000`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (response.status === 401) throw new Error("Unauthorized");
  if (!response.ok) throw new Error("Forbidden");
  const result = await response.json<{ documents?: Array<FirestoreDocument & { name?: string }> }>();
  return result.documents ?? [];
}

function parseFirestoreCertification(document: FirestoreDocument & { name?: string }) {
  return validateCertification({
    id: document.fields?.id?.stringValue ?? document.name?.split("/").at(-1),
    name: document.fields?.name?.stringValue,
    description: document.fields?.description?.stringValue ?? "",
    subteam: document.fields?.subteam?.stringValue ?? null,
  });
}

async function requireCoach(uid: string, token: string, env: Env) {
  const profile = await fetchFirestoreDocument("users", uid, token, env.FIREBASE_PROJECT_ID);
  if (profile.fields?.role?.stringValue !== "coach") throw new Error("Forbidden");
}

function canChangeAttachments(uid: string, task: FirestoreDocument, profile: FirestoreDocument) {
  const role = profile.fields?.role?.stringValue;
  const profileSubteam = profile.fields?.subteam?.stringValue;
  const taskSubteam = task.fields?.subteam?.stringValue;
  const assignees = task.fields?.assigneeUids?.arrayValue?.values?.flatMap((value) => value.stringValue ? [value.stringValue] : []) ?? [];
  return role === "coach" || (role === "student_leader" && profileSubteam === taskSubteam) || assignees.includes(uid);
}

function validateAttachmentPath(taskId: string, attachmentId: string, fileName: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(taskId) || !/^[A-Za-z0-9_-]+$/.test(attachmentId) || !/^[A-Za-z0-9._-]+$/.test(fileName)) {
    throw new Error("Invalid attachment path");
  }
}

function findLegacyAttachment(task: FirestoreDocument, attachmentId: string) {
  const values = task.fields?.attachments?.arrayValue?.values ?? [];
  for (const value of values) {
    const fields = value.mapValue?.fields;
    if (fields?.id?.stringValue === attachmentId && fields.storageProvider?.stringValue !== "r2") {
      return {
        url: fields.url?.stringValue,
        storagePath: fields.storagePath?.stringValue,
        contentType: fields.contentType?.stringValue,
      };
    }
  }
  return null;
}

function isFirebaseStorageHost(hostname: string) {
  return hostname === "firebasestorage.googleapis.com" || hostname === "storage.googleapis.com";
}

async function digestHex(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function corsHeaders(origin: string | null, env: Env) {
  const headers = new Headers({
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
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
    return url.protocol === "https:" && Boolean(env.PAGES_HOST_SUFFIX) &&
      (url.hostname === env.PAGES_HOST_SUFFIX || url.hostname.endsWith(`.${env.PAGES_HOST_SUFFIX}`));
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
