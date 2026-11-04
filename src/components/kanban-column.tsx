"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Task, TaskStatus, Certification, UserProfile } from "@/types";
import { TaskCard } from "@/components/task-card";

const STATUS_META: Record<TaskStatus, { label: string }> = {
  backlog: { label: "Backlog" },
  in_progress: { label: "In progress" },
  blocked: { label: "Stuck" },
  review: { label: "Review" },
  done: { label: "Done" },
};

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
  draggable: boolean;
}

export function KanbanColumn({
  status, tasks, allTasks, certifications, users, onOpenTask, collapsed, onToggleCollapsed, shouldCollapseCard, draggable,
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
        className={`${collapsed ? "hidden md:block" : "block"} min-h-[120px] flex-1 rounded-lg border border-dashed p-1.5 transition-colors xl:overflow-y-auto xl:overscroll-contain ${isOver ? "border-blueprint bg-blueprint/5" : "border-steel-line/60"
          }`}
      >
        <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {tasks.map((task) => (
              <TaskCard key={task.id} task={task} tasks={allTasks} certifications={certifications} users={users}
                draggable={draggable && !task.archived} defaultCollapsed={shouldCollapseCard(task)} onOpen={() => onOpenTask(task)} />
            ))}
          </div>
        </SortableContext>
        {tasks.length === 0 && <p className="text-xs text-steel/60 text-center py-6">Nothing here</p>}
      </div>
    </div>
  );
}
