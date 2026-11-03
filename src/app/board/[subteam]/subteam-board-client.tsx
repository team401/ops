"use client";

import { AppShell } from "@/components/app-shell";
import { KanbanBoard } from "@/components/kanban-board";
import { useTasks, useUsers, useCertifications } from "@/lib/hooks";
import { SUBTEAM_META } from "@/lib/subteam-meta";
import { SUBTEAMS, type Subteam } from "@/types";

export function SubteamBoardClient({ subteam }: { subteam: Subteam }) {
  const { tasks } = useTasks();
  const { users } = useUsers();
  const { certifications } = useCertifications();
  const meta = SUBTEAM_META[subteam];

  return (
    <AppShell>
      <div className="mb-5 flex items-center gap-2">
        <span
          className="w-2.5 h-2.5 rounded-full inline-block"
          style={{ background: meta.color }}
        />
        <h1 className="text-lg font-semibold">{meta.label}</h1>
      </div>

      <KanbanBoard
        tasks={tasks}
        certifications={certifications}
        users={users}
        subteam={subteam}
        createDefaultSubteam={subteam}
        editableSubteams={SUBTEAMS}
      />
    </AppShell>
  );
}
