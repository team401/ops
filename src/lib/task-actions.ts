import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  arrayRemove,
  writeBatch,
} from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";
import type { Task, TaskStatus, TaskHistoryEntry, TaskComment, TaskAttachment } from "@/types";
import { appendD1TaskAttachment, appendD1TaskComment, coreUsesD1, createD1Task, deleteD1Task, fetchTasks, patchD1Task } from "@/lib/core-api";

async function currentTask(taskId: string) { const task = (await fetchTasks()).find((item) => item.id === taskId); if (!task) throw new Error("Task not found."); return task; }

export async function createTask(
  input: Omit<Task, "id" | "createdAt" | "updatedAt" | "status" | "assigneeUids" | "history"> & {
    assigneeUids?: string[];
  }
) {
  const ref = doc(collection(db, "tasks"));
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
    id: coreUsesD1() ? crypto.randomUUID() : ref.id,
    status: "backlog",
    createdAt: now,
    updatedAt: now,
    history,
  };
  if (coreUsesD1()) await createD1Task(task); else await setDoc(ref, task);
  return task;
}

export async function updateTask(taskId: string, changes: Partial<Task>) {
  if (coreUsesD1()) { await patchD1Task(taskId, { ...changes, updatedAt: new Date().toISOString() }); return; }
  await updateDoc(doc(db, "tasks", taskId), {
    ...changes,
    updatedAt: new Date().toISOString(),
  });
}

export async function addTaskComment(taskId: string, body: string, authorUid: string) {
  const comment: TaskComment = {
    id: crypto.randomUUID(),
    body: body.trim(),
    authorUid,
    createdAt: new Date().toISOString(),
  };
  if (coreUsesD1()) { await appendD1TaskComment(taskId, comment); return comment; }
  await updateDoc(doc(db, "tasks", taskId), {
    comments: arrayUnion(comment),
    updatedAt: comment.createdAt,
  });
  return comment;
}

export async function uploadTaskAttachment(taskId: string, file: File, uploadedByUid: string) {
  const id = crypto.randomUUID();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `task-attachments/${taskId}/${id}/${safeName}`;
  const attachmentApiUrl = process.env.NEXT_PUBLIC_OPS_API_URL?.replace(/\/$/, "");
  if (attachmentApiUrl) {
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
      if (coreUsesD1()) { await appendD1TaskAttachment(taskId, attachment); return attachment; }
      await updateDoc(doc(db, "tasks", taskId), {
        attachments: arrayUnion(attachment),
        updatedAt: attachment.createdAt,
      });
    } catch (error) {
      await deleteR2Attachment(taskId, attachment).catch(() => undefined);
      throw error;
    }
    return attachment;
  }

  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file, {
    contentType: file.type || "application/octet-stream",
    // Attachment paths contain a UUID, so a changed file always gets a new URL.
    // Browsers and CDNs can therefore cache the bytes without serving stale images.
    cacheControl: "public,max-age=31536000,immutable",
  });
  const attachment: TaskAttachment = {
    id,
    name: file.name,
    url: await getDownloadURL(storageRef),
    storagePath,
    storageProvider: "firebase",
    contentType: file.type || "application/octet-stream",
    size: file.size,
    uploadedByUid,
    createdAt: new Date().toISOString(),
  };
  try {
    await updateDoc(doc(db, "tasks", taskId), {
      attachments: arrayUnion(attachment),
      updatedAt: attachment.createdAt,
    });
  } catch (error) {
    await deleteObject(storageRef).catch(() => undefined);
    throw error;
  }
  return attachment;
}

export async function removeTaskAttachment(taskId: string, attachment: TaskAttachment) {
  await deleteAttachmentObject(taskId, attachment);
  if (coreUsesD1()) { const task = await currentTask(taskId); await patchD1Task(taskId, { attachments: task.attachments.filter((item) => item.id !== attachment.id), updatedAt: new Date().toISOString() }); return; }
  await updateDoc(doc(db, "tasks", taskId), {
    attachments: arrayRemove(attachment),
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteTask(task: Task) {
  await Promise.allSettled(
    (task.attachments ?? []).map((attachment) => deleteAttachmentObject(task.id, attachment))
  );
  if (coreUsesD1()) await deleteD1Task(task.id); else await deleteDoc(doc(db, "tasks", task.id));
}

async function deleteAttachmentObject(taskId: string, attachment: TaskAttachment) {
  if (attachment.storageProvider === "r2") {
    await deleteR2Attachment(taskId, attachment);
    return;
  }
  await deleteObject(ref(storage, attachment.storagePath));
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
  if (coreUsesD1()) { const task = await currentTask(taskId); await patchD1Task(taskId, { assigneeUids: [...task.assigneeUids, studentUid], history: [...task.history, entry], updatedAt: entry.at }); return; }
  await updateDoc(doc(db, "tasks", taskId), {
    assigneeUids: arrayUnion(studentUid),
    history: arrayUnion(entry),
    updatedAt: new Date().toISOString(),
  });
}

// A student removing themselves from a task they're on. Other assignees (if
// any) are left in place and the status is left as-is.
export async function leaveTask(taskId: string, uid: string) {
  const entry: TaskHistoryEntry = { type: "unassigned", uid, at: new Date().toISOString() };
  if (coreUsesD1()) { const task = await currentTask(taskId); await patchD1Task(taskId, { assigneeUids: task.assigneeUids.filter((item) => item !== uid), history: [...task.history, entry], updatedAt: entry.at }); return; }
  await updateDoc(doc(db, "tasks", taskId), {
    assigneeUids: arrayRemove(uid),
    history: arrayUnion(entry),
    updatedAt: new Date().toISOString(),
  });
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
  if (coreUsesD1()) { await patchD1Task(task.id, { assigneeUids: newAssigneeUids, history: [...task.history, ...newEntries], updatedAt: now }); return; }
  await updateDoc(doc(db, "tasks", task.id), {
    assigneeUids: newAssigneeUids,
    history: [...task.history, ...newEntries],
    updatedAt: now,
  });
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
  if (coreUsesD1()) { await patchD1Task(task.id, { status, history: newEntries.length > 0 ? [...task.history, ...newEntries] : task.history, updatedAt: now }); return; }
  await updateDoc(doc(db, "tasks", task.id), {
    status,
    history: newEntries.length > 0 ? [...task.history, ...newEntries] : task.history,
    updatedAt: now,
  });
}

export async function reorderTasks(updates: Array<{ id: string; status: TaskStatus; order: number }>) {
  if (updates.length === 0) return;
  if (coreUsesD1()) { const now = new Date().toISOString(); await Promise.all(updates.map((update) => patchD1Task(update.id, { status: update.status, order: update.order, updatedAt: now }))); return; }
  const batch = writeBatch(db);
  const now = new Date().toISOString();
  updates.forEach((update) => {
    batch.update(doc(db, "tasks", update.id), {
      status: update.status,
      order: update.order,
      updatedAt: now,
    });
  });
  await batch.commit();
}

export async function archiveTask(taskId: string, actorUid: string) {
  const now = new Date().toISOString();
  if (coreUsesD1()) { await patchD1Task(taskId, { archived: true, archivedAt: now, archivedByUid: actorUid, status: "done", updatedAt: now }); return; }
  await updateDoc(doc(db, "tasks", taskId), {
    archived: true,
    archivedAt: now,
    archivedByUid: actorUid,
    status: "done",
    updatedAt: now,
  });
}

export async function restoreTask(taskId: string) {
  if (coreUsesD1()) { await patchD1Task(taskId, { archived: false, archivedAt: null, archivedByUid: null, status: "done", updatedAt: new Date().toISOString() }); return; }
  await updateDoc(doc(db, "tasks", taskId), {
    archived: false,
    archivedAt: null,
    archivedByUid: null,
    status: "done",
    updatedAt: new Date().toISOString(),
  });
}
