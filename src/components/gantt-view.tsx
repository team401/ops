"use client";

import { useMemo } from "react";
import {
  addDays,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameDay,
  startOfWeek,
} from "date-fns";
import { AlertTriangle, ArrowRight, Link2 } from "lucide-react";
import { SUBTEAM_META } from "@/lib/subteam-meta";
import { type Priority, type Task, type TaskStatus } from "@/types";

const DAY_WIDTH = 32;
const TASK_COLUMN_WIDTH = 280;

const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: "Backlog",
  in_progress: "In progress",
  blocked: "Stuck",
  review: "Review",
  done: "Done",
};

const STATUS_STYLE: Record<TaskStatus, string> = {
  backlog: "bg-steel text-white",
  in_progress: "bg-blueprint text-white",
  blocked: "bg-danger text-white",
  review: "bg-hazard text-[#14181c]",
  done: "bg-success text-white",
};

const PRIORITY_LABEL: Record<Priority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

interface ScheduledTask {
  task: Task;
  start: Date;
  due: Date;
  prerequisites: Task[];
  scheduleConflict: boolean;
}

export function GanttView({ tasks, onOpenTask }: { tasks: Task[]; onOpenTask: (task: Task) => void }) {
  const scheduledTasks = useMemo(() => buildSchedule(tasks), [tasks]);
  const unscheduledCount = tasks.length - scheduledTasks.length;
  const scheduleConflicts = scheduledTasks.filter((item) => item.scheduleConflict).length;

  const timeline = useMemo(() => {
    if (scheduledTasks.length === 0) return null;

    const starts = scheduledTasks.map((item) => item.start.getTime());
    const ends = scheduledTasks.map((item) => item.due.getTime());
    const start = startOfWeek(new Date(Math.min(...starts)));
    const end = endOfWeek(new Date(Math.max(...ends)));
    const days = eachDayOfInterval({ start, end });

    return { start, days, width: days.length * DAY_WIDTH };
  }, [scheduledTasks]);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-steel">
          {scheduledTasks.length} task{scheduledTasks.length === 1 ? "" : "s"} with due dates
          {unscheduledCount > 0 ? ` · ${unscheduledCount} without due dates` : ""}
        </p>
        {scheduleConflicts > 0 && (
          <div className="flex items-center gap-1.5 rounded border border-danger/35 bg-danger/10 px-3 py-2 text-xs text-danger">
            <AlertTriangle size={14} />
            {scheduleConflicts} dependency conflict{scheduleConflicts === 1 ? "" : "s"}
          </div>
        )}
      </div>

      <div className="mb-4 rounded border border-steel-line bg-paper-raised px-3 py-2 text-xs text-steel">
        Bars begin when a task was created, or the day after its latest scheduled prerequisite is due, and end on its due date.
        Prerequisites are placed before the tasks that depend on them.
      </div>

      {timeline ? (
        <>
          <div className="hidden max-h-[calc(100dvh-12rem)] overflow-auto rounded border border-steel-line bg-paper-raised lg:block">
            <div style={{ width: TASK_COLUMN_WIDTH + timeline.width }}>
              <div className="sticky top-0 z-30 flex h-14 border-b border-steel-line bg-paper-raised">
                <div
                  className="sticky left-0 z-40 flex shrink-0 items-center border-r border-steel-line bg-paper-raised px-3 tracked-label text-[10px] text-steel"
                  style={{ width: TASK_COLUMN_WIDTH }}
                >
                  Task and dependencies
                </div>
                <div className="flex" style={{ width: timeline.width }}>
                  {timeline.days.map((day) => {
                    const weekend = day.getDay() === 0 || day.getDay() === 6;
                    const today = isSameDay(day, new Date());
                    return (
                      <div
                        key={format(day, "yyyy-MM-dd")}
                        className={`flex shrink-0 flex-col items-center justify-center border-r border-steel-line text-[9px] ${
                          today ? "bg-blueprint/10 text-blueprint font-semibold" : weekend ? "bg-paper text-steel" : "text-steel"
                        }`}
                        style={{ width: DAY_WIDTH }}
                        title={format(day, "EEEE, MMMM d, yyyy")}
                      >
                        {(day.getDate() === 1 || day === timeline.days[0]) && (
                          <span className="text-[8px] uppercase">{format(day, "MMM")}</span>
                        )}
                        <span>{format(day, "d")}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {scheduledTasks.map((item) => (
                <GanttRow
                  key={item.task.id}
                  item={item}
                  timelineStart={timeline.start}
                  timelineWidth={timeline.width}
                  onOpen={() => onOpenTask(item.task)}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2 lg:hidden">
            {scheduledTasks.map((item) => (
              <MobileTask key={item.task.id} item={item} onOpen={() => onOpenTask(item.task)} />
            ))}
          </div>
        </>
      ) : (
        <div className="rounded border border-steel-line bg-paper-raised py-16 text-center">
          <p className="text-sm font-medium">No tasks have due dates yet.</p>
          <p className="mt-1 text-xs text-steel">Add a due date to a task to place it on the Gantt chart.</p>
        </div>
      )}

    </>
  );
}

function GanttRow({
  item,
  timelineStart,
  timelineWidth,
  onOpen,
}: {
  item: ScheduledTask;
  timelineStart: Date;
  timelineWidth: number;
  onOpen: () => void;
}) {
  const { task, start, due, prerequisites, scheduleConflict } = item;
  const left = differenceInCalendarDays(start, timelineStart) * DAY_WIDTH;
  const duration = Math.max(1, differenceInCalendarDays(due, start) + 1);

  return (
    <div className="flex min-h-20 border-b border-steel-line last:border-b-0">
      <button
        type="button"
        onClick={onOpen}
        className="sticky left-0 z-20 shrink-0 border-r border-steel-line bg-paper-raised px-3 py-2 text-left hover:bg-paper focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blueprint"
        style={{ width: TASK_COLUMN_WIDTH }}
      >
        <span className="block truncate text-sm font-medium text-ink">{task.title}</span>
        <span className="mt-1 flex items-center gap-2 text-[10px] text-steel">
          <span>{SUBTEAM_META[task.subteam].label}</span>
          <span>·</span>
          <span>{PRIORITY_LABEL[task.priority]}</span>
        </span>
        {prerequisites.length > 0 && (
          <span className={`mt-1 flex items-center gap-1 truncate text-[10px] ${scheduleConflict ? "text-danger" : "text-steel"}`}>
            <Link2 size={10} className="shrink-0" />
            After {prerequisites.map((dependency) => dependency.title).join(", ")}
          </span>
        )}
      </button>

      <div
        className="relative shrink-0 bg-[repeating-linear-gradient(to_right,transparent_0,transparent_31px,var(--steel-line)_31px,var(--steel-line)_32px)]"
        style={{ width: timelineWidth }}
      >
        <button
          type="button"
          onClick={onOpen}
          className={`absolute top-5 flex h-10 items-center rounded-sm px-2 text-left text-[10px] font-semibold shadow-sm hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-blueprint ${STATUS_STYLE[task.status]} ${
            scheduleConflict ? "ring-2 ring-danger ring-offset-1 ring-offset-paper-raised" : ""
          }`}
          style={{ left, width: Math.max(DAY_WIDTH, duration * DAY_WIDTH) }}
          title={`${task.title} · ${STATUS_LABEL[task.status]} · Due ${format(due, "MMM d, yyyy")}`}
        >
          <span className="truncate">{task.title}</span>
          {scheduleConflict && <AlertTriangle size={12} className="ml-auto shrink-0" />}
        </button>
      </div>
    </div>
  );
}

function MobileTask({ item, onOpen }: { item: ScheduledTask; onOpen: () => void }) {
  const { task, start, due, prerequisites, scheduleConflict } = item;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded border border-steel-line bg-paper-raised p-3 text-left hover:border-blueprint focus:outline-none focus:ring-2 focus:ring-blueprint"
    >
      <span className="flex items-start justify-between gap-2">
        <span>
          <span className="block text-sm font-medium text-ink">{task.title}</span>
          <span className="mt-0.5 block text-[10px] text-steel">{SUBTEAM_META[task.subteam].label} · {PRIORITY_LABEL[task.priority]}</span>
        </span>
        <span className={`shrink-0 rounded-sm px-2 py-1 tracked-label text-[9px] ${STATUS_STYLE[task.status]}`}>
          {STATUS_LABEL[task.status]}
        </span>
      </span>

      <span className="mt-3 flex items-center gap-2 text-xs text-steel">
        <span>{format(start, "MMM d")}</span>
        <ArrowRight size={13} />
        <span className="font-medium text-ink">Due {format(due, "MMM d, yyyy")}</span>
      </span>

      {prerequisites.length > 0 && (
        <span className={`mt-2 flex items-start gap-1.5 text-[11px] ${scheduleConflict ? "text-danger" : "text-steel"}`}>
          {scheduleConflict ? <AlertTriangle size={13} className="mt-0.5 shrink-0" /> : <Link2 size={13} className="mt-0.5 shrink-0" />}
          <span>
            After {prerequisites.map((dependency) => dependency.title).join(", ")}
            {scheduleConflict ? " · Due before prerequisite is complete" : ""}
          </span>
        </span>
      )}
    </button>
  );
}

function buildSchedule(tasks: Task[]): ScheduledTask[] {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const scheduledById = new Map<string, ScheduledTask>();

  for (const task of tasks) {
    if (!task.dueDate) continue;

    const due = dateFromIso(task.dueDate);
    const prerequisites = task.prerequisiteTaskIds
      .map((id) => taskById.get(id))
      .filter((dependency): dependency is Task => Boolean(dependency));
    const prerequisiteDueDates = prerequisites
      .filter((dependency) => dependency.dueDate)
      .map((dependency) => dateFromIso(dependency.dueDate as string));
    const created = task.createdAt ? dateFromIso(task.createdAt) : due;
    const dependencyStart = prerequisiteDueDates.length > 0
      ? addDays(new Date(Math.max(...prerequisiteDueDates.map((date) => date.getTime()))), 1)
      : created;
    const scheduleConflict = prerequisiteDueDates.length > 0 && differenceInCalendarDays(dependencyStart, due) > 0;
    const start = differenceInCalendarDays(dependencyStart, due) > 0 ? due : dependencyStart;

    scheduledById.set(task.id, {
      task,
      start,
      due,
      prerequisites,
      scheduleConflict,
    });
  }

  const baseOrder = [...scheduledById.values()].sort((a, b) => {
    const dueDifference = a.due.getTime() - b.due.getTime();
    return dueDifference || a.task.title.localeCompare(b.task.title);
  });
  const ordered: ScheduledTask[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(item: ScheduledTask) {
    if (visited.has(item.task.id)) return;
    if (visiting.has(item.task.id)) return;
    visiting.add(item.task.id);

    for (const prerequisiteId of item.task.prerequisiteTaskIds) {
      const prerequisite = scheduledById.get(prerequisiteId);
      if (prerequisite) visit(prerequisite);
    }

    visiting.delete(item.task.id);
    visited.add(item.task.id);
    ordered.push(item);
  }

  for (const item of baseOrder) visit(item);
  return ordered;
}

function dateFromIso(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}
