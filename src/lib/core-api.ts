import { auth } from "@/lib/firebase";
import type { Task, UserProfile } from "@/types";

const baseUrl = () => process.env.NEXT_PUBLIC_OPS_API_URL?.replace(/\/$/, "");
export const coreUsesD1 = () => Boolean(baseUrl());
async function request<T>(path: string, init?: RequestInit): Promise<T> { const token = await auth.currentUser?.getIdToken(); if (!baseUrl() || !token) throw new Error("The Ops data service is unavailable."); const response = await fetch(`${baseUrl()}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers } }); if (response.status === 204) return undefined as T; const body = await response.json() as T & { error?: string }; if (!response.ok) throw new Error(body.error ?? "The Ops data request failed."); return body; }
const changed = (domain: string) => window.dispatchEvent(new Event(`ops:${domain}-changed`));
export const fetchUsers = () => request<UserProfile[]>("/users");
export const fetchUser = (uid: string) => request<UserProfile>(`/users/${encodeURIComponent(uid)}`);
export async function saveUser(user: UserProfile) { const result = await request<UserProfile>(`/users/${encodeURIComponent(user.uid)}`, { method: "PUT", body: JSON.stringify(user) }); changed("users"); return result; }
export async function deleteD1User(uid: string) { await request<void>(`/users/${encodeURIComponent(uid)}`, { method: "DELETE" }); changed("users"); }
export const fetchTasks = () => request<Task[]>("/tasks");
export async function createD1Task(task: Task) { const result = await request<Task>("/tasks", { method: "POST", body: JSON.stringify(task) }); changed("tasks"); return result; }
export async function patchD1Task(id: string, changes: Partial<Task>) { const result = await request<Task>(`/tasks/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(changes) }); changed("tasks"); return result; }
export async function deleteD1Task(id: string) { await request<void>(`/tasks/${encodeURIComponent(id)}`, { method: "DELETE" }); changed("tasks"); }
export const migrateCoreToD1 = () => request<{ copied: { users: number; tasks: number }; verified: { users: number; tasks: number } }>("/migrations/core", { method: "POST" });
