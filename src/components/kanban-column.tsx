"use client";

import { Fragment } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, type SortingStrategy } from "@dnd-kit/sortable";
import type { Task, TaskStatus, Certification, UserProfile } from "@/types";
import { TaskCard } from "@/components/task-card";

const STATUS_META: Record<TaskStatus, { label: string }> = {
  backlog: { label: "Backlog" },
  in_progress: { label: "In progress" },
  blocked: { label: "Stuck" },
  review: { label: "Review" },
  done: { label: "Done" },
};

// The board renders its own insertion preview. Returning no transforms keeps
// dnd-kit from also opening a second slot and shifting the entire task list.
const insertionPreviewStrategy: SortingStrategy = () => null;

interface KanbanColumnProps {
  status: TaskStatus;
  tasks: Task[];
  allTasks: Task[];
  certifications: Certification[];
  users: UserProfile[];
  onOpenTask: (task: Task) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  shouldCollapseCard: (task: Task) => boolean;
  activeTaskId: string | null;
  onActivateTask: (taskId: string) => void;
  onDeactivateTask: () => void;
  draggable: boolean;
  dropPreview: { task: Task | null; index: number } | null;
}

export function KanbanColumn({
  status, tasks, allTasks, certifications, users, onOpenTask, collapsed, onToggleCollapsed, shouldCollapseCard, activeTaskId, onActivateTask, onDeactivateTask, draggable, dropPreview,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const meta = STATUS_META[status];

  return (
    <div className="flex w-full flex-col xl:min-h-0 xl:min-w-[240px] xl:flex-1 xl:shrink-0">
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="sticky top-0 z-20 mb-1 flex w-full items-center gap-2 rounded-md bg-paper/95 px-2 py-2 text-left backdrop-blur-sm hover:bg-blueprint/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blueprint md:pointer-events-none md:px-1 md:py-1.5 md:hover:bg-paper/95"
        aria-label={`${collapsed ? "Expand" : "Collapse"} ${meta.label}`}
        aria-expanded={!collapsed}
      >
        <h3 className="tracked-label text-xs font-bold">{meta.label}</h3>
        <span className="ml-auto text-[10px] text-steel">{tasks.length}</span>
      </button>
      <div
        ref={setNodeRef}
        className={`${collapsed ? "hidden md:block" : "block"} min-h-[120px] flex-1 rounded-lg border border-dashed p-1.5 transition-colors xl:overflow-y-auto xl:overscroll-contain ${isOver || dropPreview ? "border-blueprint bg-blueprint/10 ring-2 ring-inset ring-blueprint/20" : "border-steel-line/60"
          }`}
      >
        <SortableContext items={tasks.map((task) => task.id)} strategy={insertionPreviewStrategy}>
          <div className="space-y-1.5">
            {tasks.map((task, index) => <Fragment key={task.id}>
              {dropPreview?.task && dropPreview.index === index && <TaskDropPreview task={dropPreview.task} users={users} />}
              <TaskCard task={task} tasks={allTasks} certifications={certifications} users={users}
                draggable={draggable && !task.archived} defaultCollapsed={shouldCollapseCard(task)} onOpen={() => onOpenTask(task)}
                active={activeTaskId === task.id} anotherCardActive={activeTaskId !== null && activeTaskId !== task.id}
                onActivate={() => onActivateTask(task.id)} onDeactivate={onDeactivateTask} />
            </Fragment>)}
            {dropPreview?.task && dropPreview.index >= tasks.length && <TaskDropPreview task={dropPreview.task} users={users} />}
          </div>
        </SortableContext>
        {tasks.length === 0 && !dropPreview && <p className="text-xs text-steel/60 text-center py-6">Nothing here</p>}
      </div>
    </div>
  );
}

function TaskDropPreview({ task, users }: { task: Task; users: UserProfile[] }) {
  const assignees = users.filter((user) => task.assigneeUids.includes(user.uid));
  return <div aria-hidden="true" className="mb-1.5 rounded-lg border-2 border-dashed border-blueprint bg-blueprint/12 px-3 py-2.5 text-ink opacity-75 shadow-inner">
    <p className="text-[10px] font-bold uppercase tracking-wide text-blueprint">Drop here</p>
    <p className="mt-1 break-words text-sm font-semibold leading-snug">{task.title}</p>
    <p className="mt-1 text-[10px] text-steel">{assignees.length > 0 ? assignees.map((user) => user.displayName).join(", ") : "Unclaimed"}</p>
  </div>;
}
