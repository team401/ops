"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { AppShell } from "@/components/app-shell";
import { CalendarEventDialog } from "@/components/calendar-event-dialog";
import { GanttView } from "@/components/gantt-view";
import { TaskDialog } from "@/components/task-dialog";
import { useAuth } from "@/context/auth-context";
import { CALENDAR_EVENT_META } from "@/lib/calendar-event-meta";
import { useCalendarEvents, useCertifications, useTasks, useUsers } from "@/lib/hooks";
import { SUBTEAM_META } from "@/lib/subteam-meta";
import { SUBTEAMS, type CalendarEvent, type Priority, type Task, type TaskStatus } from "@/types";

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
const PRIORITY_LABEL: Record<Priority, string> = { high: "High", medium: "Medium", low: "Low" };
const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: "Backlog",
  in_progress: "In progress",
  blocked: "Stuck",
  review: "Review",
  done: "Done",
};

export default function CalendarPage() {
  const { profile, isCoach, canManageSubteam } = useAuth();
  const { tasks } = useTasks();
  const { events } = useCalendarEvents();
  const { users } = useUsers();
  const { certifications } = useCertifications();
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [openEvent, setOpenEvent] = useState<CalendarEvent | null>(null);
  const [createEventDate, setCreateEventDate] = useState<string | null>(null);
  const [view, setView] = useState<"calendar" | "gantt">("calendar");

  const dueTasks = useMemo(
    () => tasks
      .filter((task) => task.status !== "done" && task.dueDate)
      .sort((a, b) => {
        const dateDifference = (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
        return dateDifference || PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      }),
    [tasks]
  );

  const tasksByDate = useMemo(() => {
    const grouped = new Map<string, Task[]>();
    for (const task of dueTasks) {
      const key = task.dueDate?.slice(0, 10);
      if (!key) continue;
      grouped.set(key, [...(grouped.get(key) ?? []), task]);
    }
    return grouped;
  }, [dueTasks]);

  const calendarDays = useMemo(() => {
    const first = startOfWeek(startOfMonth(visibleMonth));
    const last = endOfWeek(endOfMonth(visibleMonth));
    return eachDayOfInterval({ start: first, end: last });
  }, [visibleMonth]);

  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, CalendarEvent[]>();
    for (const day of calendarDays) {
      const key = format(day, "yyyy-MM-dd");
      const matching = events.filter((event) => event.startDate <= key && event.endDate >= key);
      if (matching.length > 0) grouped.set(key, matching);
    }
    return grouped;
  }, [calendarDays, events]);

  const monthDateKeys = useMemo(() => {
    const keys: string[] = [];
    for (const day of eachDayOfInterval({ start: startOfMonth(visibleMonth), end: endOfMonth(visibleMonth) })) {
      const key = format(day, "yyyy-MM-dd");
      if ((tasksByDate.get(key)?.length ?? 0) > 0 || (eventsByDate.get(key)?.length ?? 0) > 0) {
        keys.push(key);
      }
    }
    return keys;
  }, [eventsByDate, tasksByDate, visibleMonth]);

  const canManageCalendar = isCoach || profile?.role === "student_leader";
  const editableSubteams = isCoach
    ? SUBTEAMS
    : profile?.role === "student_leader" && profile.subteam
      ? [profile.subteam]
      : [];

  function openToday() {
    setVisibleMonth(startOfMonth(new Date()));
  }

  return (
    <AppShell>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Schedule</h1>
          <p className="text-sm text-steel">
            {view === "calendar"
              ? `${events.length} calendar event${events.length === 1 ? "" : "s"} and ${dueTasks.length} open task${dueTasks.length === 1 ? "" : "s"} with due dates.`
              : "Task timing and prerequisite relationships. Calendar events do not appear in the Gantt view."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded border border-steel-line bg-paper-raised p-0.5" aria-label="Schedule view">
            <button
              type="button"
              onClick={() => setView("calendar")}
              className={`rounded-sm px-3 py-1.5 tracked-label text-[10px] ${view === "calendar" ? "bg-blueprint text-white" : "text-steel hover:text-ink"}`}
            >
              Calendar
            </button>
            <button
              type="button"
              onClick={() => setView("gantt")}
              className={`rounded-sm px-3 py-1.5 tracked-label text-[10px] ${view === "gantt" ? "bg-blueprint text-white" : "text-steel hover:text-ink"}`}
            >
              Gantt
            </button>
          </div>
          {view === "calendar" && (
            <button type="button" onClick={openToday} className="btn-secondary text-xs">Today</button>
          )}
          {view === "calendar" && canManageCalendar && (
            <button
              type="button"
              onClick={() => setCreateEventDate(format(isSameMonth(new Date(), visibleMonth) ? new Date() : visibleMonth, "yyyy-MM-dd"))}
              className="btn-primary text-xs"
            >
              + Add event
            </button>
          )}
        </div>
      </div>

      {view === "calendar" ? (
        <div className="bg-paper-raised border border-steel-line rounded overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-3 py-3 border-b border-steel-line">
          <button
            type="button"
            onClick={() => setVisibleMonth((month) => subMonths(month, 1))}
            className="btn-secondary text-xs px-3"
            aria-label="Previous month"
          >
            ←
          </button>
          <h2 className="font-semibold text-sm sm:text-base">{format(visibleMonth, "MMMM yyyy")}</h2>
          <button
            type="button"
            onClick={() => setVisibleMonth((month) => addMonths(month, 1))}
            className="btn-secondary text-xs px-3"
            aria-label="Next month"
          >
            →
          </button>
        </div>

        <div className="hidden sm:grid grid-cols-7 border-b border-steel-line bg-paper">
          {eachDayOfInterval({ start: startOfWeek(new Date()), end: endOfWeek(new Date()) }).map((day) => (
            <div key={day.getDay()} className="tracked-label text-[10px] text-steel text-center px-2 py-2">
              {format(day, "EEE")}
            </div>
          ))}
        </div>

        <div className="hidden sm:grid grid-cols-7">
          {calendarDays.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayTasks = tasksByDate.get(key) ?? [];
            const dayEvents = eventsByDate.get(key) ?? [];
            const today = isSameDay(day, new Date());
            return (
              <div
                key={key}
                className={`min-h-32 border-r border-b border-steel-line p-1.5 last:border-r-0 ${
                  isSameMonth(day, visibleMonth) ? "bg-paper-raised" : "bg-paper/60"
                }`}
              >
                <div className="mb-1 flex items-center justify-between">
                  <div className={`text-xs w-6 h-6 flex items-center justify-center rounded-full ${
                    today ? "bg-blueprint text-white font-semibold" : isSameMonth(day, visibleMonth) ? "text-ink" : "text-steel/60"
                  }`}>
                    {format(day, "d")}
                  </div>
                  {canManageCalendar && (
                    <button
                      type="button"
                      onClick={() => setCreateEventDate(key)}
                      className="flex h-6 w-6 items-center justify-center rounded text-sm text-steel hover:bg-surface hover:text-blueprint"
                      aria-label={`Add event on ${format(day, "MMMM d, yyyy")}`}
                      title="Add event"
                    >
                      +
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  {dayEvents.map((event) => (
                    <CalendarEventCard key={event.id} event={event} onClick={() => setOpenEvent(event)} compact />
                  ))}
                  {dayTasks.map((task) => (
                    <CalendarTask key={task.id} task={task} onClick={() => setOpenTask(task)} compact />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="sm:hidden p-3 space-y-4">
          {monthDateKeys.length === 0 ? (
            <p className="text-sm text-steel text-center py-8">Nothing is scheduled this month.</p>
          ) : (
            monthDateKeys.map((key) => {
              const day = dateFromKey(key);
              return (
                <section key={key}>
                  <h3 className={`tracked-label text-[10px] mb-1.5 ${isSameDay(day, new Date()) ? "text-blueprint" : "text-steel"}`}>
                    {format(day, "EEEE, MMMM d")}{isSameDay(day, new Date()) ? " · Today" : ""}
                  </h3>
                  <div className="space-y-2">
                    {(eventsByDate.get(key) ?? []).map((event) => (
                      <CalendarEventCard key={event.id} event={event} onClick={() => setOpenEvent(event)} />
                    ))}
                    {(tasksByDate.get(key) ?? []).map((task) => (
                      <CalendarTask key={task.id} task={task} onClick={() => setOpenTask(task)} />
                    ))}
                  </div>
                </section>
              );
            })
          )}
        </div>
        </div>
      ) : (
        <GanttView tasks={tasks} onOpenTask={setOpenTask} />
      )}

      {openTask && (
        <TaskDialog
          mode="edit"
          task={openTask}
          tasks={tasks}
          defaultSubteam={openTask.subteam}
          editableSubteams={canManageSubteam(openTask.subteam) ? editableSubteams : [openTask.subteam]}
          certifications={certifications}
          users={users}
          onClose={() => setOpenTask(null)}
        />
      )}

      {createEventDate && (
        <CalendarEventDialog
          mode="create"
          defaultDate={createEventDate}
          canManage={canManageCalendar}
          onClose={() => setCreateEventDate(null)}
        />
      )}

      {openEvent && (
        <CalendarEventDialog
          mode="edit"
          event={openEvent}
          canManage={canManageCalendar}
          onClose={() => setOpenEvent(null)}
        />
      )}
    </AppShell>
  );
}

function CalendarEventCard({ event, onClick, compact = false }: { event: CalendarEvent; onClick: () => void; compact?: boolean }) {
  const meta = CALENDAR_EVENT_META[event.category];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-sm border border-ink/15 border-l-[3px] bg-surface/90 text-left text-ink hover:bg-surface focus:outline-none focus:ring-2 focus:ring-blueprint ${compact ? "px-1.5 py-1" : "px-3 py-2"}`}
      style={{ borderLeftColor: meta.color }}
      title={`${event.title} · ${meta.label}`}
    >
      <span className={`${compact ? "line-clamp-2 text-[10px]" : "text-sm"} block font-semibold leading-snug`}>{event.title}</span>
      <span className={`${compact ? "mt-0.5 text-[8px]" : "mt-1.5 text-[10px]"} tracked-label block font-bold`} style={{ color: `color-mix(in srgb, ${meta.color} 65%, var(--ink))` }}>
        {meta.label}
      </span>
      {!compact && event.location && <span className="mt-1 block truncate text-xs text-steel">{event.location}</span>}
    </button>
  );
}

function CalendarTask({ task, onClick, compact = false }: { task: Task; onClick: () => void; compact?: boolean }) {
  const meta = SUBTEAM_META[task.subteam];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-sm text-white border border-black/10 hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-blueprint ${compact ? "px-1.5 py-1" : "px-3 py-2"}`}
      style={{ backgroundColor: `color-mix(in srgb, ${meta.color} 86%, var(--paper-raised))` }}
      title={`${task.title} · ${meta.label}`}
    >
      <span className={`${compact ? "text-[10px] line-clamp-2" : "text-sm"} block font-medium leading-snug`}>{task.title}</span>
      <span className={`flex items-center justify-between gap-1 text-white/80 ${compact ? "mt-1 text-[8px]" : "mt-1.5 text-[9px]"}`}>
        <span className="tracked-label truncate">{STATUS_LABEL[task.status]}</span>
        <span className={`tracked-label shrink-0 rounded-sm px-1 py-0.5 ${
          task.priority === "high"
            ? "bg-danger text-white"
            : task.priority === "medium"
              ? "bg-hazard text-[#14181c]"
              : "bg-black/20 text-white"
        }`}>
          {PRIORITY_LABEL[task.priority]}
        </span>
      </span>
      {!compact && <span className="tracked-label text-[9px] text-white/70 mt-1 block">{meta.label}</span>}
    </button>
  );
}

function dateFromKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}
