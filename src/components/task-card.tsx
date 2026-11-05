"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ExternalLink, GripVertical } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Task, Certification, UserProfile } from "@/types";
import { SUBTEAM_META } from "@/lib/subteam-meta";
import { useAuth } from "@/context/auth-context";
import { claimTask, incompletePrerequisites } from "@/lib/task-actions";

const PRIORITY_MARK: Record<Task["priority"], { label: string; color: string }> = {
  high: { label: "High", color: "var(--danger)" }, medium: { label: "Medium", color: "var(--hazard)" }, low: { label: "Low", color: "var(--steel)" },
};
const BLOCKED_REASON_LABEL: Record<NonNullable<Task["blockedReason"]>, string> = {
  parts: "Waiting on parts / order", information: "Waiting on information", approval: "Waiting on approval", prerequisite: "Waiting on prerequisite", other: "Blocked",
};

export function TaskCard({ task, tasks, certifications, users, draggable, onOpen, defaultCollapsed = false, active = false, anotherCardActive = false, onActivate, onDeactivate }: {
  task: Task; tasks: Task[]; certifications: Certification[]; users: UserProfile[]; draggable: boolean; onOpen: () => void; defaultCollapsed?: boolean;
  active?: boolean; anotherCardActive?: boolean; onActivate?: () => void; onDeactivate?: () => void;
}) {
  const { profile, actualProfile } = useAuth();
  const [collapsedOverride, setCollapsedOverride] = useState<boolean | null>(null);
  const collapsed = active ? false : anotherCardActive ? true : collapsedOverride ?? defaultCollapsed;
  const cardRef = useRef<HTMLElement | null>(null);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: !draggable, data: { status: task.status } });
  const meta = SUBTEAM_META[task.subteam];
  const assignees = users.filter((user) => task.assigneeUids.includes(user.uid));
  const imageAttachments = (task.attachments ?? []).filter((attachment) => attachment.contentType.startsWith("image/"));
  const requiredCerts = certifications.filter((certification) => task.requiredCertificationIds.includes(certification.id));
  const contact = users.find((user) => user.uid === (task.pointOfContactUid || task.createdByUid));
  const incomplete = incompletePrerequisites(task, tasks);
  const latestComment = useMemo(() => [...(task.comments ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0], [task.comments]);
  const latestCommentAuthor = users.find((user) => user.uid === latestComment?.authorUid);
  const firstLink = task.links?.[0];
  const alreadyOn = !!profile && task.assigneeUids.includes(profile.uid);
  const isEligible = !!profile && (task.requiredCertificationIds.length === 0 || (task.requireAllCertifications
    ? task.requiredCertificationIds.every((id) => profile.certificationIds.includes(id))
    : task.requiredCertificationIds.some((id) => profile.certificationIds.includes(id))));
  const canClaim = task.assigneeUids.length === 0 && isEligible && (profile?.role === "student" || profile?.role === "student_leader");

  useEffect(() => {
    if (!active && collapsedOverride !== false) return;
    function collapseAfterOutsideClick(event: PointerEvent) {
      if (!cardRef.current?.contains(event.target as Node)) {
        if (active) onDeactivate?.();
        else setCollapsedOverride(true);
      }
    }
    document.addEventListener("pointerdown", collapseAfterOutsideClick);
    return () => document.removeEventListener("pointerdown", collapseAfterOutsideClick);
  }, [active, collapsedOverride, onDeactivate]);

  function handleCardAction() {
    if (collapsed) {
      if (onActivate) onActivate();
      else setCollapsedOverride(false);
      return;
    }
    onOpen();
  }

  return (
    <article
      ref={(node) => {
        cardRef.current = node;
        setNodeRef(node);
      }}
      role="button"
      tabIndex={0}
      aria-label={`${collapsed ? "Expand" : "Open"} task: ${task.title}`}
      aria-expanded={!collapsed}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("a, button")) return;
        handleCardAction();
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        handleCardAction();
      }}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0 : 1, backgroundColor: `color-mix(in srgb, ${meta.color} 9%, var(--surface))`, borderLeftColor: meta.color }}
      className="relative cursor-pointer rounded-lg border border-l-4 border-steel-line text-ink shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blueprint"
    >
      <div className="flex items-start gap-1 p-2.5">
        <div className="min-w-0 flex-1 text-left">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold" style={{ color: `color-mix(in srgb, ${meta.color} 70%, var(--ink))` }}>
                <span className="tracked-label">{meta.label}</span>
                <span className="mx-1 text-steel">—</span>
                <span className="text-ink">{assignees.length > 0 ? assignees.map((item) => item.displayName).join(", ") : "Unclaimed"}</span>
              </span>
              {task.leadersOnly && <span className="rounded-full bg-blueprint/12 px-1.5 py-0.5 text-[9px] font-bold text-blueprint">Leaders only</span>}
              {task.archived && <span className="rounded-full bg-hazard/15 px-1.5 py-0.5 text-[9px] font-bold text-hazard">Archived</span>}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <span className="rounded-full border border-steel-line bg-surface/80 px-1.5 py-0.5 text-[9px] font-bold" style={{ color: PRIORITY_MARK[task.priority].color }}>{PRIORITY_MARK[task.priority].label}</span>
              {draggable && <button
                type="button"
                {...attributes}
                {...listeners}
                onClick={(event) => event.stopPropagation()}
                className="flex h-9 w-9 touch-none items-center justify-center rounded-md text-steel hover:bg-ink/5 hover:text-ink active:cursor-grabbing"
                aria-label={`Drag ${task.title}`}
                title="Drag task"
              ><GripVertical size={17} /></button>}
            </div>
          </div>
          <p className="mt-1 break-words text-sm font-semibold leading-snug">{task.title}</p>
        </div>
      </div>
      <div className={`px-2.5 ${collapsed ? "pb-1" : "pb-2.5"}`}>
        {(task.status === "blocked" || incomplete.length > 0) && <div className="mb-1.5 rounded-md border border-hazard/35 bg-hazard/10 px-2 py-1.5 text-xs">{incomplete.length > 0 ? `Waiting on ${incomplete.map((item) => item.title).join(", ")}` : `${task.blockedReason ? BLOCKED_REASON_LABEL[task.blockedReason] : "Stuck"}${task.blockedDetails ? ` — ${task.blockedDetails}` : ""}`}</div>}
        {!collapsed && <>
          {firstLink && <a href={firstLink.url} target="_blank" rel="noopener noreferrer" onPointerDown={(event) => event.stopPropagation()} className="mb-1.5 flex items-center gap-1.5 rounded-md border border-blueprint/20 bg-blueprint/8 px-2 py-1.5 text-xs font-medium text-blueprint hover:bg-blueprint/15"><ExternalLink size={12} /><span className="truncate">{firstLink.label || firstLink.url}</span></a>}
          {task.description && <p className="mb-1.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-ink/85">{task.description}</p>}
          {imageAttachments.length > 0 && <div className={`mb-1.5 grid gap-1.5 ${imageAttachments.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>{imageAttachments.map((attachment) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={attachment.id} src={attachment.url} alt={attachment.name} className="max-h-40 w-full rounded-md border border-steel-line bg-surface object-contain" loading="lazy" />
          ))}</div>}
          {requiredCerts.length > 0 && <div className="mb-1.5 flex flex-wrap gap-1">{requiredCerts.map((certification) => <span key={certification.id} className="rounded-full border border-steel-line bg-surface px-1.5 py-0.5 text-[9px] font-bold text-steel">{certification.name}</span>)}</div>}
          {latestComment && <div className="mb-1.5 rounded-md border border-steel-line bg-surface/75 px-2 py-1.5"><p className="text-[10px] font-semibold text-steel">Latest update · {latestCommentAuthor?.displayName ?? "Former team member"}</p><p className="mt-0.5 whitespace-pre-wrap break-words text-xs">{latestComment.body}</p></div>}
        </>}
        {!collapsed && <div className="mt-1 flex items-start justify-between gap-2 text-[11px] text-steel"><span>POC: {contact?.displayName ?? "Task creator"}</span><span className="shrink-0">{task.dueDate ? `due ${new Date(task.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}` : formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}</span></div>}
      </div>
      {canClaim && <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); if (profile) claimTask(task.id, actualProfile?.uid ?? profile.uid); }} className="w-full border-t border-success/30 bg-success/10 py-2 text-center text-[10px] font-bold hover:bg-success/20">Claim task</button>}
      {!alreadyOn && !isEligible && task.requiredCertificationIds.length > 0 && <div className="w-full border-t border-danger/30 bg-danger/10 py-1.5 text-center text-[10px] font-bold">Certification required</div>}
    </article>
  );
}
