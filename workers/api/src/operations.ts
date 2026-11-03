/// <reference types="@cloudflare/workers-types" />

interface OperationsEnv { DB: D1Database; FIREBASE_PROJECT_ID: string }
interface FirestoreValue { stringValue?: string; nullValue?: null }
interface FirestoreDocument { name?: string; fields?: Record<string, FirestoreValue> }
type Profile = { role: string; subteam: string | null };

const idPattern = /^[A-Za-z0-9_-]+$/;

export function isOperationsRoute(pathname: string) {
  return pathname === "/migrations/operations" || ["/calendar-events", "/time-entries", "/timeclock-pins", "/device-sessions"].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function handleOperations(request: Request, env: OperationsEnv, uid: string, token: string, cors: Headers) {
  try {
    const url = new URL(request.url);
    const profile = await fetchProfile(uid, token, env.FIREBASE_PROJECT_ID);
    if (url.pathname === "/migrations/operations") return migrateOperations(request, env, token, profile, cors);
    if (url.pathname === "/calendar-events" || url.pathname.startsWith("/calendar-events/")) return calendarRoute(request, env, uid, profile, cors);
    if (url.pathname === "/time-entries" || url.pathname.startsWith("/time-entries/")) return timeEntryRoute(request, env, uid, profile, cors);
    if (url.pathname === "/timeclock-pins" || url.pathname.startsWith("/timeclock-pins/")) return pinRoute(request, env, profile, cors);
    return deviceRoute(request, env, uid, cors);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Data request failed";
    const status = message === "Forbidden" ? 403 : message.startsWith("Invalid") ? 400 : 500;
    return json({ error: status === 500 ? "Data request failed" : message }, status, cors);
  }
}

async function calendarRoute(request: Request, env: OperationsEnv, uid: string, profile: Profile, cors: Headers) {
  const id = decodeURIComponent(new URL(request.url).pathname.split("/")[2] ?? "");
  if (request.method === "GET" && !id) {
    const result = await env.DB.prepare(`SELECT id, title, description, category, start_date AS startDate, end_date AS endDate,
      location, created_by_uid AS createdByUid, created_at AS createdAt, updated_at AS updatedAt
      FROM calendar_events ORDER BY start_date, title COLLATE NOCASE`).all();
    return json(result.results, 200, cors);
  }
  if (profile.role !== "coach" && profile.role !== "student_leader") throw new Error("Forbidden");
  if (request.method === "POST" && !id) {
    const event = validateCalendar(await request.json(), uid);
    await calendarUpsert(env.DB, event).run();
    return json(event, 201, cors);
  }
  if (!idPattern.test(id)) throw new Error("Invalid event ID");
  if (request.method === "PUT") {
    const event = validateCalendar({ ...await request.json<Record<string, unknown>>(), id }, uid, true);
    await calendarUpsert(env.DB, event).run();
    return json(event, 200, cors);
  }
  if (request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM calendar_events WHERE id = ?").bind(id).run();
    return new Response(null, { status: 204, headers: cors });
  }
  return methodNotAllowed(cors);
}

function validateCalendar(value: unknown, uid: string, preserveCreator = false) {
  const record = asRecord(value);
  const now = new Date().toISOString();
  const event = {
    id: text(record.id), title: text(record.title).trim(), description: text(record.description).trim(), category: text(record.category),
    startDate: text(record.startDate), endDate: text(record.endDate), location: text(record.location).trim(),
    createdByUid: preserveCreator ? text(record.createdByUid) || uid : uid,
    createdAt: preserveCreator ? text(record.createdAt) || now : now, updatedAt: now,
  };
  if (!idPattern.test(event.id) || !event.title || event.title.length > 160 || event.description.length > 2000 || !["outreach", "competition", "deadline", "meeting", "other"].includes(event.category) || !/^\d{4}-\d{2}-\d{2}$/.test(event.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(event.endDate) || event.endDate < event.startDate || event.location.length > 200) throw new Error("Invalid calendar event");
  return event;
}

function calendarUpsert(db: D1Database, event: ReturnType<typeof validateCalendar>) {
  return db.prepare(`INSERT INTO calendar_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET title=excluded.title, description=excluded.description, category=excluded.category,
    start_date=excluded.start_date, end_date=excluded.end_date, location=excluded.location, updated_at=excluded.updated_at`)
    .bind(event.id, event.title, event.description, event.category, event.startDate, event.endDate, event.location, event.createdByUid, event.createdAt, event.updatedAt);
}

async function timeEntryRoute(request: Request, env: OperationsEnv, uid: string, profile: Profile, cors: Headers) {
  const url = new URL(request.url);
  const id = decodeURIComponent(url.pathname.split("/")[2] ?? "");
  if (request.method === "GET" && !id) {
    const all = url.searchParams.get("scope") === "all";
    if (all && profile.role !== "coach") throw new Error("Forbidden");
    const statement = all
      ? env.DB.prepare(timeEntrySelect())
      : env.DB.prepare(`${timeEntrySelect()} WHERE uid = ?`).bind(uid);
    const result = await statement.all();
    return json(result.results, 200, cors);
  }
  if (profile.role !== "coach") throw new Error("Forbidden");
  if (request.method === "POST" && !id) {
    const record = asRecord(await request.json());
    const targetUid = text(record.uid);
    const activity = text(record.activity);
    const activityName = text(record.activityName).trim();
    if (!targetUid || !["shop", "outreach"].includes(activity) || !activityName || activityName.length > 80) throw new Error("Invalid time entry");
    const open = await env.DB.prepare("SELECT id FROM time_entries WHERE uid = ? AND clock_out IS NULL LIMIT 1").bind(targetUid).first();
    if (open) return json({ error: "This person is already signed in." }, 409, cors);
    const entry = { id: crypto.randomUUID(), uid: targetUid, activity, activityName, clockIn: new Date().toISOString(), clockOut: null, clockedInByUid: uid, clockedOutByUid: null };
    await timeEntryUpsert(env.DB, entry).run();
    return json(entry, 201, cors);
  }
  if (request.method === "PUT" && idPattern.test(id)) {
    await env.DB.prepare("UPDATE time_entries SET clock_out = ?, clocked_out_by_uid = ? WHERE id = ? AND clock_out IS NULL").bind(new Date().toISOString(), uid, id).run();
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method === "POST" && id === "clock-out-all") {
    const ids = asRecord(await request.json()).ids;
    if (!Array.isArray(ids) || ids.some((value) => typeof value !== "string" || !idPattern.test(value))) throw new Error("Invalid time entries");
    const now = new Date().toISOString();
    await env.DB.batch(ids.map((entryId) => env.DB.prepare("UPDATE time_entries SET clock_out = ?, clocked_out_by_uid = ? WHERE id = ? AND clock_out IS NULL").bind(now, uid, entryId)));
    return new Response(null, { status: 204, headers: cors });
  }
  return methodNotAllowed(cors);
}

function timeEntrySelect() { return `SELECT id, uid, activity, activity_name AS activityName, clock_in AS clockIn, clock_out AS clockOut, clocked_in_by_uid AS clockedInByUid, clocked_out_by_uid AS clockedOutByUid FROM time_entries`; }
function timeEntryUpsert(db: D1Database, entry: Record<string, unknown>) {
  return db.prepare(`INSERT INTO time_entries VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET uid=excluded.uid, activity=excluded.activity, activity_name=excluded.activity_name,
    clock_in=excluded.clock_in, clock_out=excluded.clock_out, clocked_in_by_uid=excluded.clocked_in_by_uid, clocked_out_by_uid=excluded.clocked_out_by_uid`)
    .bind(entry.id, entry.uid, entry.activity, entry.activityName, entry.clockIn, entry.clockOut, entry.clockedInByUid, entry.clockedOutByUid);
}

async function pinRoute(request: Request, env: OperationsEnv, profile: Profile, cors: Headers) {
  if (profile.role !== "coach") throw new Error("Forbidden");
  const url = new URL(request.url);
  const uid = decodeURIComponent(url.pathname.split("/")[2] ?? "");
  if (request.method === "GET" && !uid) {
    const pin = url.searchParams.get("pin");
    if (pin) return json({ uid: (await env.DB.prepare("SELECT uid FROM timeclock_pins WHERE pin = ?").bind(pin).first<{ uid: string }>())?.uid ?? null }, 200, cors);
    const result = await env.DB.prepare("SELECT uid, pin, updated_at AS updatedAt FROM timeclock_pins ORDER BY pin").all();
    return json(result.results, 200, cors);
  }
  if (!idPattern.test(uid)) throw new Error("Invalid user ID");
  if (request.method === "PUT") {
    const pin = text(asRecord(await request.json()).pin);
    if (!/^\d{1,3}$/.test(pin)) throw new Error("Invalid PIN");
    try { await env.DB.prepare(`INSERT INTO timeclock_pins VALUES (?, ?, ?) ON CONFLICT(uid) DO UPDATE SET pin=excluded.pin, updated_at=excluded.updated_at`).bind(uid, pin, new Date().toISOString()).run(); }
    catch { return json({ error: "That PIN is already in use." }, 409, cors); }
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method === "DELETE") { await env.DB.prepare("DELETE FROM timeclock_pins WHERE uid = ?").bind(uid).run(); return new Response(null, { status: 204, headers: cors }); }
  return methodNotAllowed(cors);
}

async function deviceRoute(request: Request, env: OperationsEnv, uid: string, cors: Headers) {
  const id = decodeURIComponent(new URL(request.url).pathname.split("/")[2] ?? "");
  if (request.method === "GET" && !id) {
    const result = await env.DB.prepare("SELECT id, label, user_agent AS userAgent, created_at AS createdAt, last_seen_at AS lastSeenAt, revoked FROM device_sessions WHERE uid = ? ORDER BY last_seen_at DESC").bind(uid).all<Record<string, unknown>>();
    return json(result.results.map((row) => ({ ...row, revoked: row.revoked === 1 })), 200, cors);
  }
  if (!idPattern.test(id)) throw new Error("Invalid device ID");
  if (request.method === "PUT") {
    const record = asRecord(await request.json()); const now = new Date().toISOString();
    const existing = await env.DB.prepare("SELECT created_at AS createdAt FROM device_sessions WHERE uid = ? AND id = ?").bind(uid, id).first<{ createdAt: string }>();
    await env.DB.prepare(`INSERT INTO device_sessions VALUES (?, ?, ?, ?, ?, ?, 0)
      ON CONFLICT(uid,id) DO UPDATE SET label=excluded.label, user_agent=excluded.user_agent, last_seen_at=excluded.last_seen_at, revoked=0`)
      .bind(uid, id, text(record.label).slice(0, 100), text(record.userAgent).slice(0, 500), existing?.createdAt ?? now, now).run();
    return new Response(null, { status: 204, headers: cors });
  }
  if (request.method === "POST") { await env.DB.prepare("UPDATE device_sessions SET revoked = 1 WHERE uid = ? AND id = ?").bind(uid, id).run(); return new Response(null, { status: 204, headers: cors }); }
  if (request.method === "DELETE") { await env.DB.prepare("DELETE FROM device_sessions WHERE uid = ? AND id = ?").bind(uid, id).run(); return new Response(null, { status: 204, headers: cors }); }
  return methodNotAllowed(cors);
}

async function migrateOperations(request: Request, env: OperationsEnv, token: string, profile: Profile, cors: Headers) {
  if (request.method !== "POST") return methodNotAllowed(cors);
  if (profile.role !== "coach") throw new Error("Forbidden");
  const [calendarDocs, entryDocs, pinDocs] = await Promise.all([
    fetchCollection("calendarEvents", token, env.FIREBASE_PROJECT_ID), fetchCollection("timeEntries", token, env.FIREBASE_PROJECT_ID), fetchCollection("timeclockPins", token, env.FIREBASE_PROJECT_ID),
  ]);
  const calendar = calendarDocs.map((doc) => validateCalendar(fields(doc), text(fields(doc).createdByUid), true));
  const entries = entryDocs.map((doc) => fields(doc));
  const pins = pinDocs.map((doc) => fields(doc));
  if (calendar.length) await env.DB.batch(calendar.map((event) => calendarUpsert(env.DB, event)));
  if (entries.length) await env.DB.batch(entries.map((entry) => timeEntryUpsert(env.DB, entry)));
  if (pins.length) await env.DB.batch(pins.map((pin) => env.DB.prepare(`INSERT INTO timeclock_pins VALUES (?, ?, ?) ON CONFLICT(uid) DO UPDATE SET pin=excluded.pin, updated_at=excluded.updated_at`).bind(pin.uid, pin.pin, pin.updatedAt)));
  const [calendarRows, entryRows, pinRows] = await Promise.all([
    env.DB.prepare(`SELECT id, title, description, category, start_date AS startDate, end_date AS endDate, location, created_by_uid AS createdByUid, created_at AS createdAt FROM calendar_events`).all<Record<string, unknown>>(),
    env.DB.prepare(timeEntrySelect()).all<Record<string, unknown>>(),
    env.DB.prepare("SELECT uid, pin, updated_at AS updatedAt FROM timeclock_pins").all<Record<string, unknown>>(),
  ]);
  const calendarById = new Map(calendarRows.results.map((row) => [row.id, row]));
  const entriesById = new Map(entryRows.results.map((row) => [row.id, row]));
  const pinsByUid = new Map(pinRows.results.map((row) => [row.uid, row]));
  const valuesMatch = (source: Record<string, unknown>, target: Record<string, unknown> | undefined, keys: string[]) => Boolean(target && keys.every((key) => (source[key] ?? null) === (target[key] ?? null)));
  if (!calendar.every((event) => valuesMatch(event, calendarById.get(event.id), ["id", "title", "description", "category", "startDate", "endDate", "location", "createdByUid", "createdAt"])) ||
      !entries.every((entry) => valuesMatch(entry, entriesById.get(entry.id), ["id", "uid", "activity", "activityName", "clockIn", "clockOut", "clockedInByUid", "clockedOutByUid"])) ||
      !pins.every((pin) => valuesMatch(pin, pinsByUid.get(pin.uid), ["uid", "pin", "updatedAt"]))) {
    throw new Error("Migration verification failed");
  }
  const counts = {
    calendarEvents: (await env.DB.prepare("SELECT count(*) AS count FROM calendar_events").first<{ count: number }>())?.count ?? 0,
    timeEntries: (await env.DB.prepare("SELECT count(*) AS count FROM time_entries").first<{ count: number }>())?.count ?? 0,
    timeclockPins: (await env.DB.prepare("SELECT count(*) AS count FROM timeclock_pins").first<{ count: number }>())?.count ?? 0,
  };
  if (counts.calendarEvents < calendar.length || counts.timeEntries < entries.length || counts.timeclockPins < pins.length) throw new Error("Migration verification failed");
  return json({ copied: { calendarEvents: calendar.length, timeEntries: entries.length, timeclockPins: pins.length }, verified: counts, deviceSessions: "migrate lazily as each device reconnects" }, 200, cors);
}

async function fetchProfile(uid: string, token: string, projectId: string): Promise<Profile> {
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error("Forbidden");
  const doc = await response.json<FirestoreDocument>();
  return { role: doc.fields?.role?.stringValue ?? "", subteam: doc.fields?.subteam?.stringValue ?? null };
}
async function fetchCollection(name: string, token: string, projectId: string) {
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${name}?pageSize=1000`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error("Forbidden");
  return (await response.json<{ documents?: FirestoreDocument[] }>()).documents ?? [];
}
function fields(doc: FirestoreDocument) { return Object.fromEntries(Object.entries(doc.fields ?? {}).map(([key, value]) => [key, value.stringValue ?? null])) as Record<string, unknown>; }
function asRecord(value: unknown) { if (!value || typeof value !== "object") throw new Error("Invalid request"); return value as Record<string, unknown>; }
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function json(body: unknown, status: number, headers: Headers) { const next = new Headers(headers); next.set("Content-Type", "application/json; charset=utf-8"); return new Response(JSON.stringify(body), { status, headers: next }); }
function methodNotAllowed(headers: Headers) { return new Response("Method not allowed", { status: 405, headers }); }
