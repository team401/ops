import { collection, doc, getDocs, runTransaction } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { Task, TaskAttachment } from "@/types";

export interface LegacyAttachmentCandidate {
  taskId: string;
  taskTitle: string;
  attachment: TaskAttachment;
}

export async function inspectLegacyAttachments() {
  const snapshot = await getDocs(collection(db, "tasks"));
  return snapshot.docs.flatMap((taskDocument) => {
    const task = taskDocument.data() as Task;
    return (task.attachments ?? [])
      .filter((attachment) => attachment.storageProvider !== "r2")
      .map((attachment) => ({ taskId: taskDocument.id, taskTitle: task.title, attachment }));
  });
}

export async function migrateLegacyAttachment(candidate: LegacyAttachmentCandidate) {
  const apiUrl = process.env.NEXT_PUBLIC_OPS_API_URL?.replace(/\/$/, "");
  const token = await auth.currentUser?.getIdToken();
  if (!apiUrl || !token) throw new Error("The R2 migration service is unavailable.");
  const safeName = candidate.attachment.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const response = await fetch(
    `${apiUrl}/migrations/attachments/${encodeURIComponent(candidate.taskId)}/${encodeURIComponent(candidate.attachment.id)}/${encodeURIComponent(safeName)}`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } },
  );
  const result = await response.json() as { error?: string; key?: string; url?: string; size?: number; contentType?: string };
  if (!response.ok || !result.key || !result.url) throw new Error(result.error ?? "The attachment could not be migrated.");

  await runTransaction(db, async (transaction) => {
    const taskRef = doc(db, "tasks", candidate.taskId);
    const snapshot = await transaction.get(taskRef);
    if (!snapshot.exists()) throw new Error("The task no longer exists.");
    const task = snapshot.data() as Task;
    const current = (task.attachments ?? []).find((attachment) => attachment.id === candidate.attachment.id);
    if (!current || current.storageProvider === "r2") return;
    const replacement: TaskAttachment = {
      ...current,
      url: result.url!,
      storagePath: result.key!,
      storageProvider: "r2",
      size: result.size ?? current.size,
      contentType: result.contentType ?? current.contentType,
    };
    transaction.update(taskRef, {
      attachments: task.attachments.map((attachment) => attachment.id === current.id ? replacement : attachment),
      updatedAt: new Date().toISOString(),
    });
  });
}
