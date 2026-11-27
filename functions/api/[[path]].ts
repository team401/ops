interface PagesContext {
  request: Request;
}

// Keep cookies on the preview host and use the registered staging callback for
// server-to-server authorization requests.
export async function onRequest({ request }: PagesContext): Promise<Response> {
  const incoming = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin && origin !== incoming.origin) return new Response("Invalid origin", { status: 403 });
  const path = incoming.pathname.slice("/api".length);
  const login = path === "/central-auth/api/in-situ/login";
  if (path.startsWith("/central-auth") && !login) return new Response("Not found", { status: 404 });
  const target = new URL(login ? "/api/in-situ/login" : path, login
    ? "https://auth-staging.team401.org"
    : "https://api.ops.team401.org");
  target.search = incoming.search;
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("authorization");
  headers.set("Origin", "https://staging.ops.team401.org");
  let body: BodyInit | null = request.body;
  if (request.method === "POST" && (login || path === "/auth/session")) {
    const payload = await request.json() as Record<string, unknown>;
    payload.redirectUri = "https://staging.ops.team401.org/auth/callback";
    if (login) payload.application = "ops";
    body = JSON.stringify(payload);
  }
  const response = await fetch(target, { method: request.method, headers, body, redirect: "manual" });
  const outgoing = new Headers(response.headers);
  outgoing.delete("access-control-allow-origin");
  outgoing.delete("access-control-allow-credentials");
  outgoing.set("cache-control", "no-store");
  if (path.startsWith("/auth/session/device-link") && request.method === "POST" && response.ok) {
    const payload = await response.json() as { approvalUrl: string };
    const approval = new URL(payload.approvalUrl);
    approval.protocol = incoming.protocol;
    approval.host = incoming.host;
    payload.approvalUrl = approval.toString();
    return Response.json(payload, { status: response.status, headers: outgoing });
  }
  return new Response(response.body, { status: response.status, headers: outgoing });
}
