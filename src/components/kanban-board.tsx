"use client";

import { useMemo, useState } from "react";
import { DndContext, DragEndEvent, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import type { Task, TaskStatus, Subteam, Certification, UserProfile } from "@/types";
import { TASK_STATUSES } from "@/types";
import { KanbanColumn } from "@/components/kanban-column";
import { TaskDialog } from "@/components/task-dialog";
import { moveTaskStatus } from "@/lib/task-actions";

interface KanbanBoardProps {
  tasks: Task[];
  certifications: Certification[];
  users: UserProfile[];
  // Board is scoped to one subteam (subteam board) or shows all (global board).
  subteam?: Subteam;
  createDefaultSubteam: Subteam;
  editableSubteams: Subteam[];
}

export function KanbanBoard({
  tasks,
  certifications,
  users,
  subteam,
  createDefaultSubteam,
  editableSubteams,
}: KanbanBoardProps) {
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  // Mouse: drag starts after a small movement, same as before. Touch: drag
  // only starts after a brief press-and-hold, so a normal swipe still
  // scrolls the page instead of immediately grabbing the card.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } })
  );

  const scopedTasks = useMemo(
    () => (subteam ? tasks.filter((t) => t.subteam === subteam) : tasks),
    [tasks, subteam]
  );

  function tasksFor(status: TaskStatus) {
    return scopedTasks.filter((t) => t.status === status);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const newStatus = over.id as TaskStatus;
    const task = scopedTasks.find((t) => t.id === active.id);
    if (!task || task.status === newStatus) return;
    try {
      await moveTaskStatus(task, newStatus, tasks);
    } catch (caught) {
      alert(caught instanceof Error ? caught.message : "Could not move that task.");
    }
  }

  const canCreateHere = editableSubteams.length > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-steel">
          {scopedTasks.length} task{scopedTasks.length === 1 ? "" : "s"}
        </p>
        {canCreateHere && (
          <button onClick={() => setCreating(true)} className="btn-primary text-sm">
            + New task
          </button>
        )}
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 gap-3 pb-4 md:grid-cols-2 xl:flex xl:overflow-x-auto">
          {TASK_STATUSES.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              tasks={tasksFor(status)}
              allTasks={tasks}
              certifications={certifications}
              users={users}
              onOpenTask={setOpenTask}
            />
          ))}
        </div>
      </DndContext>

      {openTask && (
        <TaskDialog
          mode="edit"
          task={openTask}
          defaultSubteam={openTask.subteam}
          editableSubteams={editableSubteams.length > 0 ? editableSubteams : [openTask.subteam]}
          certifications={certifications}
          users={users}
          tasks={tasks}
          onClose={() => setOpenTask(null)}
        />
      )}
      {creating && (
        <TaskDialog
          mode="create"
          defaultSubteam={createDefaultSubteam}
          editableSubteams={editableSubteams}
          certifications={certifications}
          users={users}
          tasks={tasks}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}
