/// <reference types="@cloudflare/workers-types" />

import { notifyUsers, type NotificationEnv } from "./notifications";

type CoreEnv = NotificationEnv;
type User = { uid: string; displayName: string; email: string; role: "coach" | "student_leader" | "student"; subteam: string | null; certificationIds: string[]; createdAt: string; mustResetPassword: boolean };
type Task = Record<string, unknown> & { id: string; title: string; subteam: string; status: string; leadersOnly: boolean; archived: boolean; order: number; updatedAt: string; assigneeUids: string[]; createdByUid: string; pointOfContactUid?: string; comments: Array<Record<string, unknown>>; attachments: Array<Record<string, unknown>>; history: Array<Record<string, unknown>> };
const idPattern = /^[A-Za-z0-9_-]+$/;

export function isCoreRoute(path: string) { return path === "/users" || path.startsWith("/users/") || path === "/tasks" || path.startsWith("/tasks/"); }

export async function handleCore(request: Request, env: CoreEnv, uid: string, cors: Headers) {
  try {
    const path = new URL(request.url).pathname;
    const profile = await getUser(env.DB, uid);
    if (!profile) throw new Error("Forbidden");
    if (path === "/users" || path.startsWith("/users/")) return usersRoute(request, env.DB, profile, cors);
    return tasksRoute(request, env, profile, cors);
  } catch (error) {
    console.error("Core API request failed", error);
    const message = error instanceof Error ? error.message : "Data request failed";
    const status = message === "Forbidden" ? 403 : message === "Not found" ? 404 : message.startsWith("Invalid") ? 400 : 500;
    return json({ error: status === 500 ? "Data request failed" : message }, status, cors);
  }
}

async function usersRoute(request: Request, db: D1Database, actor: User, cors: Headers) {
  const id = decodeURIComponent(new URL(request.url).pathname.split("/")[2] ?? "");
  if (request.method === "GET" && !id) {
    const rows = await db.prepare("SELECT * FROM users ORDER BY display_name COLLATE NOCASE").all<Record<string, unknown>>();
    return json(rows.results.map(rowToUser), 200, cors);
  }
  if (!idPattern.test(id)) throw new Error("Invalid user ID");
  if (request.method === "GET") { const user = await getUser(db, id); if (!user) throw new Error("Not found"); return json(user, 200, cors); }
  if (request.method === "PUT") {
    const user = validateUser({ ...await request.json<Record<string, unknown>>(), uid: id });
    const existing = await getUser(db, id);
    const leaderCertChange = actor.role === "student_leader" && existing && existing.role !== "coach" && existing.subteam === actor.subteam && JSON.stringify({ ...user, certificationIds: existing.certificationIds }) === JSON.stringify(existing);
    const selfChange = id === actor.uid && user.role === actor.role && user.subteam === actor.subteam && JSON.stringify(user.certificationIds) === JSON.stringify(actor.certificationIds);
    if (actor.role !== "coach" && !leaderCertChange && !selfChange) throw new Error("Forbidden");
    await userUpsert(db, user).run(); return json(user, 200, cors);
  }
  if (request.method === "DELETE") { if (actor.role !== "coach") throw new Error("Forbidden"); await db.prepare("DELETE FROM users WHERE uid = ?").bind(id).run(); return new Response(null, { status: 204, headers: cors }); }
  return methodNotAllowed(cors);
}

async function tasksRoute(request: Request, env: CoreEnv, actor: User, cors: Headers) {
  const db = env.DB;
  const pathParts = new URL(request.url).pathname.split("/");
  const id = decodeURIComponent(pathParts[2] ?? "");
  if (request.method === "GET" && !id) {
    const result = actor.role === "student"
      ? await db.prepare("SELECT data FROM tasks WHERE leaders_only = 0").all<{ data: string }>()
      : await db.prepare("SELECT data FROM tasks").all<{ data: string }>();
    return json(result.results.map((row) => JSON.parse(row.data)), 200, cors);
  }
  if (request.method === "POST" && !id) {
    const task = validateTask(await request.json());
    if (task.createdByUid !== actor.uid || (task.leadersOnly && actor.role === "student")) throw new Error("Forbidden");
    await taskUpsert(db, task).run();
    await notifyUsers(env, task.assigneeUids.filter((recipient) => recipient !== actor.uid), { type: "assignment", title: "New task assignment", body: task.title, taskId: task.id }).catch(console.error);
    return json(task, 201, cors);
  }
  if (!idPattern.test(id)) throw new Error("Invalid task ID");
  const existing = await getTask(db, id); if (!existing) throw new Error("Not found");
  const editor = actor.role === "coach" || actor.role === "student_leader";
  const canDelete = actor.role === "coach" || (actor.role === "student_leader" && actor.subteam === existing.subteam);
  if (pathParts[3] === "comments" && request.method === "POST") {
    const comment = await request.json<Record<string, unknown>>();
    if (typeof comment.id !== "string" || !idPattern.test(comment.id) || typeof comment.body !== "string" || !comment.body.trim() || comment.body.length > 2000 || comment.authorUid !== actor.uid || typeof comment.createdAt !== "string") throw new Error("Invalid comment");
    const task = validateTask({ ...existing, comments: [...existing.comments, { ...comment, body: comment.body.trim() }], updatedAt: comment.createdAt });
    await taskUpsert(db, task).run();
    await notifyUsers(env, taskParticipants(task).filter((recipient) => recipient !== actor.uid), { type: "comment", title: `New update on ${task.title}`, body: comment.body.trim(), taskId: task.id }).catch(console.error);
    return json(task, 200, cors);
  }
  if (pathParts[3] === "attachments" && request.method === "POST") {
    if (!canEditTaskContent(existing, actor)) throw new Error("Forbidden");
    const attachment = await request.json<Record<string, unknown>>();
    if (typeof attachment.id !== "string" || typeof attachment.url !== "string" || typeof attachment.storagePath !== "string") throw new Error("Invalid attachment");
    const task = validateTask({ ...existing, attachments: [...existing.attachments, attachment], updatedAt: new Date().toISOString() });
    await taskUpsert(db, task).run();
    return json(task, 200, cors);
  }
  if (request.method === "DELETE") { if (!canDelete) throw new Error("Forbidden"); await db.prepare("DELETE FROM tasks WHERE id = ?").bind(id).run(); return new Response(null, { status: 204, headers: cors }); }
  if (request.method === "PATCH") {
    const changes = await request.json<Record<string, unknown>>();
    if (!editor && !allowedTaskPatch(existing, changes, actor)) throw new Error("Forbidden");
    const task = validateTask({ ...existing, ...changes, id });
    if (actor.role === "student" && task.leadersOnly) throw new Error("Forbidden");
    await taskUpsert(db, task).run();
    const newlyAssigned = task.assigneeUids.filter((recipient) => !existing.assigneeUids.includes(recipient) && recipient !== actor.uid);
    await notifyUsers(env, newlyAssigned, { type: "assignment", title: "Task assigned to you", body: task.title, taskId: task.id }).catch(console.error);
    if (task.status !== existing.status) {
      await notifyUsers(env, taskParticipants(task).filter((recipient) => recipient !== actor.uid), { type: "status", title: `${task.title} moved to ${statusLabel(task.status)}`, body: "Open the task to see the latest status.", taskId: task.id }).catch(console.error);
    }
    return json(task, 200, cors);
  }
  return methodNotAllowed(cors);
}

function allowedTaskPatch(task: Task, changes: Record<string, unknown>, actor: User) {
  const keys = Object.keys(changes);
  const only = (allowed: string[]) => keys.every((key) => allowed.includes(key));
  if (only(["status", "order", "updatedAt", "history"])) return true;
  const contentKeys = new Set(["title", "description"]);
  const certificationKeys = new Set(["requiredCertificationIds", "requireAllCertifications"]);
  if (only(["title", "description", "requiredCertificationIds", "requireAllCertifications", "updatedAt"])) {
    const changesContent = keys.some((key) => contentKeys.has(key));
    const changesCertifications = keys.some((key) => certificationKeys.has(key));
    return (!changesContent || canEditTaskContent(task, actor)) && (!changesCertifications || actor.role === "student");
  }
  if (only(["comments", "updatedAt"])) {
    const next = Array.isArray(changes.comments) ? changes.comments as Array<Record<string, unknown>> : [];
    const added = next.at(-1);
    return next.length === task.comments.length + 1 && JSON.stringify(next.slice(0, -1)) === JSON.stringify(task.comments) && added?.authorUid === actor.uid && typeof added.body === "string" && added.body.length > 0 && added.body.length <= 2000;
  }
  if (only(["attachments", "updatedAt"]) && task.assigneeUids.includes(actor.uid)) {
    const next = Array.isArray(changes.attachments) ? changes.attachments as Array<Record<string, unknown>> : [];
    const beforeIds = new Set(task.attachments.map((item) => item.id)); const afterIds = new Set(next.map((item) => item.id));
    const delta = [...new Set([...beforeIds, ...afterIds])].filter((id) => beforeIds.has(id) !== afterIds.has(id));
    return Math.abs(next.length - task.attachments.length) === 1 && delta.length === 1;
  }
  if (only(["assigneeUids", "updatedAt", "history"])) {
    const next = Array.isArray(changes.assigneeUids) ? changes.assigneeUids.filter((value): value is string => typeof value === "string") : [];
    const before = new Set(task.assigneeUids); const after = new Set(next);
    const changed = [...new Set([...before, ...after])].filter((uid) => before.has(uid) !== after.has(uid));
    if (changed.length !== 1 || changed[0] !== actor.uid) return false;
    if (!before.has(actor.uid) && after.has(actor.uid)) {
      const required = Array.isArray(task.requiredCertificationIds) ? task.requiredCertificationIds.filter((id): id is string => typeof id === "string") : [];
      return required.length === 0 || (task.requireAllCertifications === true ? required.every((id) => actor.certificationIds.includes(id)) : required.some((id) => actor.certificationIds.includes(id)));
    }
    return true;
  }
  return false;
}

function canEditTaskContent(task: Task, actor: User) {
  return actor.role === "coach" || actor.role === "student_leader" || task.createdByUid === actor.uid ||
    actor.subteam === task.subteam || task.assigneeUids.includes(actor.uid);
}

function taskParticipants(task: Task) {
  return [...new Set([...task.assigneeUids, task.createdByUid, task.pointOfContactUid ?? ""].filter(Boolean))];
}

function statusLabel(status: string) {
  return ({ backlog: "Backlog", in_progress: "In progress", blocked: "Stuck", review: "Review", done: "Done" } as Record<string, string>)[status] ?? status;
}

function validateTask(value: unknown): Task {
  if (!value || typeof value !== "object") throw new Error("Invalid task");
  const task = value as Task;
  if (!idPattern.test(task.id) || typeof task.title !== "string" || !task.title.trim() || typeof task.subteam !== "string" || typeof task.status !== "string" || typeof task.updatedAt !== "string" || !Array.isArray(task.assigneeUids)) throw new Error("Invalid task");
  return { ...task, leadersOnly: Boolean(task.leadersOnly), archived: Boolean(task.archived), order: Number(task.order) || 0, comments: task.comments ?? [], attachments: task.attachments ?? [], history: task.history ?? [] };
}
function taskUpsert(db: D1Database, task: Task) { return db.prepare(`INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, subteam=excluded.subteam, status=excluded.status, leaders_only=excluded.leaders_only, archived=excluded.archived, sort_order=excluded.sort_order, updated_at=excluded.updated_at, data=excluded.data`).bind(task.id, task.title, task.subteam, task.status, task.leadersOnly ? 1 : 0, task.archived ? 1 : 0, task.order, task.updatedAt, JSON.stringify(task)); }
async function getTask(db: D1Database, id: string) { const row = await db.prepare("SELECT data FROM tasks WHERE id = ?").bind(id).first<{ data: string }>(); return row ? JSON.parse(row.data) as Task : null; }

function validateUser(value: Record<string, unknown>): User {
  const user = { uid: string(value.uid), displayName: string(value.displayName), email: string(value.email), role: string(value.role) as User["role"], subteam: typeof value.subteam === "string" ? value.subteam : null, certificationIds: Array.isArray(value.certificationIds) ? value.certificationIds.filter((id): id is string => typeof id === "string") : [], createdAt: string(value.createdAt), mustResetPassword: Boolean(value.mustResetPassword) };
  if (!idPattern.test(user.uid) || !user.displayName || !user.email || !["coach", "student_leader", "student"].includes(user.role)) throw new Error("Invalid user"); return user;
}
function userUpsert(db: D1Database, user: User) { return db.prepare(`INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(uid) DO UPDATE SET display_name=excluded.display_name,email=excluded.email,role=excluded.role,subteam=excluded.subteam,certification_ids=excluded.certification_ids,must_reset_password=excluded.must_reset_password`).bind(user.uid, user.displayName, user.email, user.role, user.subteam, JSON.stringify(user.certificationIds), user.createdAt, user.mustResetPassword ? 1 : 0); }
export async function getUser(db: D1Database, uid: string): Promise<User | null> { const row = await db.prepare("SELECT * FROM users WHERE uid = ?").bind(uid).first<Record<string, unknown>>(); return row ? rowToUser(row) : null; }
function rowToUser(row: Record<string, unknown>): User { return { uid: string(row.uid), displayName: string(row.display_name), email: string(row.email), role: string(row.role) as User["role"], subteam: typeof row.subteam === "string" ? row.subteam : null, certificationIds: JSON.parse(string(row.certification_ids) || "[]"), createdAt: string(row.created_at), mustResetPassword: row.must_reset_password === 1 }; }

function string(value: unknown) { return typeof value === "string" ? value : ""; }
function json(body: unknown, status: number, headers: Headers) { const next = new Headers(headers); next.set("Content-Type", "application/json; charset=utf-8"); return new Response(JSON.stringify(body), { status, headers: next }); }
function methodNotAllowed(headers: Headers) { return new Response("Method not allowed", { status: 405, headers }); }
