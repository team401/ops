/// <reference types="@cloudflare/workers-types" />

import { createRemoteJWKSet, jwtVerify } from "jose";

interface Env {
  ATTACHMENTS: R2Bucket;
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
}

const firebaseKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);
const attachmentRoute = /^\/attachments\/([^/]+)\/([^/]+)\/([^/]+)$/;
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

    const match = url.pathname.match(attachmentRoute);
    if (!match) return json({ error: "Not found" }, 404, cors);

    const [, encodedTaskId, encodedAttachmentId, encodedFileName] = match;
    const taskId = decodeURIComponent(encodedTaskId);
    const attachmentId = decodeURIComponent(encodedAttachmentId);
    const fileName = decodeURIComponent(encodedFileName);
    if (!/^[A-Za-z0-9_-]+$/.test(taskId) || !/^[A-Za-z0-9_-]+$/.test(attachmentId) || !/^[A-Za-z0-9._-]+$/.test(fileName)) {
      return json({ error: "Invalid attachment path" }, 400, cors);
    }
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

function canChangeAttachments(uid: string, task: FirestoreDocument, profile: FirestoreDocument) {
  const role = profile.fields?.role?.stringValue;
  const profileSubteam = profile.fields?.subteam?.stringValue;
  const taskSubteam = task.fields?.subteam?.stringValue;
  const assignees = task.fields?.assigneeUids?.arrayValue?.values?.flatMap((value) => value.stringValue ? [value.stringValue] : []) ?? [];
  return role === "coach" || (role === "student_leader" && profileSubteam === taskSubteam) || assignees.includes(uid);
}

function corsHeaders(origin: string | null, env: Env) {
  const headers = new Headers({
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
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
