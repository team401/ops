"use client";

import { useDroppable } from "@dnd-kit/core";
import type { Task, TaskStatus, Certification, UserProfile } from "@/types";
import { TaskCard } from "@/components/task-card";

const STATUS_META: Record<TaskStatus, { label: string; step: string }> = {
  backlog: { label: "Backlog", step: "01" },
  in_progress: { label: "In progress", step: "02" },
  blocked: { label: "Stuck", step: "03" },
  review: { label: "Review", step: "04" },
  done: { label: "Done", step: "05" },
};

interface KanbanColumnProps {
  status: TaskStatus;
  tasks: Task[];
  allTasks: Task[];
  certifications: Certification[];
  users: UserProfile[];
  onOpenTask: (task: Task) => void;
}

export function KanbanColumn({
  status, tasks, allTasks, certifications, users, onOpenTask,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const meta = STATUS_META[status];

  return (
    <div className="flex w-full flex-col xl:h-[calc(100dvh-14rem)] xl:min-h-[360px] xl:min-w-[240px] xl:flex-1 xl:shrink-0">
      <div className="flex items-baseline gap-2 px-1 py-2 mb-2 sticky top-0 z-20 bg-paper/95 backdrop-blur-sm">
        <span className="tracked-label text-[10px] text-steel">{meta.step}</span>
        <h3 className="tracked-label text-xs font-bold">{meta.label}</h3>
        <span className="text-[10px] text-steel ml-auto">{tasks.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`min-h-[120px] flex-1 space-y-2 rounded border border-dashed p-2 transition-colors xl:overflow-y-auto xl:overscroll-contain ${isOver ? "border-blueprint bg-blueprint/5" : "border-steel-line/60"
          }`}
      >
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} tasks={allTasks} certifications={certifications} users={users}
            draggable onOpen={() => onOpenTask(task)} />
        ))}
        {tasks.length === 0 && <p className="text-xs text-steel/60 text-center py-6">Nothing here</p>}
      </div>
    </div>
  );
}
