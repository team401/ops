"use client";

import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { KanbanBoard } from "@/components/kanban-board";
import { useTasks, useUsers, useCertifications } from "@/lib/hooks";
import { SUBTEAM_META } from "@/lib/subteam-meta";
import { SUBTEAMS, type Subteam } from "@/types";
import { Button } from "@team401/web-ui";

export default function BoardPage() {
  const { tasks } = useTasks();
  const { users } = useUsers();
  const { certifications } = useCertifications();
  const [filter, setFilter] = useState<Subteam | "all">("all");

  const editableSubteams = SUBTEAMS;

  return (
    <AppShell lockDesktopViewport>
      <KanbanBoard
        tasks={tasks}
        certifications={certifications}
        users={users}
        subteam={filter === "all" ? undefined : filter}
        createDefaultSubteam={filter === "all" ? editableSubteams[0] ?? "mechanical" : filter}
        editableSubteams={editableSubteams}
        toolbar={(
          <>
            <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label="All subteams" />
            {SUBTEAMS.map((s) => (
              <FilterChip
                key={s}
                active={filter === s}
                onClick={() => setFilter(s)}
                label={SUBTEAM_META[s].label}
                color={SUBTEAM_META[s].color}
              />
            ))}
          </>
        )}
      />
    </AppShell>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  return (
    <Button
      onClick={onClick}
      variant={active ? "primary" : "outline"}
      size="xs"
      className="tracked-label flex items-center gap-1.5 text-[10px]"
    >
      {color && (
        <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
      )}
      {label}
    </Button>
  );
}
