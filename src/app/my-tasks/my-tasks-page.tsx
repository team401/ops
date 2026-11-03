"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/context/auth-context";
import { useTasks, useUsers, useCertifications } from "@/lib/hooks";
import { TaskCard } from "@/components/task-card";
import { TaskDialog } from "@/components/task-dialog";
import type { Task } from "@/types";
import { Search } from "lucide-react";
import { taskMatchesSearch } from "@/lib/task-search";

const STATUS_LABEL: Record<string, string> = {
  backlog: "Backlog",
  in_progress: "In progress",
  blocked: "Stuck",
  review: "Review",
  done: "Done",
};

export default function MyTasksPage() {
  const { profile, canManageSubteam } = useAuth();
  const { tasks } = useTasks();
  const { users } = useUsers();
  const { certifications } = useCertifications();
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [search, setSearch] = useState("");

  const myTasks = useMemo(
    () => tasks.filter((task) => profile && task.assigneeUids.includes(profile.uid) && (!task.archived || Boolean(search.trim())) && taskMatchesSearch(task, users, search)),
    [tasks, profile, users, search]
  );

  if (!profile) return null;

  return (
    <AppShell>
      <div className="mb-5">
        <h1 className="text-lg font-semibold">My tasks</h1>
        <p className="text-sm text-steel">What you&apos;re working on, and what&apos;s ready for you to pick up.</p>
      </div>
      <label className="relative mb-4 block max-w-sm">
        <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-steel" />
        <input type="search" className="input input-with-icon" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search my tasks…" aria-label="Search my tasks" />
      </label>

      <section className="mb-8">
        <h2 className="tracked-label text-xs text-steel mb-2">
          Claimed by me ({myTasks.length})
        </h2>
        {myTasks.length === 0 ? (
          <p className="text-sm text-steel">
            {search ? "No assigned tasks match your search." : "Nothing claimed yet."}
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {myTasks.map((t) => (
              <div key={t.id}>
                <TaskCard
                  task={t}
                  tasks={tasks}
                  certifications={certifications}
                  users={users}
                  draggable={false}
                  onOpen={() => setOpenTask(t)}
                />
                <p className="tracked-label text-[10px] text-steel mt-1 pl-1">
                  {STATUS_LABEL[t.status]}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {openTask && (
        <TaskDialog
          mode="edit"
          task={openTask}
          defaultSubteam={openTask.subteam}
          editableSubteams={canManageSubteam(openTask.subteam) ? [openTask.subteam] : [openTask.subteam]}
          certifications={certifications}
          users={users}
          tasks={tasks}
          onClose={() => setOpenTask(null)}
        />
      )}
    </AppShell>
  );
}
