"use client";

import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { DndContext, DragEndEvent, DragOverEvent, DragStartEvent, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { Search } from "lucide-react";
import type { Task, TaskStatus, Subteam, Certification, UserProfile, Priority } from "@/types";
import { TASK_STATUSES } from "@/types";
import { KanbanColumn } from "@/components/kanban-column";
import { TaskDialog } from "@/components/task-dialog";
import { incompletePrerequisites, reorderTasks } from "@/lib/task-actions";
import { taskMatchesSearch } from "@/lib/task-search";
import { getCardDefault, subscribeCardDefault } from "@/lib/card-preferences";
import { useAuth } from "@/context/auth-context";

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

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
  const [dragPreview, setDragPreview] = useState<{ taskId: string; status: TaskStatus; index: number } | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
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
      const priorityDifference = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      const prerequisiteDifference = Number(prerequisiteIds.has(b.id)) - Number(prerequisiteIds.has(a.id));
      return priorityDifference || prerequisiteDifference || a.order - b.order || a.createdAt.localeCompare(b.createdAt);
    });
  }

  function handleDragStart(event: DragStartEvent) {
    const task = scopedTasks.find((candidate) => candidate.id === event.active.id);
    if (!task) return;
    setDragPreview({ taskId: task.id, status: task.status, index: tasksFor(task.status).findIndex((candidate) => candidate.id === task.id) });
  }

  function handleDragOver(event: DragOverEvent) {
    const task = scopedTasks.find((candidate) => candidate.id === event.active.id);
    if (!task || !event.over) return;
    const overTask = scopedTasks.find((candidate) => candidate.id === event.over?.id);
    const status = overTask?.status ?? event.over.data.current?.status ?? event.over.id as TaskStatus;
    if (!TASK_STATUSES.includes(status)) return;

    const destinationTasks = tasksFor(status).filter((candidate) => candidate.id !== task.id);
    if (overTask?.id === task.id) {
      const originalIndex = tasksFor(status).findIndex((candidate) => candidate.id === task.id);
      setDragPreview({ taskId: task.id, status, index: originalIndex < 0 ? destinationTasks.length : Math.min(originalIndex, destinationTasks.length) });
      return;
    }

    if (!overTask || overTask.priority !== task.priority) {
      setDragPreview({ taskId: task.id, status, index: priorityGroupEnd(destinationTasks, task.priority) });
      return;
    }

    const overIndex = destinationTasks.findIndex((candidate) => candidate.id === overTask.id);
    const translatedRect = event.active.rect.current.translated;
    const belowOverTask = translatedRect ? translatedRect.top + translatedRect.height / 2 > event.over.rect.top + event.over.rect.height / 2 : false;
    setDragPreview({ taskId: task.id, status, index: Math.max(0, overIndex + (belowOverTask ? 1 : 0)) });
  }

  function handleDragCancel() {
    setDragPreview(null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const preview = dragPreview;
    setDragPreview(null);
    if (!over || !preview) return;
    const task = scopedTasks.find((t) => t.id === active.id);
    if (!task) return;
    const newStatus = preview.status;
    if (!TASK_STATUSES.includes(newStatus)) return;
    try {
      if (["in_progress", "review", "done"].includes(newStatus)) {
        const incomplete = incompletePrerequisites(task, tasks);
        if (incomplete.length > 0) throw new Error(`Complete prerequisite${incomplete.length === 1 ? "" : "s"} first: ${incomplete.map((item) => item.title).join(", ")}`);
      }
      const updates: Array<{ id: string; status: TaskStatus; order: number }> = [];
      if (task.status === newStatus) {
        const column = tasksFor(newStatus).filter((item) => item.id !== task.id);
        column.splice(Math.min(preview.index, column.length), 0, task);
        column.forEach((item, index) => updates.push({ id: item.id, status: newStatus, order: (index + 1) * 1000 }));
      } else {
        const oldColumn = tasksFor(task.status).filter((item) => item.id !== task.id);
        const newColumn = tasksFor(newStatus);
        newColumn.splice(Math.min(preview.index, newColumn.length), 0, { ...task, status: newStatus });
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

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragCancel={handleDragCancel} onDragEnd={handleDragEnd}>
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
              activeTaskId={activeTaskId}
              onActivateTask={setActiveTaskId}
              onDeactivateTask={() => setActiveTaskId(null)}
              draggable={!search.trim()}
              dropPreview={dragPreview?.status === status ? { task: scopedTasks.find((task) => task.id === dragPreview.taskId) ?? null, index: dragPreview.index } : null}
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

function priorityGroupEnd(tasks: Task[], priority: Priority) {
  const lastMatchingIndex = tasks.findLastIndex((task) => task.priority === priority);
  if (lastMatchingIndex >= 0) return lastMatchingIndex + 1;
  const firstLowerPriority = tasks.findIndex((task) => PRIORITY_ORDER[task.priority] > PRIORITY_ORDER[priority]);
  return firstLowerPriority < 0 ? tasks.length : firstLowerPriority;
}
