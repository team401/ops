/// <reference types="@cloudflare/workers-types" />

import { createTeam401AuthHandlers } from "@team401/auth-worker";

export interface AuthEnv {
  DB: D1Database;
}

const authPaths = new Set(["/auth/session", "/auth/session/device-link", "/auth/session/password-reset"]);
const frontendOrigins = new Set(["https://ops.team401.org", "https://staging.ops.team401.org"]);

export function isAuthRoute(path: string) {
  return authPaths.has(path);
}

function frontendRequest(request: Request) {
  const origin = request.headers.get("Origin");
  if (!origin) return request;
  const url = new URL(request.url);
  const frontend = new URL(origin);
  url.protocol = frontend.protocol;
  url.host = frontend.host;
  return new Request(url, request);
}

function handlers(env: AuthEnv) {
  return createTeam401AuthHandlers({
    application: "ops",
    getDatabase: () => env.DB,
    authOrigin: (incoming) => new URL(incoming.url).hostname.startsWith("staging.")
      ? "https://auth-staging.team401.org"
      : "https://auth.team401.org",
    resolveIdentity: async (identity) => {
      const uid = identity.applicationUserId;
      if (!uid) throw new Error("Application identity could not be resolved.");
      const profile = await env.DB.prepare("SELECT uid FROM users WHERE uid = ?").bind(uid).first<{ uid: string }>();
      if (!profile) throw new Error("This account does not have an Ops profile.");
      return { ...identity, memberId: profile.uid };
    },
  });
}

export async function handleAuth(request: Request, env: AuthEnv, cors: Headers) {
  try {
    const path = new URL(request.url).pathname;
    const method = request.method;
    if (!frontendOrigins.has(request.headers.get("Origin") ?? "")) {
      return json({ error: "Open Ops on its production or staging domain to sign in." }, 403, cors);
    }
    const incoming = frontendRequest(request);
    const auth = handlers(env);
    let response: Response;
    if (path === "/auth/session") {
      if (method === "GET") {
        const identity = await auth.getIdentity(incoming);
        const profile = identity && await env.DB.prepare("SELECT uid FROM users WHERE uid = ?").bind(identity.memberId).first();
        if (!profile) return json({ user: null }, 401, cors);
        response = json({ user: identity }, 200, cors);
      }
      else if (method === "POST") response = await auth.session.POST(incoming);
      else if (method === "DELETE") response = await auth.session.DELETE(incoming);
      else return methodNotAllowed(cors, "GET, POST, DELETE, OPTIONS");
    } else if (path === "/auth/session/device-link") {
      if (method === "GET") response = await auth.deviceLink.GET(incoming);
      else if (method === "POST") response = await auth.deviceLink.POST(incoming);
      else if (method === "PATCH") response = await auth.deviceLink.PATCH(incoming);
      else if (method === "DELETE") response = await auth.deviceLink.DELETE(incoming);
      else return methodNotAllowed(cors, "GET, POST, PATCH, DELETE, OPTIONS");
    } else {
      if (method !== "POST") return methodNotAllowed(cors, "POST, OPTIONS");
      response = await auth.passwordReset.POST(incoming);
    }
    return withCors(response, cors);
  } catch (error) {
    console.error("Central authentication request failed", error);
    const message = error instanceof Error ? error.message : "Authentication request failed";
    const mappingError = message.includes("profile") || message.includes("identity could not be resolved");
    return json({ error: mappingError ? message : "The Ops session service could not complete sign-in." }, mappingError ? 403 : 500, cors);
  }
}

export async function authenticatedUid(request: Request, env: AuthEnv) {
  if (!frontendOrigins.has(request.headers.get("Origin") ?? "")) throw new Error("Unauthorized");
  const identity = await handlers(env).getIdentity(request);
  if (!identity) throw new Error("Unauthorized");
  return identity.memberId;
}

function withCors(response: Response, cors: Headers) {
  const headers = new Headers(response.headers);
  cors.forEach((value, key) => headers.set(key, value));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
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
