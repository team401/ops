import { auth } from "@/lib/firebase";
import type { Task, TaskStatus, TaskHistoryEntry, TaskComment, TaskAttachment } from "@/types";
import { appendD1TaskAttachment, appendD1TaskComment, createD1Task, deleteD1Task, fetchTasks, patchD1Task } from "@/lib/core-api";

async function currentTask(taskId: string) { const task = (await fetchTasks()).find((item) => item.id === taskId); if (!task) throw new Error("Task not found."); return task; }

export async function createTask(
  input: Omit<Task, "id" | "createdAt" | "updatedAt" | "status" | "assigneeUids" | "history"> & {
    assigneeUids?: string[];
  }
) {
  const now = new Date().toISOString();
  const assigneeUids = input.assigneeUids ?? [];
  const history: TaskHistoryEntry[] = assigneeUids.map((uid) => ({
    type: "assigned",
    uid,
    at: now,
  }));
  const task: Task = {
    ...input,
    assigneeUids,
    id: crypto.randomUUID(),
    status: "backlog",
    createdAt: now,
    updatedAt: now,
    history,
  };
  await createD1Task(task);
  return task;
}

export async function updateTask(taskId: string, changes: Partial<Task>) {
  await patchD1Task(taskId, { ...changes, updatedAt: new Date().toISOString() });
}

export async function addTaskComment(taskId: string, body: string, authorUid: string) {
  const comment: TaskComment = {
    id: crypto.randomUUID(),
    body: body.trim(),
    authorUid,
    createdAt: new Date().toISOString(),
  };
  await appendD1TaskComment(taskId, comment);
  return comment;
}

export async function uploadTaskAttachment(taskId: string, file: File, uploadedByUid: string) {
  const id = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const attachmentApiUrl = process.env.NEXT_PUBLIC_OPS_API_URL?.replace(/\/$/, "");
  if (!attachmentApiUrl) throw new Error("The R2 attachment service is unavailable.");
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Sign in again before uploading an attachment.");
  const response = await fetch(
    `${attachmentApiUrl}/attachments/${encodeURIComponent(taskId)}/${encodeURIComponent(id)}/${encodeURIComponent(safeName)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    },
  );
  const result = await response.json() as { url?: string; key?: string; error?: string };
  if (!response.ok || !result.url || !result.key) throw new Error(result.error ?? "The attachment could not be uploaded to R2.");
  const attachment: TaskAttachment = {
    id,
    name: file.name,
    url: result.url,
    storagePath: result.key,
    storageProvider: "r2",
    contentType: file.type || "application/octet-stream",
    size: file.size,
    uploadedByUid,
    createdAt: new Date().toISOString(),
  };
  try {
    await appendD1TaskAttachment(taskId, attachment);
  } catch (error) {
    await deleteR2Attachment(taskId, attachment).catch(() => undefined);
    throw error;
  }
  return attachment;
}

export async function removeTaskAttachment(taskId: string, attachment: TaskAttachment) {
  await deleteAttachmentObject(taskId, attachment);
  const task = await currentTask(taskId);
  await patchD1Task(taskId, { attachments: task.attachments.filter((item) => item.id !== attachment.id), updatedAt: new Date().toISOString() });
}

export async function deleteTask(task: Task) {
  await Promise.allSettled(
    (task.attachments ?? []).map((attachment) => deleteAttachmentObject(task.id, attachment))
  );
  await deleteD1Task(task.id);
}

async function deleteAttachmentObject(taskId: string, attachment: TaskAttachment) {
  await deleteR2Attachment(taskId, attachment);
}

async function deleteR2Attachment(taskId: string, attachment: TaskAttachment) {
  const attachmentApiUrl = process.env.NEXT_PUBLIC_OPS_API_URL?.replace(/\/$/, "");
  const token = await auth.currentUser?.getIdToken();
  if (!attachmentApiUrl || !token) throw new Error("R2 attachment service is unavailable.");
  const safeName = attachment.storagePath.split("/").at(-1) ?? attachment.name;
  const response = await fetch(
    `${attachmentApiUrl}/attachments/${encodeURIComponent(taskId)}/${encodeURIComponent(attachment.id)}/${encodeURIComponent(safeName)}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok && response.status !== 404) throw new Error("The R2 attachment could not be deleted.");
}

// A student joining an open task they're certified for. Security rules
// re-check the certification match server-side — this is just for a fast,
// friendly failure client-side.
export async function claimTask(taskId: string, studentUid: string) {
  const entry: TaskHistoryEntry = { type: "assigned", uid: studentUid, at: new Date().toISOString() };
  const task = await currentTask(taskId);
  await patchD1Task(taskId, { assigneeUids: [...task.assigneeUids, studentUid], history: [...task.history, entry], updatedAt: entry.at });
}

// A student removing themselves from a task they're on. Other assignees (if
// any) are left in place and the status is left as-is.
export async function leaveTask(taskId: string, uid: string) {
  const entry: TaskHistoryEntry = { type: "unassigned", uid, at: new Date().toISOString() };
  const task = await currentTask(taskId);
  await patchD1Task(taskId, { assigneeUids: task.assigneeUids.filter((item) => item !== uid), history: [...task.history, entry], updatedAt: entry.at });
}

// Coach/leader setting the full assignee list directly from the task dialog.
// Diffs against the task's current assignees so the history log stays
// accurate (who was added, who was removed, when).
export async function setAssignees(task: Task, newAssigneeUids: string[]) {
  const now = new Date().toISOString();
  const added = newAssigneeUids.filter((uid) => !task.assigneeUids.includes(uid));
  const removed = task.assigneeUids.filter((uid) => !newAssigneeUids.includes(uid));
  const newEntries: TaskHistoryEntry[] = [
    ...added.map((uid) => ({ type: "assigned" as const, uid, at: now })),
    ...removed.map((uid) => ({ type: "unassigned" as const, uid, at: now })),
  ];
  await patchD1Task(task.id, { assigneeUids: newAssigneeUids, history: [...task.history, ...newEntries], updatedAt: now });
}

export function incompletePrerequisites(task: Task, tasks: Task[]) {
  const prerequisiteIds = task.prerequisiteTaskIds ?? [];
  return prerequisiteIds
    .map((id) => tasks.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is Task => candidate !== undefined && candidate.status !== "done");
}

export async function moveTaskStatus(task: Task, status: TaskStatus, tasks: Task[] = []) {
  if (["in_progress", "review", "done"].includes(status)) {
    const incomplete = incompletePrerequisites(task, tasks);
    if (incomplete.length > 0) {
      throw new Error(`Complete prerequisite${incomplete.length === 1 ? "" : "s"} first: ${incomplete.map((item) => item.title).join(", ")}`);
    }
  }
  const now = new Date().toISOString();
  const newEntries: TaskHistoryEntry[] =
    status === "done"
      ? task.assigneeUids.map((uid) => ({ type: "completed" as const, uid, at: now }))
      : [];
  await patchD1Task(task.id, { status, history: newEntries.length > 0 ? [...task.history, ...newEntries] : task.history, updatedAt: now });
}

export async function reorderTasks(updates: Array<{ id: string; status: TaskStatus; order: number }>) {
  if (updates.length === 0) return;
  const now = new Date().toISOString();
  await Promise.all(updates.map((update) => patchD1Task(update.id, { status: update.status, order: update.order, updatedAt: now })));
}

export async function archiveTask(taskId: string, actorUid: string) {
  const now = new Date().toISOString();
  await patchD1Task(taskId, { archived: true, archivedAt: now, archivedByUid: actorUid, status: "done", updatedAt: now });
}

export async function restoreTask(taskId: string) {
  await patchD1Task(taskId, { archived: false, archivedAt: null, archivedByUid: null, status: "done", updatedAt: new Date().toISOString() });
}
