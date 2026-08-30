"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { formatDistanceToNow } from "date-fns";
import type { Task, Certification, UserProfile } from "@/types";
import { SUBTEAM_META } from "@/lib/subteam-meta";
import { useAuth } from "@/context/auth-context";
import { claimTask, incompletePrerequisites } from "@/lib/task-actions";

const PRIORITY_MARK: Record<Task["priority"], { label: string; color: string }> = {
  high: { label: "High", color: "var(--danger)" },
  medium: { label: "Medium", color: "var(--hazard)" },
  low: { label: "Low", color: "var(--steel)" },
};

const BLOCKED_REASON_LABEL: Record<NonNullable<Task["blockedReason"]>, string> = {
  parts: "Waiting on parts / order",
  information: "Waiting on information",
  approval: "Waiting on approval",
  prerequisite: "Waiting on prerequisite",
  other: "Blocked",
};

export function TaskCard({ task, tasks, certifications, users, draggable, onOpen }: {
  task: Task; tasks: Task[]; certifications: Certification[]; users: UserProfile[]; draggable: boolean; onOpen: () => void;
}) {
  const { profile } = useAuth();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, disabled: !draggable });
  const meta = SUBTEAM_META[task.subteam];
  const assignees = users.filter((u) => task.assigneeUids.includes(u.uid));
  const requiredCerts = certifications.filter((c) => task.requiredCertificationIds.includes(c.id));
  const contact = users.find((u) => u.uid === (task.pointOfContactUid || task.createdByUid));
  const incomplete = incompletePrerequisites(task, tasks);
  const alreadyOn = !!profile && task.assigneeUids.includes(profile.uid);
  const isEligible = !!profile && (task.requiredCertificationIds.length === 0 ||
    (task.requireAllCertifications
      ? task.requiredCertificationIds.every((id) => profile.certificationIds.includes(id))
      : task.requiredCertificationIds.some((id) => profile.certificationIds.includes(id))));
  const canClaim = task.assigneeUids.length === 0 && isEligible &&
    (profile?.role === "student" || profile?.role === "student_leader");
  const style = transform
    ? { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.5 : 1 }
    : undefined;

  return (
    <div ref={setNodeRef}
      style={{
        ...style,
        backgroundColor: `color-mix(in srgb, ${meta.color} 12%, var(--surface))`,
        borderLeftColor: meta.color,
      }}
      className="relative rounded-sm border border-l-4 border-ink/15 text-ink shadow-sm transition-shadow hover:shadow-md">
      <button onClick={onOpen} {...(draggable ? { ...listeners, ...attributes } : {})}
        className={`w-full p-3.5 text-left ${draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="tracked-label text-xs font-bold"
              style={{ color: `color-mix(in srgb, ${meta.color} 65%, var(--ink))` }}>{meta.label}</span>
            {task.leadersOnly && (
              <span className="tracked-label rounded-sm border border-blueprint/25 bg-blueprint/10 px-1.5 py-0.5 text-[9px] font-bold text-blueprint">
                Leaders only
              </span>
            )}
          </div>
          <span className="tracked-label rounded border border-ink/10 bg-surface/80 px-2 py-0.5 text-[11px] font-bold"
            style={{ color: `color-mix(in srgb, ${PRIORITY_MARK[task.priority].color} 65%, var(--ink))` }}
            title={`${task.priority} priority`}>
            {PRIORITY_MARK[task.priority].label}
          </span>
        </div>
        <p className="mt-2 text-base font-semibold leading-snug text-ink">{task.title}</p>
        {(task.status === "blocked" || incomplete.length > 0) && (
          <div className="mt-2.5 rounded-sm border border-ink/15 bg-surface/75 px-2.5 py-2 text-xs text-ink">
            {task.status === "blocked" ? (
              <span className="font-semibold">
                {task.blockedReason ? BLOCKED_REASON_LABEL[task.blockedReason] : "Stuck"}
                {task.blockedDetails ? ` — ${task.blockedDetails}` : ""}
              </span>
            ) : (
              <span>Waiting on {incomplete.length} prerequisite{incomplete.length === 1 ? "" : "s"}</span>
            )}
          </div>
        )}
        {requiredCerts.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {requiredCerts.map((c) => (
              <span key={c.id} className="tracked-label rounded-sm border border-steel-line bg-surface px-2 py-0.5 text-[10px] font-bold text-blueprint-deep">
                {c.name}
              </span>
            ))}
          </div>
        )}
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-dashed border-ink/20 pt-2.5">
          <span className="truncate text-sm font-medium text-ink">
            {assignees.length > 0 ? assignees.map((a) => a.displayName).join(", ") : "Unclaimed"}
          </span>
          <span className="shrink-0 whitespace-nowrap text-xs font-medium text-steel">
            {task.dueDate ? `due ${new Date(task.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}`
              : formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-xs font-medium text-steel">
          <span className="truncate">POC: {contact?.displayName ?? "Task creator"}</span>
          <span className="shrink-0 flex gap-2">
            {(task.attachments?.length ?? 0) > 0 && <span title="Attachments">▤ {task.attachments.length}</span>}
            {(task.comments?.length ?? 0) > 0 && <span title="Updates">◫ {task.comments.length}</span>}
          </span>
        </div>
      </button>
      {canClaim && (
        <button onClick={(e) => { e.stopPropagation(); if (profile) claimTask(task.id, profile.uid); }}
          className="tracked-label w-full border-t border-success/30 bg-success/10 py-2 text-center text-xs font-bold text-ink hover:bg-success/20">
          Claim task
        </button>
      )}
      {!alreadyOn && !isEligible && task.requiredCertificationIds.length > 0 && (
        <div className="tracked-label w-full border-t border-danger/30 bg-danger/10 py-2 text-center text-xs font-bold text-ink">
          Cert required
        </div>
      )}
    </div>
  );
}
