"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { PersonalTimeReport, totalDurationMs } from "@/components/personal-time-report";
import { useAuth } from "@/context/auth-context";
import { useTasks, useUsers, useCertifications, useTimeEntries } from "@/lib/hooks";
import { SUBTEAM_META } from "@/lib/subteam-meta";
import { downloadCsv } from "@/lib/csv";
import { SUBTEAMS, type Subteam, type Task, type TaskStatus, type UserProfile } from "@/types";

interface TaskRecord {
  taskId: string;
  title: string;
  subteam: Subteam;
  status: TaskStatus;
  assignedAt: string | null;
  completedAt: string | null;
}

function buildPerUserRecords(tasks: Task[]): Record<string, TaskRecord[]> {
  const map: Record<string, TaskRecord[]> = {};
  for (const task of tasks) {
    const relevantUids = new Set([...task.assigneeUids, ...task.history.map((event) => event.uid)]);
    for (const uid of relevantUids) {
      const assigned = task.history.find((event) => event.uid === uid && event.type === "assigned");
      const completed = task.history.find((event) => event.uid === uid && event.type === "completed");
      if (!map[uid]) map[uid] = [];
      map[uid].push({
        taskId: task.id,
        title: task.title,
        subteam: task.subteam,
        status: task.status,
        assignedAt: assigned?.at ?? null,
        completedAt: completed?.at ?? null,
      });
    }
  }
  return map;
}

export default function ReportsPage({ embedded = false }: { embedded?: boolean }) {
  const { profile, isCoach } = useAuth();
  const { tasks } = useTasks();
  const { users } = useUsers();
  const { certifications } = useCertifications();
  const { entries: timeEntries } = useTimeEntries(profile ? (isCoach ? null : profile.uid) : undefined);
  const [subteamFilter, setSubteamFilter] = useState<Subteam | "all">("all");
  const [search, setSearch] = useState("");
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const records = useMemo(() => buildPerUserRecords(tasks), [tasks]);
  const certNames = useMemo(() => new Map(certifications.map((certification) => [certification.id, certification.name])), [certifications]);
  const certificationSummary = (ids: string[]) => ids.map((id) => certNames.get(id) ?? "Unknown certification").join(", ") || "None";

  const roster = useMemo(() => users
    .filter((user) => subteamFilter === "all" || user.subteam === subteamFilter)
    .filter((user) => user.displayName.toLowerCase().includes(search.toLowerCase()))
    .map((user) => {
      const taskRecords = records[user.uid] ?? [];
      const userTimeEntries = timeEntries.filter((entry) => entry.uid === user.uid);
      return {
        user,
        completed: taskRecords.filter((record) => record.status === "done").length,
        active: taskRecords.filter((record) => record.status !== "done").length,
        total: taskRecords.length,
        timeMs: totalDurationMs(userTimeEntries, now),
      };
    })
    .sort((a, b) => b.completed - a.completed || a.user.displayName.localeCompare(b.user.displayName)),
  [users, records, timeEntries, now, subteamFilter, search]);

  if (!profile) return null;

  const selectedUser = isCoach
    ? users.find((user) => user.uid === selectedUid) ?? null
    : profile;
  const selectedRecords = selectedUser ? records[selectedUser.uid] ?? [] : [];
  const selectedTimeEntries = selectedUser ? timeEntries.filter((entry) => entry.uid === selectedUser.uid) : [];

  function exportSummaryCsv() {
    const rows: (string | number)[][] = [["Name", "Role", "Subteam", "Certifications", "Completed tasks", "Active tasks", "Total tasks", "Attendance hours"]];
    roster.forEach((item) => rows.push([
      item.user.displayName,
      item.user.role.replace("_", " "),
      item.user.subteam ? SUBTEAM_META[item.user.subteam].label : "-",
      certificationSummary(item.user.certificationIds),
      item.completed,
      item.active,
      item.total,
      hoursDecimal(item.timeMs),
    ]));
    downloadCsv(`team-report-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  function exportTaskCsv() {
    const rows: (string | number)[][] = [["Name", "Task", "Task subteam", "Status", "Assigned", "Completed"]];
    roster.forEach((item) => (records[item.user.uid] ?? []).forEach((record) => rows.push([
      item.user.displayName,
      record.title,
      SUBTEAM_META[record.subteam].label,
      record.status,
      formatDate(record.assignedAt),
      formatDate(record.completedAt),
    ])));
    downloadCsv(`task-detail-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  function exportTimeCsv() {
    const visibleUids = new Set(roster.map((item) => item.user.uid));
    const rows: (string | number)[][] = [["Name", "Activity", "Session", "Clock in", "Clock out", "Hours"]];
    timeEntries.filter((entry) => visibleUids.has(entry.uid)).forEach((entry) => {
      const user = users.find((candidate) => candidate.uid === entry.uid);
      const end = entry.clockOut ? new Date(entry.clockOut) : now;
      rows.push([
        user?.displayName ?? "Former team member",
        entry.activity,
        entry.activityName,
        new Date(entry.clockIn).toLocaleString(),
        entry.clockOut ? new Date(entry.clockOut).toLocaleString() : "Currently signed in",
        hoursDecimal(Math.max(0, end.getTime() - new Date(entry.clockIn).getTime())),
      ]);
    });
    downloadCsv(`attendance-detail-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  }

  const content = (
    <div>
      <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold">Reports</h1>
          <p className="text-sm text-steel">
            {isCoach ? "Task history, certifications, and attendance hours for the whole team." : "Your task history, certifications, and attendance hours."}
          </p>
        </div>
        {isCoach && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={exportSummaryCsv} className="btn-secondary text-xs">Export summary</button>
            <button type="button" onClick={exportTaskCsv} className="btn-secondary text-xs">Export tasks</button>
            <button type="button" onClick={exportTimeCsv} className="btn-secondary text-xs">Export attendance</button>
          </div>
        )}
      </div>

      {isCoach && (
        <>
          <div className="flex flex-wrap gap-1.5 mb-4">
            <FilterChip active={subteamFilter === "all"} onClick={() => setSubteamFilter("all")} label="All subteams" />
            {SUBTEAMS.map((subteam) => (
              <FilterChip key={subteam} active={subteamFilter === subteam} onClick={() => setSubteamFilter(subteam)} label={SUBTEAM_META[subteam].label} />
            ))}
          </div>
          <input className="input mb-4 max-w-xs" placeholder="Search by name…" value={search} onChange={(event) => setSearch(event.target.value)} />
          <div className="bg-paper-raised border border-steel-line rounded overflow-x-auto mb-6">
            <table className="w-full text-sm">
              <thead className="bg-paper border-b border-steel-line">
                <tr className="text-left tracked-label text-[10px] text-steel">
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Subteam</th>
                  <th className="px-3 py-2">Certifications</th>
                  <th className="px-3 py-2">Completed</th>
                  <th className="px-3 py-2">Active</th>
                  <th className="px-3 py-2">Hours</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((item) => (
                  <tr
                    key={item.user.uid}
                    onClick={() => setSelectedUid(item.user.uid)}
                    className={`border-b border-steel-line last:border-0 cursor-pointer hover:bg-paper ${selectedUid === item.user.uid ? "bg-blueprint/10" : ""}`}
                  >
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{item.user.displayName}</td>
                    <td className="px-3 py-2 text-steel whitespace-nowrap">{item.user.subteam ? SUBTEAM_META[item.user.subteam].label : item.user.role === "coach" ? "Coach" : "-"}</td>
                    <td className="px-3 py-2 text-steel max-w-sm">{certificationSummary(item.user.certificationIds)}</td>
                    <td className="px-3 py-2">{item.completed}</td>
                    <td className="px-3 py-2 text-steel">{item.active}</td>
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{hoursDecimal(item.timeMs)}h</td>
                  </tr>
                ))}
                {roster.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-steel">No team members match this filter.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {selectedUser ? (
        <MemberReport
          user={selectedUser}
          taskRecords={selectedRecords}
          timeEntries={selectedTimeEntries}
          now={now}
          certificationSummary={certificationSummary}
        />
      ) : (
        <p className="text-sm text-steel">Select a team member to open their complete report.</p>
      )}
    </div>
  );
  return embedded ? content : <AppShell>{content}</AppShell>;
}

function MemberReport({
  user,
  taskRecords,
  timeEntries,
  now,
  certificationSummary,
}: {
  user: UserProfile;
  taskRecords: TaskRecord[];
  timeEntries: import("@/types").TimeEntry[];
  now: Date;
  certificationSummary: (ids: string[]) => string;
}) {
  return (
    <div className="bg-paper-raised border border-steel-line rounded p-4">
      <h2 className="tracked-label text-xs font-bold">{user.displayName}&apos;s report</h2>
      <p className="text-xs text-steel mt-1 mb-4"><span className="font-semibold text-ink">Certifications:</span> {certificationSummary(user.certificationIds)}</p>
      <h3 className="tracked-label text-[10px] text-steel mb-2">Task history</h3>
      {taskRecords.length === 0 ? (
        <p className="text-sm text-steel">No task history yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left tracked-label text-[10px] text-steel border-b border-steel-line">
                <th className="py-1.5 pr-3">Task</th>
                <th className="py-1.5 pr-3">Subteam</th>
                <th className="py-1.5 pr-3">Status</th>
                <th className="py-1.5 pr-3">Assigned</th>
                <th className="py-1.5 pr-3">Completed</th>
              </tr>
            </thead>
            <tbody>
              {taskRecords.map((record) => (
                <tr key={record.taskId} className="border-b border-steel-line last:border-0">
                  <td className="py-1.5 pr-3">{record.title}</td>
                  <td className="py-1.5 pr-3 text-steel">{SUBTEAM_META[record.subteam].label}</td>
                  <td className="py-1.5 pr-3 text-steel capitalize">{record.status.replace("_", " ")}</td>
                  <td className="py-1.5 pr-3 text-steel">{formatDate(record.assignedAt)}</td>
                  <td className="py-1.5 pr-3 text-steel">{formatDate(record.completedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PersonalTimeReport entries={timeEntries} now={now} />
    </div>
  );
}

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "-";
}

function hoursDecimal(milliseconds: number) {
  return (milliseconds / 3_600_000).toFixed(2);
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className={`tracked-label text-[10px] px-2.5 py-1.5 rounded-sm border ${active ? "bg-blueprint text-white border-blueprint" : "bg-surface text-steel border-steel-line"}`}>
      {label}
    </button>
  );
}
