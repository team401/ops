"use client";

import { useState, useRef, FormEvent, ChangeEvent, DragEvent } from "react";
import type { Task, Subteam, Priority, Certification, UserProfile, TaskStatus, BlockedReason, TaskAttachment } from "@/types";
import { TASK_STATUSES } from "@/types";
import { SUBTEAM_META } from "@/lib/subteam-meta";
import { createTask, updateTask, deleteTask, leaveTask, setAssignees, moveTaskStatus, addTaskComment, uploadTaskAttachment, removeTaskAttachment, incompletePrerequisites } from "@/lib/task-actions";
import { useAuth } from "@/context/auth-context";
import { UserPicker } from "@/components/user-picker";
import { ModalBackdrop } from "@/components/modal-backdrop";

const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: "Backlog",
  in_progress: "In progress",
  review: "Review",
  blocked: "Stuck",
  done: "Done",
};

const BLOCKED_REASON_LABEL: Record<BlockedReason, string> = {
  parts: "Waiting on parts / order",
  information: "Waiting on information",
  approval: "Waiting on approval",
  prerequisite: "Waiting on prerequisite",
  other: "Other",
};

interface TaskDialogProps {
  mode: "create" | "edit";
  defaultSubteam: Subteam;
  editableSubteams: Subteam[];
  certifications: Certification[];
  users: UserProfile[];
  tasks: Task[];
  task?: Task;
  onClose: () => void;
}

export function TaskDialog({
  mode,
  defaultSubteam,
  editableSubteams,
  certifications,
  users,
  tasks,
  task,
  onClose,
}: TaskDialogProps) {
  const { profile, isCoach, canManageSubteam } = useAuth();
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [leadersOnly, setLeadersOnly] = useState(task?.leadersOnly ?? false);
  const [subteam, setSubteam] = useState<Subteam>(task?.subteam ?? defaultSubteam);
  const [priority, setPriority] = useState<Priority>(task?.priority ?? "medium");
  const [dueDate, setDueDate] = useState(task?.dueDate?.slice(0, 10) ?? "");
  const [requiredCertificationIds, setRequiredCertificationIds] = useState<string[]>(
    task?.requiredCertificationIds ?? []
  );
  const [requireAll, setRequireAll] = useState(task?.requireAllCertifications ?? false);
  const [assigneeUids, setAssigneeUids] = useState<string[]>(task?.assigneeUids ?? []);
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "backlog");
  const [pointOfContactUid, setPointOfContactUid] = useState(task?.pointOfContactUid ?? task?.createdByUid ?? "");
  const [blockedReason, setBlockedReason] = useState<BlockedReason | "">(task?.blockedReason ?? "");
  const [blockedDetails, setBlockedDetails] = useState(task?.blockedDetails ?? "");
  const [prerequisiteTaskIds, setPrerequisiteTaskIds] = useState<string[]>(task?.prerequisiteTaskIds ?? []);
  const [comments, setComments] = useState(task?.comments ?? []);
  const [commentBody, setCommentBody] = useState("");
  const [attachments, setAttachments] = useState(task?.attachments ?? []);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const dragDepth = useRef(0);
  const [changingStatus, setChangingStatus] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canManageThisTask = task ? canManageSubteam(task.subteam) : true;
  const canDelete = mode === "edit" && task && canManageSubteam(task.subteam);
  const readOnly = mode === "edit" && !canManageThisTask;
  const isOnThisTask = !!(task && profile && task.assigneeUids.includes(profile.uid));
  const hasStatusControl = mode === "edit" && (canManageThisTask || isOnThisTask);
  const canAttach = !readOnly || isOnThisTask;

  // Assignment is deliberately cross-subteam. A leaders-only task cannot be
  // assigned to someone who is not allowed to see it.
  const visibleUsers = leadersOnly ? users.filter((user) => user.role !== "student") : users;
  const assignableUsers = visibleUsers;

  const creator = task ? users.find((u) => u.uid === task.createdByUid) : undefined;
  const incomplete = task ? incompletePrerequisites({ ...task, prerequisiteTaskIds }, tasks) : [];

  const prerequisiteOptions = tasks.filter((candidate) => {
    if (candidate.id === task?.id) return false;
    if (!leadersOnly && candidate.leadersOnly) return false;
    if (!task) return true;
    const visited = new Set<string>();
    const dependsOnCurrentTask = (candidateId: string): boolean => {
      if (candidateId === task.id) return true;
      if (visited.has(candidateId)) return false;
      visited.add(candidateId);
      const found = tasks.find((item) => item.id === candidateId);
      return (found?.prerequisiteTaskIds ?? []).some(dependsOnCurrentTask);
    };
    return !dependsOnCurrentTask(candidate.id);
  });

  function toggleCert(id: string) {
    setRequiredCertificationIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  function handleLeadersOnlyChange(checked: boolean) {
    setLeadersOnly(checked);
    if (checked) {
      const leaderUids = new Set(
        users.filter((user) => user.role !== "student").map((user) => user.uid)
      );
      setAssigneeUids((current) => current.filter((uid) => leaderUids.has(uid)));
      if (pointOfContactUid && !leaderUids.has(pointOfContactUid)) {
        setPointOfContactUid(profile?.uid ?? "");
      }
    } else {
      const privateTaskIds = new Set(
        tasks.filter((candidate) => candidate.leadersOnly).map((candidate) => candidate.id)
      );
      setPrerequisiteTaskIds((current) => current.filter((id) => !privateTaskIds.has(id)));
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "create") {
        const created = await createTask({
          title,
          description,
          leadersOnly,
          subteam,
          priority,
          requiredCertificationIds,
          requireAllCertifications: requireAll,
          createdByUid: profile.uid,
          pointOfContactUid: pointOfContactUid || profile.uid,
          blockedReason: blockedReason || null,
          blockedDetails,
          prerequisiteTaskIds,
          comments: [],
          attachments: [],
          dueDate: dueDate ? new Date(dueDate).toISOString() : null,
          assigneeUids,
        });
        if (pendingFiles.length > 0) {
          const results = await Promise.allSettled(
            pendingFiles.map((file) => uploadTaskAttachment(created.id, file, profile.uid))
          );
          if (results.some((result) => result.status === "rejected")) {
            alert("The task was created, but at least one attachment could not be uploaded. You can add it again from the task details.");
          }
        }
      } else if (task) {
        await updateTask(task.id, {
          title,
          description,
          leadersOnly,
          subteam,
          priority,
          requiredCertificationIds,
          requireAllCertifications: requireAll,
          dueDate: dueDate ? new Date(dueDate).toISOString() : null,
          pointOfContactUid: pointOfContactUid || task.createdByUid,
          blockedReason: blockedReason || null,
          blockedDetails,
          prerequisiteTaskIds,
        });
        const changed =
          assigneeUids.length !== task.assigneeUids.length ||
          assigneeUids.some((uid) => !task.assigneeUids.includes(uid));
        if (changed) {
          await setAssignees(task, assigneeUids);
        }
      }
      onClose();
    } catch {
      setError("Something went wrong saving this task. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!task) return;
    if (!confirm(`Delete "${task.title}"? This can't be undone.`)) return;
    await deleteTask(task);
    onClose();
  }

  async function handleLeave() {
    if (!task || !profile) return;
    await leaveTask(task.id, profile.uid);
    onClose();
  }

  async function handleStatusChange(newStatus: TaskStatus) {
    if (!task || newStatus === status) return;
    setChangingStatus(true);
    setError(null);
    try {
      if (newStatus === "blocked" && !blockedReason) {
        setBlockedReason("other");
        await updateTask(task.id, { blockedReason: "other" });
      }
      await moveTaskStatus(task, newStatus, tasks);
      setStatus(newStatus);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not change the task status.");
    } finally {
      setChangingStatus(false);
    }
  }

  function togglePrerequisite(id: string) {
    setPrerequisiteTaskIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  async function handleAddComment() {
    if (!task || !profile || !commentBody.trim()) return;
    setError(null);
    try {
      const comment = await addTaskComment(task.id, commentBody, profile.uid);
      setComments((current) => [...current, comment]);
      setCommentBody("");
    } catch {
      setError("Could not post that update. Try again.");
    }
  }

  async function handleSelectedFiles(files: File[]) {
    if (files.length === 0) return;
    if (files.some((file) => file.size > 20 * 1024 * 1024)) {
      setError("Each attachment must be 20 MB or smaller.");
      return;
    }
    if (!task || !profile) {
      setPendingFiles((current) => [...current, ...files]);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const results = await Promise.allSettled(files.map((file) => uploadTaskAttachment(task.id, file, profile.uid)));
      const uploaded = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
      setAttachments((current) => [...current, ...uploaded]);
      if (results.some((result) => result.status === "rejected")) {
        setError("At least one file could not be uploaded. Try again.");
      }
    } catch {
      setError("Files could not be uploaded. Try again.");
    } finally {
      setUploading(false);
    }
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    void handleSelectedFiles(files);
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!canAttach) return;
    dragDepth.current += 1;
    setDragActive(true);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!canAttach) return;
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!canAttach) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragActive(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!canAttach) return;
    dragDepth.current = 0;
    setDragActive(false);
    void handleSelectedFiles(Array.from(event.dataTransfer.files));
  }

  async function handleRemoveAttachment(attachment: TaskAttachment) {
    if (!task) return;
    try {
      await removeTaskAttachment(task.id, attachment);
      setAttachments((current) => current.filter((item) => item.id !== attachment.id));
    } catch {
      setError("Could not remove that attachment.");
    }
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-paper-raised border border-steel-line rounded w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="tracked-label text-xs text-blueprint font-bold">
            {mode === "create" ? "New task" : readOnly ? "Task" : "Edit task"}
          </h2>
          <button type="button" onClick={onClose} className="text-steel text-sm">
            Close
          </button>
        </div>

        {task && (
          <p className="text-xs text-steel">
            Created by {creator?.displayName ?? "someone no longer on the roster"} on{" "}
            {new Date(task.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        )}

        {hasStatusControl && (
          <label className="block">
            <span className="tracked-label text-xs text-steel">Status</span>
            <select
              className="input mt-1"
              value={status}
              disabled={changingStatus}
              onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
            >
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        )}
        {mode === "edit" && !hasStatusControl && task && (
          <p className="text-xs text-steel">
            Status: <span className="text-ink">{STATUS_LABEL[task.status]}</span>
          </p>
        )}

        {status === "blocked" && (
          <div className="rounded border border-hazard/50 bg-hazard/10 p-3 space-y-3">
            <label className="block">
              <span className="tracked-label text-xs text-steel">Why is this task stuck?</span>
              <select
                className="input mt-1"
                value={blockedReason}
                onChange={(e) => setBlockedReason(e.target.value as BlockedReason)}
                disabled={readOnly}
                required={!readOnly}
              >
                <option value="">Select a reason</option>
                {Object.entries(BLOCKED_REASON_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="tracked-label text-xs text-steel">What are we waiting on?</span>
              <textarea
                className="input mt-1"
                rows={2}
                value={blockedDetails}
                onChange={(e) => setBlockedDetails(e.target.value)}
                disabled={readOnly}
                placeholder="Order number, person to follow up with, next check-in…"
              />
            </label>
          </div>
        )}

        <label className="block">
          <span className="tracked-label text-xs text-steel">Title</span>
          <input
            className="input mt-1"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            disabled={readOnly}
          />
        </label>

        <label className="block">
          <span className="tracked-label text-xs text-steel">Description</span>
          <textarea
            className="input mt-1"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={readOnly}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="tracked-label text-xs text-steel">Subteam</span>
            <select
              className="input mt-1"
              value={subteam}
              onChange={(e) => setSubteam(e.target.value as Subteam)}
              disabled={readOnly || (mode === "edit" && !isCoach)}
            >
              {editableSubteams.map((s) => (
                <option key={s} value={s}>
                  {SUBTEAM_META[s].label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="tracked-label text-xs text-steel">Priority</span>
            <select
              className="input mt-1"
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              disabled={readOnly}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>

        <label className="block">
          <span className="tracked-label text-xs text-steel">Due date (optional)</span>
          <input
            type="date"
            className="input mt-1"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            disabled={readOnly}
          />
        </label>

        {(!readOnly || leadersOnly) && (
          <label className="flex items-start gap-3 rounded border border-steel-line bg-surface p-3">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4"
              checked={leadersOnly}
              onChange={(e) => handleLeadersOnlyChange(e.target.checked)}
              disabled={readOnly}
            />
            <span>
              <span className="block text-sm font-semibold">Leaders only</span>
              <span className="mt-0.5 block text-xs text-steel">
                Only coaches and student leaders can see this task. Ordinary students will not see it on boards, calendars, reports, or task lists.
              </span>
            </span>
          </label>
        )}

        {!readOnly && (
          <div>
            <span className="tracked-label text-xs text-steel">Assignees</span>
            <div className="mt-1.5">
              <UserPicker
                users={assignableUsers}
                selectedUids={assigneeUids}
                onChange={setAssigneeUids}
              />
            </div>
            {assignableUsers.length === 0 && (
              <p className="text-xs text-steel mt-1">No one is on the roster yet.</p>
            )}
          </div>
        )}
        {readOnly && (
          <div>
            <span className="tracked-label text-xs text-steel">Assignees</span>
            <p className="text-sm mt-1">
              {task && task.assigneeUids.length > 0
                ? users
                  .filter((u) => task.assigneeUids.includes(u.uid))
                  .map((u) => u.displayName)
                  .join(", ")
                : "Unclaimed"}
            </p>
          </div>
        )}

        <label className="block">
          <span className="tracked-label text-xs text-steel">Point of contact</span>
          <select
            className="input mt-1"
            value={pointOfContactUid}
            onChange={(e) => setPointOfContactUid(e.target.value)}
            disabled={readOnly}
          >
            <option value="">Task creator ({creator?.displayName ?? profile?.displayName ?? "current user"})</option>
            {visibleUsers.map((user) => (
              <option key={user.uid} value={user.uid}>{user.displayName}</option>
            ))}
          </select>
          <p className="text-xs text-steel mt-1">The person to ask when someone gets stuck or needs clarification.</p>
        </label>

        <div>
          <span className="tracked-label text-xs text-steel">Required certifications</span>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {certifications
              .filter((c) => c.subteam === null || c.subteam === subteam)
              .map((c) => (
                <button
                  type="button"
                  key={c.id}
                  disabled={readOnly}
                  onClick={() => toggleCert(c.id)}
                  className={`text-xs px-2 py-1 rounded-sm border ${requiredCertificationIds.includes(c.id)
                      ? "bg-blueprint text-white border-blueprint"
                      : "bg-surface text-steel border-steel-line"
                    }`}
                >
                  {c.name}
                </button>
              ))}
          </div>
          {requiredCertificationIds.length > 1 && (
            <label className="flex items-center gap-2 mt-2 text-xs text-steel">
              <input
                type="checkbox"
                checked={requireAll}
                onChange={(e) => setRequireAll(e.target.checked)}
                disabled={readOnly}
              />
              Require all selected certifications (default: any one is enough)
            </label>
          )}
        </div>

        <div>
          <span className="tracked-label text-xs text-steel">Prerequisite tasks</span>
          <p className="text-xs text-steel mt-1">All selected tasks must be done before this one can start.</p>
          <div className="mt-2 max-h-36 overflow-y-auto rounded border border-steel-line bg-surface">
            {prerequisiteOptions.length === 0 ? (
              <p className="text-xs text-steel p-3">No other tasks are available.</p>
            ) : prerequisiteOptions.map((candidate) => (
              <label key={candidate.id} className="flex items-start gap-2 px-3 py-2 border-b border-steel-line last:border-b-0 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={prerequisiteTaskIds.includes(candidate.id)}
                  onChange={() => togglePrerequisite(candidate.id)}
                  disabled={readOnly}
                />
                <span className="min-w-0">
                  <span className="block truncate">{candidate.title}</span>
                  <span className={`tracked-label text-[9px] ${candidate.status === "done" ? "text-success" : "text-steel"}`}>
                    {STATUS_LABEL[candidate.status]}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {incomplete.length > 0 && (
            <p className="text-xs text-hazard mt-2">
              Waiting on: {incomplete.map((item) => item.title).join(", ")}
            </p>
          )}
        </div>

        <div
          className={`border rounded p-3 transition-colors ${dragActive
            ? "border-blueprint bg-blueprint/10"
            : "border-dashed border-steel-line"
          }`}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="tracked-label text-xs text-steel">Attachments ({attachments.length + pendingFiles.length})</span>
            {canAttach && (
              <label className="btn-secondary text-xs cursor-pointer">
                {uploading ? "Uploading…" : "Add files"}
                <input type="file" multiple className="sr-only" onChange={handleFiles} disabled={uploading} />
              </label>
            )}
          </div>
          <p className={`text-xs mt-1 ${dragActive ? "text-blueprint font-medium" : "text-steel"}`}>
            {dragActive ? "Drop files here to attach them" : "Drag files here, or choose images and files up to 20 MB each."}
          </p>
          {(attachments.length > 0 || pendingFiles.length > 0) && (
            <div className="mt-2 space-y-1.5">
              {attachments.map((attachment) => (
                <div key={attachment.id} className="flex items-center gap-2 rounded border border-steel-line bg-surface px-2.5 py-2 text-sm">
                  <span aria-hidden="true">{attachment.contentType.startsWith("image/") ? "▧" : "▤"}</span>
                  <a href={attachment.url} target="_blank" rel="noreferrer" className="text-blueprint hover:underline truncate flex-1">
                    {attachment.name}
                  </a>
                  <span className="text-[10px] text-steel shrink-0">{formatFileSize(attachment.size)}</span>
                  {(canManageThisTask || isOnThisTask) && (
                    <button type="button" onClick={() => handleRemoveAttachment(attachment)} className="text-danger text-xs">Remove</button>
                  )}
                </div>
              ))}
              {pendingFiles.map((file, index) => (
                <div key={`${file.name}-${index}`} className="flex items-center gap-2 rounded border border-dashed border-steel-line px-2.5 py-2 text-sm">
                  <span className="truncate flex-1">{file.name}</span>
                  <span className="text-[10px] text-steel">Uploads when the task is created</span>
                  <button type="button" onClick={() => setPendingFiles((current) => current.filter((_, i) => i !== index))} className="text-danger text-xs">Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {task && (
          <div className="border-t border-steel-line pt-4">
            <span className="tracked-label text-xs text-steel">Updates ({comments.length})</span>
            <div className="mt-2 space-y-2 max-h-52 overflow-y-auto">
              {comments.length === 0 && <p className="text-xs text-steel">No updates yet.</p>}
              {comments.map((comment) => {
                const author = users.find((user) => user.uid === comment.authorUid);
                return (
                  <div key={comment.id} className="rounded border border-steel-line bg-surface p-2.5">
                    <div className="flex justify-between gap-2 text-[10px] text-steel">
                      <span className="font-semibold text-ink">{author?.displayName ?? "Former team member"}</span>
                      <time>{new Date(comment.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time>
                    </div>
                    <p className="text-sm mt-1 whitespace-pre-wrap">{comment.body}</p>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 mt-2">
              <textarea
                className="input"
                rows={2}
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="Share progress, new details, or a question…"
                maxLength={2000}
              />
              <button type="button" onClick={handleAddComment} disabled={!commentBody.trim()} className="btn-secondary self-end">Post</button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex items-center gap-2 pt-2">
          {!readOnly && (
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? "Saving…" : mode === "create" ? "Create task" : "Save changes"}
            </button>
          )}
          {isOnThisTask && (
            <button type="button" onClick={handleLeave} className="btn-secondary">
              Leave task
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              className="text-danger text-xs tracked-label ml-auto"
            >
              Delete task
            </button>
          )}
        </div>
      </form>
    </ModalBackdrop>
  );
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
