"use client";

import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { DndContext, DragEndEvent, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { Search } from "lucide-react";
import { arrayMove } from "@dnd-kit/sortable";
import type { Task, TaskStatus, Subteam, Certification, UserProfile } from "@/types";
import { TASK_STATUSES } from "@/types";
import { KanbanColumn } from "@/components/kanban-column";
import { TaskDialog } from "@/components/task-dialog";
import { incompletePrerequisites, reorderTasks } from "@/lib/task-actions";
import { taskMatchesSearch } from "@/lib/task-search";
import { getCardDefault, subscribeCardDefault } from "@/lib/card-preferences";
import { useAuth } from "@/context/auth-context";

interface KanbanBoardProps {
  tasks: Task[];
  certifications: Certification[];
  users: UserProfile[];
  // Board is scoped to one subteam (subteam board) or shows all (global board).
  subteam?: Subteam;
  createDefaultSubteam: Subteam;
  editableSubteams: Subteam[];
  toolbar?: ReactNode;
}

export function KanbanBoard({
  tasks,
  certifications,
  users,
  subteam,
  createDefaultSubteam,
  editableSubteams,
  toolbar,
}: KanbanBoardProps) {
  const { profile } = useAuth();
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [dragError, setDragError] = useState<string | null>(null);
  const cardDefault = useSyncExternalStore(subscribeCardDefault, getCardDefault, () => "collapsed");
  const [collapsedColumns, setCollapsedColumns] = useState<Set<TaskStatus>>(new Set());
  // Mouse: drag starts after a small movement, same as before. Touch: drag
  // only starts after a brief press-and-hold, so a normal swipe still
  // scrolls the page instead of immediately grabbing the card.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } })
  );

  const scopedTasks = useMemo(
    () => (subteam ? tasks.filter((t) => t.subteam === subteam) : tasks)
      .filter((task) => !task.archived || Boolean(search.trim()))
      .filter((task) => taskMatchesSearch(task, users, search)),
    [tasks, subteam, users, search]
  );

  const prerequisiteIds = useMemo(() => new Set(scopedTasks.flatMap((task) => task.prerequisiteTaskIds ?? [])), [scopedTasks]);

  function tasksFor(status: TaskStatus) {
    return scopedTasks.filter((task) => task.status === status).sort((a, b) => {
      const prerequisiteDifference = Number(prerequisiteIds.has(b.id)) - Number(prerequisiteIds.has(a.id));
      return prerequisiteDifference || a.order - b.order || a.createdAt.localeCompare(b.createdAt);
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const task = scopedTasks.find((t) => t.id === active.id);
    if (!task) return;
    const overTask = scopedTasks.find((candidate) => candidate.id === over.id);
    const newStatus = overTask?.status ?? over.data.current?.status ?? over.id as TaskStatus;
    if (!TASK_STATUSES.includes(newStatus)) return;
    try {
      if (["in_progress", "review", "done"].includes(newStatus)) {
        const incomplete = incompletePrerequisites(task, tasks);
        if (incomplete.length > 0) throw new Error(`Complete prerequisite${incomplete.length === 1 ? "" : "s"} first: ${incomplete.map((item) => item.title).join(", ")}`);
      }
      const updates: Array<{ id: string; status: TaskStatus; order: number }> = [];
      if (task.status === newStatus) {
        const column = tasksFor(newStatus);
        const oldIndex = column.findIndex((item) => item.id === task.id);
        const newIndex = overTask ? column.findIndex((item) => item.id === overTask.id) : column.length - 1;
        arrayMove(column, oldIndex, Math.max(0, newIndex)).forEach((item, index) => updates.push({ id: item.id, status: newStatus, order: (index + 1) * 1000 }));
      } else {
        const oldColumn = tasksFor(task.status).filter((item) => item.id !== task.id);
        const newColumn = tasksFor(newStatus);
        const overIndex = overTask ? newColumn.findIndex((item) => item.id === overTask.id) : -1;
        newColumn.splice(overIndex < 0 ? newColumn.length : overIndex, 0, { ...task, status: newStatus });
        oldColumn.forEach((item, index) => updates.push({ id: item.id, status: task.status, order: (index + 1) * 1000 }));
        newColumn.forEach((item, index) => updates.push({ id: item.id, status: newStatus, order: (index + 1) * 1000 }));
      }
      await reorderTasks(updates);
    } catch (caught) {
      setDragError(caught instanceof Error ? caught.message : "Could not move that task.");
    }
  }

  const canCreateHere = editableSubteams.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {toolbar && <div className="flex flex-wrap items-center gap-1.5">{toolbar}</div>}
        <p className={`${toolbar ? "ml-1" : ""} whitespace-nowrap text-sm text-steel`}>
          {scopedTasks.length} task{scopedTasks.length === 1 ? "" : "s"}
        </p>
        <label className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-steel" />
          <input type="search" className="input input-with-icon py-1.5" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks…" aria-label="Search tasks" />
        </label>
        {canCreateHere && (
          <button onClick={() => setCreating(true)} className="btn-primary ml-auto text-sm">
            + New task
          </button>
        )}
      </div>
      {dragError && <div role="alert" className="mb-3 flex items-start justify-between gap-3 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"><span>{dragError}</span><button type="button" onClick={() => setDragError(null)} className="shrink-0 font-semibold">Dismiss</button></div>}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 pb-4 md:grid-cols-2 xl:flex xl:overflow-x-auto xl:pb-0">
          {TASK_STATUSES.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              tasks={tasksFor(status)}
              allTasks={tasks}
              certifications={certifications}
              users={users}
              onOpenTask={setOpenTask}
              collapsed={collapsedColumns.has(status)}
              onToggleCollapsed={() => setCollapsedColumns((current) => {
                const next = new Set(current);
                if (next.has(status)) next.delete(status); else next.add(status);
                return next;
              })}
              shouldCollapseCard={(task) => cardDefault === "collapsed" && !task.assigneeUids.includes(profile?.uid ?? "")}
              draggable={!search.trim()}
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
