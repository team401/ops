"use client";

import { useDroppable } from "@dnd-kit/core";
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
}

export function KanbanColumn({
  status, tasks, allTasks, certifications, users, onOpenTask,
}: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const meta = STATUS_META[status];

  return (
    <div className="flex w-full flex-col xl:h-[calc(100dvh-10rem)] xl:min-h-[360px] xl:min-w-[240px] xl:flex-1 xl:shrink-0">
      <div className="sticky top-0 z-20 mb-1 flex items-baseline gap-2 bg-paper/95 px-1 py-1.5 backdrop-blur-sm">
        <h3 className="tracked-label text-xs font-bold">{meta.label}</h3>
        <span className="text-[10px] text-steel ml-auto">{tasks.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`min-h-[120px] flex-1 space-y-1.5 rounded border border-dashed p-1.5 transition-colors xl:overflow-y-auto xl:overscroll-contain ${isOver ? "border-blueprint bg-blueprint/5" : "border-steel-line/60"
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
