"use client";

import { useState, FormEvent } from "react";
import { requestPasswordReset } from "@/lib/auth-api";
import { AppShell } from "@/components/app-shell";
import { SimulationDialog } from "@/components/simulation-dialog";
import { ModalBackdrop } from "@/components/modal-backdrop";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useAuth } from "@/context/auth-context";
import { useUsers, useCertifications, useTimeclockPins } from "@/lib/hooks";
import { removeTimeclockPin, setTimeclockPin } from "@/lib/timeclock-actions";
import {
  updateUserRoleAndSubteam,
  deleteUserProfile,
  createCertification,
  updateCertification,
  deleteCertification,
} from "@/lib/admin-actions";
import { SUBTEAM_META } from "@/lib/subteam-meta";
import { Eye } from "lucide-react";
import { SUBTEAMS, type Role, type Subteam } from "@/types";
import ReportsPage from "@/app/reports/reports-page";


export default function AdminPage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<"roster" | "certifications" | "reports">("roster");
  const [simulationOpen, setSimulationOpen] = useState(false);

  if (profile?.role !== "coach") {
    return (
      <AppShell>
        <p className="text-sm text-steel">Only coaches can access admin settings.</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-lg font-semibold">Admin</h1><p className="text-sm text-steel">Manage accounts, certifications, and team reports.</p></div>
        <button type="button" onClick={() => setSimulationOpen(true)} className="btn-secondary inline-flex items-center gap-2 text-sm"><Eye size={15} />Simulate user</button>
      </div>

      <div className="flex gap-1.5 mb-5">
        <TabButton active={tab === "roster"} onClick={() => setTab("roster")} label="Roster" />
        <TabButton
          active={tab === "certifications"}
          onClick={() => setTab("certifications")}
          label="Certifications"
        />
        <TabButton active={tab === "reports"} onClick={() => setTab("reports")} label="Reports" />
      </div>

      {tab === "roster" ? <RosterTab /> : tab === "certifications" ? <CertificationsTab /> : <ReportsPage embedded />}
      {simulationOpen && <SimulationDialog onClose={() => setSimulationOpen(false)} />}
    </AppShell>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`tracked-label text-xs px-3 py-1.5 rounded-sm border ${active ? "bg-blueprint text-white border-blueprint" : "bg-surface text-steel border-steel-line"
        }`}
    >
      {label}
    </button>
  );
}

function RosterTab() {
  const { users } = useUsers();
  const { pins } = useTimeclockPins(true);
  const [query, setQuery] = useState("");

  const filteredUsers = users.filter(
    (u) =>
      u.displayName.toLowerCase().includes(query.toLowerCase()) ||
      u.email.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-steel">
          {query ? `${filteredUsers.length} of ${users.length}` : users.length} accounts
        </p>
        <p className="text-sm text-steel">Create member accounts in Team 401 Auth.</p>
      </div>

      <input
        className="input max-w-xs"
        placeholder="Search by name or email…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="bg-paper-raised border border-steel-line rounded overflow-auto max-h-[70vh]">
        <table className="w-full text-sm">
          <thead className="bg-paper border-b border-steel-line sticky top-0 z-10">
            <tr className="text-left tracked-label text-[10px] text-steel">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Subteam</th>
              <th className="px-3 py-2">Certs</th>
              <th className="px-3 py-2">Timeclock PIN</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((u) => (
              <RosterRow
                key={`${u.uid}-${pins.find((pin) => pin.uid === u.uid)?.pin ?? ""}`}
                user={u}
                certCount={u.certificationIds.length}
                savedPin={pins.find((pin) => pin.uid === u.uid)?.pin ?? ""}
              />
            ))}
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-steel text-sm">
                  No accounts match &quot;{query}&quot;.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}

function RosterRow({
  user,
  certCount,
  savedPin,
}: {
  user: import("@/types").UserProfile;
  certCount: number;
  savedPin: string;
}) {
  const [editing, setEditing] = useState(false);
  const [role, setRole] = useState<Role>(user.role);
  const [subteam, setSubteam] = useState<Subteam | "">(user.subteam ?? "");
  const [pin, setPin] = useState(savedPin);
  const [resetSent, setResetSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<"remove" | "reset" | null>(null);

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await updateUserRoleAndSubteam(user.uid, {
        role,
        subteam: role === "coach" ? null : (subteam as Subteam) || null,
      });
      if (pin) await setTimeclockPin(user.uid, pin);
      else if (savedPin) await removeTimeclockPin(user.uid);
      setEditing(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save this account.");
    } finally {
      setSaving(false);
    }
  }

  function cancelEditing() {
    setRole(user.role);
    setSubteam(user.subteam ?? "");
    setPin(savedPin);
    setSaveError(null);
    setEditing(false);
  }

  async function remove() {
    await removeTimeclockPin(user.uid);
    await deleteUserProfile(user.uid);
  }

  async function resetPassword() {
    await requestPasswordReset(user.email);
    setResetSent(true);
    setTimeout(() => setResetSent(false), 4000);
  }

  const actionButton = "text-xs tracked-label border rounded-sm px-2 py-1 transition-colors";

  return <>
    <tr className="border-b border-steel-line last:border-0">
      <td className="px-3 py-2">{user.displayName}</td>
      <td className="px-3 py-2 text-steel">{user.email}</td>
      <td className="px-3 py-2">
        {editing ? (
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="input py-1">
            <option value="student">Student</option>
            <option value="student_leader">Student leader</option>
            <option value="coach">Coach</option>
          </select>
        ) : (
          <span className="tracked-label text-[10px]">{user.role.replace("_", " ")}</span>
        )}
      </td>
      <td className="px-3 py-2">
        {editing && role !== "coach" ? (
          <select
            value={subteam}
            onChange={(e) => setSubteam(e.target.value as Subteam)}
            className="input py-1"
          >
            <option value="">—</option>
            {SUBTEAMS.map((s) => (
              <option key={s} value={s}>
                {SUBTEAM_META[s].label}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-steel">{user.subteam ? SUBTEAM_META[user.subteam].label : "—"}</span>
        )}
      </td>
      <td className="px-3 py-2 text-steel">{certCount}</td>
      <td className="px-3 py-2">
        {editing ? (
          <div>
            <input
              className="input w-20 py-1 text-center font-mono"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 3))}
              inputMode="numeric"
              placeholder="None"
              aria-label={`Timeclock PIN for ${user.displayName}`}
            />
            {saveError && <p className="text-[10px] text-danger mt-1 max-w-40">{saveError}</p>}
          </div>
        ) : (
          <span className={savedPin ? "font-mono" : "text-steel"}>{savedPin || "Not set"}</span>
        )}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <div className="inline-flex gap-1.5">
          {editing ? (
            <>
              <button
                onClick={save}
                disabled={saving}
                className={`${actionButton} text-blueprint border-blueprint/40 hover:bg-blueprint/10`}
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={cancelEditing}
                className={`${actionButton} text-steel border-steel-line hover:bg-paper`}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                className={`${actionButton} text-blueprint border-blueprint/40 hover:bg-blueprint/10`}
              >
                Edit
              </button>
              <button
                onClick={() => setConfirmAction("reset")}
                className={`${actionButton} text-hazard border-hazard/50 hover:bg-hazard/10`}
              >
                {resetSent ? "Sent" : "Reset pwd"}
              </button>
              <button
                onClick={() => setConfirmAction("remove")}
                className={`${actionButton} text-danger border-danger/50 hover:bg-danger/10`}
              >
                Remove
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
    {confirmAction === "remove" && <ConfirmDialog title="Remove account access?" description={`Remove ${user.displayName}'s Ops profile and timeclock PIN? This cannot be undone here.`} confirmLabel="Remove access" destructive onConfirm={remove} onClose={() => setConfirmAction(null)} />}
    {confirmAction === "reset" && <ConfirmDialog title="Send password reset?" description={`Send a password reset email to ${user.email}?`} confirmLabel="Send reset email" onConfirm={resetPassword} onClose={() => setConfirmAction(null)} />}
  </>;
}

function CertificationsTab() {
  const { certifications } = useCertifications();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<import("@/types").Certification | null>(null);
  const [pendingDelete, setPendingDelete] = useState<import("@/types").Certification | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-steel">{certifications.length} certifications</p>
        <button onClick={() => setShowForm(true)} className="btn-primary text-sm">
          + New certification
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {certifications.map((c) => (
          <div key={c.id} className="bg-paper-raised border border-steel-line rounded p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-sm">{c.name}</p>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setEditing(c)} className="text-blueprint text-xs tracked-label">
                  Edit
                </button>
                <button
                  onClick={() => setPendingDelete(c)}
                  className="text-danger text-xs tracked-label"
                >
                  Delete
                </button>
              </div>
            </div>
            <p className="text-xs text-steel mt-1">{c.description || "No description"}</p>
            <p className="tracked-label text-[10px] text-blueprint mt-2">
              {c.subteam ? SUBTEAM_META[c.subteam].label : "All subteams"}
            </p>
          </div>
        ))}
        {certifications.length === 0 && (
          <p className="text-sm text-steel">No certifications yet — add your first one.</p>
        )}
      </div>

      {showForm && <CertDialog mode="create" onClose={() => setShowForm(false)} />}
      {editing && (
        <CertDialog mode="edit" certification={editing} onClose={() => setEditing(null)} />
      )}
      {pendingDelete && <ConfirmDialog title="Delete certification?" description={`Delete “${pendingDelete.name}”? Tasks requiring it will no longer be gated.`} confirmLabel="Delete certification" destructive onConfirm={() => deleteCertification(pendingDelete.id)} onClose={() => setPendingDelete(null)} />}
    </div>
  );
}

function CertDialog({
  mode,
  certification,
  onClose,
}: {
  mode: "create" | "edit";
  certification?: import("@/types").Certification;
  onClose: () => void;
}) {
  const [name, setName] = useState(certification?.name ?? "");
  const [description, setDescription] = useState(certification?.description ?? "");
  const [subteam, setSubteam] = useState<Subteam | "">(certification?.subteam ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "create") {
        await createCertification({ name, description, subteam: subteam || null });
      } else if (certification) {
        await updateCertification(certification.id, {
          name,
          description,
          subteam: subteam || null,
        });
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <form
        onSubmit={handleSubmit}
        className="bg-paper-raised border border-steel-line rounded w-full max-w-sm p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="tracked-label text-xs text-blueprint font-bold">
            {mode === "create" ? "New certification" : "Edit certification"}
          </h2>
          <button type="button" onClick={onClose} className="text-steel text-sm">
            Close
          </button>
        </div>
        <label className="block">
          <span className="tracked-label text-xs text-steel">Name</span>
          <input className="input mt-1" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. CNC Mill" />
        </label>
        <label className="block">
          <span className="tracked-label text-xs text-steel">Description</span>
          <textarea className="input mt-1" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="block">
          <span className="tracked-label text-xs text-steel">Subteam scope</span>
          <select className="input mt-1" value={subteam} onChange={(e) => setSubteam(e.target.value as Subteam)}>
            <option value="">All subteams</option>
            {SUBTEAMS.map((s) => (
              <option key={s} value={s}>
                {SUBTEAM_META[s].label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? "Saving…" : mode === "create" ? "Create certification" : "Save changes"}
        </button>
      </form>
    </ModalBackdrop>
  );
}
