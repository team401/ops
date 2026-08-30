"use client";

import { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  Cell,
} from "recharts";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/context/auth-context";
import { useTasks, useUsers, useCertifications } from "@/lib/hooks";
import { SUBTEAM_META } from "@/lib/subteam-meta";
import { SUBTEAMS, TASK_STATUSES, type TaskStatus } from "@/types";

const STATUS_COLOR: Record<TaskStatus, string> = {
  backlog: "var(--steel)",
  in_progress: "var(--blueprint)",
  blocked: "var(--danger)",
  review: "var(--hazard)",
  done: "var(--success)",
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: "Backlog",
  in_progress: "In progress",
  blocked: "Stuck",
  review: "Review",
  done: "Done",
};

const WORKLOAD_DEFAULT_LIMIT = 15;

const TOOLTIP_PROPS = {
  contentStyle: {
    backgroundColor: "var(--paper-raised)",
    border: "1px solid var(--steel-line)",
    borderRadius: 4,
    color: "var(--ink)",
  },
  labelStyle: { color: "var(--ink)", fontWeight: 600 },
  itemStyle: { color: "var(--ink)" },
};

export default function MetricsPage() {
  const { profile } = useAuth();
  const { tasks } = useTasks();
  const { users } = useUsers();
  const { certifications } = useCertifications();
  const [showAllWorkload, setShowAllWorkload] = useState(false);

  const students = useMemo(() => users.filter((u) => u.role !== "coach"), [users]);

  const kpis = useMemo(() => {
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "done").length;
    const unclaimed = tasks.filter((t) => t.assigneeUids.length === 0).length;
    const uncertified = students.filter((s) => s.certificationIds.length === 0).length;
    return { total, done, unclaimed, uncertified };
  }, [tasks, students]);

  const bySubteam = useMemo(
    () =>
      SUBTEAMS.map((s) => {
        const row: Record<string, number | string> = { subteam: SUBTEAM_META[s].label };
        for (const status of TASK_STATUSES) {
          row[status] = tasks.filter((t) => t.subteam === s && t.status === status).length;
        }
        return row;
      }),
    [tasks]
  );

  const fullWorkload = useMemo(() => {
    return students
      .map((u) => ({
        name: u.displayName,
        active: tasks.filter((t) => t.assigneeUids.includes(u.uid) && t.status !== "done").length,
      }))
      .sort((a, b) => b.active - a.active);
  }, [students, tasks]);

  const workload = showAllWorkload ? fullWorkload : fullWorkload.slice(0, WORKLOAD_DEFAULT_LIMIT);

  const certCoverage = useMemo(
    () =>
      certifications.map((c) => ({
        name: c.name,
        count: students.filter((s) => s.certificationIds.includes(c.id)).length,
      })),
    [certifications, students]
  );

  const avgCycleDays = useMemo(() => {
    const done = tasks.filter((t) => t.status === "done");
    if (done.length === 0) return null;
    const totalDays = done.reduce((sum, t) => {
      const created = new Date(t.createdAt).getTime();
      const updated = new Date(t.updatedAt).getTime();
      return sum + (updated - created) / (1000 * 60 * 60 * 24);
    }, 0);
    return (totalDays / done.length).toFixed(1);
  }, [tasks]);

  if (profile && profile.role !== "coach") {
    return (
      <AppShell>
        <p className="text-sm text-steel">Only coaches can access metrics.</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-5">
        <h1 className="text-lg font-semibold">Metrics</h1>
        <p className="text-sm text-steel">How the build season is actually going.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <Kpi label="Total tasks" value={kpis.total} />
        <Kpi label="Completed" value={`${kpis.done} / ${kpis.total}`} />
        <Kpi label="Unclaimed" value={kpis.unclaimed} accent="var(--hazard)" />
        <Kpi label="Avg. cycle time" value={avgCycleDays ? `${avgCycleDays}d` : "—"} />
      </div>

      <ChartCard title="Task distribution by subteam and status">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={bySubteam}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--steel-line)" />
            <XAxis dataKey="subteam" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip {...TOOLTIP_PROPS} />
            <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => STATUS_LABEL[v as TaskStatus]} />
            {TASK_STATUSES.map((s) => (
              <Bar key={s} dataKey={s} stackId="a" fill={STATUS_COLOR[s]} name={s} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Active workload per student">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-steel">
            Tasks currently claimed and not yet done — helps spot who&apos;s overloaded or idle.
          </p>
          {fullWorkload.length > WORKLOAD_DEFAULT_LIMIT && (
            <button
              onClick={() => setShowAllWorkload((v) => !v)}
              className="tracked-label text-[10px] text-blueprint shrink-0 ml-3"
            >
              {showAllWorkload ? "Show top 15" : `Show all ${fullWorkload.length}`}
            </button>
          )}
        </div>
        <ResponsiveContainer width="100%" height={Math.max(200, workload.length * 24)}>
          <BarChart data={workload} layout="vertical" margin={{ left: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--steel-line)" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
            <Tooltip {...TOOLTIP_PROPS} />
            <Bar dataKey="active" fill="var(--blueprint)" radius={[0, 3, 3, 0]} />
          </BarChart>
        </ResponsiveContainer>
        {workload.length === 0 && <p className="text-sm text-steel">No students yet.</p>}
      </ChartCard>

      <ChartCard title="Certification coverage">
        <p className="text-xs text-steel mb-2">
          Students certified per process — a short bar is a bottleneck risk.
        </p>
        {certCoverage.length === 0 ? (
          <p className="text-sm text-steel">No certifications defined yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(160, certCoverage.length * 32)}>
            <BarChart data={certCoverage} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--steel-line)" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
              <Tooltip {...TOOLTIP_PROPS} />
              <Bar dataKey="count" radius={[0, 3, 3, 0]}>
                {certCoverage.map((c, i) => (
                  <Cell key={i} fill={c.count <= 1 ? "var(--danger)" : "var(--success)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </AppShell>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="bg-paper-raised border border-steel-line rounded p-3">
      <p className="tracked-label text-[10px] text-steel">{label}</p>
      <p className="text-2xl font-semibold mt-1" style={accent ? { color: accent } : undefined}>
        {value}
      </p>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-paper-raised border border-steel-line rounded p-4 mb-6">
      <h2 className="tracked-label text-xs font-bold mb-3">{title}</h2>
      {children}
    </div>
  );
}
