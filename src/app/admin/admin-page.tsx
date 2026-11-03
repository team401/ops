"use client";

import { useState, FormEvent, useRef } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { AppShell } from "@/components/app-shell";
import { ModalBackdrop } from "@/components/modal-backdrop";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useAuth } from "@/context/auth-context";
import { useUsers, useCertifications, useTimeclockPins } from "@/lib/hooks";
import { removeTimeclockPin, setTimeclockPin } from "@/lib/timeclock-actions";
import {
  createAccount,
  updateUserRoleAndSubteam,
  deleteUserProfile,
  createCertification,
  updateCertification,
  deleteCertification,
} from "@/lib/admin-actions";
import { SUBTEAM_META } from "@/lib/subteam-meta";
import { parseCsv, downloadCsv } from "@/lib/csv";
import { inspectLegacyAttachments, migrateLegacyAttachment, type LegacyAttachmentCandidate } from "@/lib/attachment-migration";
import { migrateCertificationsToD1 } from "@/lib/certification-api";
import { migrateOperationsToD1 } from "@/lib/operations-api";
import { migrateCoreToD1 } from "@/lib/core-api";
import { SUBTEAMS, type Role, type Subteam } from "@/types";

interface AccountCredentials {
  name: string;
  email: string;
  tempPassword: string;
  timeclockPin: string;
  error?: string;
}

export default function AdminPage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<"roster" | "certifications" | "storage">("roster");

  if (profile?.role !== "coach") {
    return (
      <AppShell>
        <p className="text-sm text-steel">Only coaches can access admin settings.</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mb-5">
        <h1 className="text-lg font-semibold">Admin</h1>
        <p className="text-sm text-steel">Manage accounts and the certification catalog.</p>
      </div>

      <div className="flex gap-1.5 mb-5">
        <TabButton active={tab === "roster"} onClick={() => setTab("roster")} label="Roster" />
        <TabButton
          active={tab === "certifications"}
          onClick={() => setTab("certifications")}
          label="Certifications"
        />
        <TabButton active={tab === "storage"} onClick={() => setTab("storage")} label="Data migration" />
      </div>

      {tab === "roster" ? <RosterTab /> : tab === "certifications" ? <CertificationsTab /> : <StorageMigrationTab />}
    </AppShell>
  );
}

function StorageMigrationTab() {
  const [candidates, setCandidates] = useState<LegacyAttachmentCandidate[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [failures, setFailures] = useState<Array<{ name: string; error: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [confirmingCertifications, setConfirmingCertifications] = useState(false);
  const [certificationResult, setCertificationResult] = useState<string | null>(null);
  const [confirmingOperations, setConfirmingOperations] = useState(false);
  const [operationsResult, setOperationsResult] = useState<string | null>(null);
  const [confirmingCore, setConfirmingCore] = useState(false);
  const [coreResult, setCoreResult] = useState<string | null>(null);

  async function migrateCertifications() {
    const result = await migrateCertificationsToD1();
    setCertificationResult(`${result.verified} certifications copied and verified in D1 (${result.d1Count} total).`);
  }

  async function migrateOperations() {
    const result = await migrateOperationsToD1();
    setOperationsResult(`${result.verified.calendarEvents} calendar events, ${result.verified.timeEntries} time entries, and ${result.verified.timeclockPins} PINs verified in D1. Device sessions will move automatically as each browser reconnects.`);
  }

  async function migrateCore() {
    const result = await migrateCoreToD1();
    setCoreResult(`${result.verified.users} users and ${result.verified.tasks} tasks verified in D1.`);
  }

  async function scan() {
    setScanning(true);
    setError(null);
    try {
      setCandidates(await inspectLegacyAttachments());
      setCompleted(0);
      setFailures([]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not inspect Firebase attachments.");
    } finally {
      setScanning(false);
    }
  }

  async function migrate() {
    if (!candidates) return;
    setMigrating(true);
    setCompleted(0);
    setFailures([]);
    for (const candidate of candidates) {
      try {
        await migrateLegacyAttachment(candidate);
        setCompleted((count) => count + 1);
      } catch (caught) {
        setFailures((current) => [...current, {
          name: `${candidate.taskTitle} — ${candidate.attachment.name}`,
          error: caught instanceof Error ? caught.message : "Migration failed",
        }]);
      }
    }
    setMigrating(false);
    setCandidates(await inspectLegacyAttachments());
  }

  const totalBytes = candidates?.reduce((sum, candidate) => sum + candidate.attachment.size, 0) ?? 0;

  return (
    <div className="max-w-3xl space-y-4">
      <div className="rounded-lg border border-steel-line bg-paper-raised p-4">
        <h2 className="font-semibold">Final application-data migration</h2>
        <p className="mt-1 text-sm text-steel">Copy and verify user profiles, roles, certification assignments, tasks, comments, prerequisites, ordering, archives, and attachment records together. Firebase Authentication remains in place.</p>
        <button type="button" className="btn-primary mt-4" onClick={() => setConfirmingCore(true)}>Copy users and tasks to D1</button>
        {coreResult && <p className="mt-3 rounded-md bg-success/10 px-3 py-2 text-sm text-success">{coreResult}</p>}
      </div>
      <div className="rounded-lg border border-steel-line bg-paper-raised p-4">
        <h2 className="font-semibold">Operations data migration</h2>
        <p className="mt-1 text-sm text-steel">Copy and verify calendar events, attendance history, and timeclock PINs together. Signed-in device records move automatically as browsers reconnect. Firestore remains unchanged for rollback.</p>
        <button type="button" className="btn-primary mt-4" onClick={() => setConfirmingOperations(true)}>Copy operational data to D1</button>
        {operationsResult && <p className="mt-3 rounded-md bg-success/10 px-3 py-2 text-sm text-success">{operationsResult}</p>}
      </div>
      <div className="rounded-lg border border-steel-line bg-paper-raised p-4">
        <h2 className="font-semibold">Certification data migration</h2>
        <p className="mt-1 text-sm text-steel">Copy the Firestore certification catalog into the shared D1 database and verify every row. Firestore remains unchanged as the rollback source.</p>
        <button type="button" className="btn-primary mt-4" onClick={() => setConfirmingCertifications(true)}>Copy certifications to D1</button>
        {certificationResult && <p className="mt-3 rounded-md bg-success/10 px-3 py-2 text-sm text-success">{certificationResult}</p>}
      </div>
      <div className="rounded-lg border border-steel-line bg-paper-raised p-4">
        <h2 className="font-semibold">Firebase attachment migration</h2>
        <p className="mt-1 text-sm text-steel">The scan is a dry run. Migration copies each legacy file to R2, verifies its SHA-256 hash, and only then updates the task. Firebase originals are not deleted.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className="btn-secondary" onClick={scan} disabled={scanning || migrating}>{scanning ? "Scanning…" : "Scan attachments"}</button>
          {candidates && <span className="text-sm text-steel">{candidates.length} remaining · {formatMigrationBytes(totalBytes)}</span>}
          {candidates && candidates.length > 0 && <button type="button" className="btn-primary" onClick={() => setConfirming(true)} disabled={migrating}>Migrate to R2</button>}
        </div>
        {migrating && <p className="mt-3 text-sm">Migrated {completed} of {candidates?.length ?? 0}…</p>}
        {candidates?.length === 0 && <p className="mt-3 rounded-md bg-success/10 px-3 py-2 text-sm text-success">All recorded task attachments use R2.</p>}
        {error && <p className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      </div>
      {failures.length > 0 && (
        <div className="rounded-lg bg-danger/10 p-4 text-sm">
          <p className="font-semibold text-danger">{failures.length} attachment{failures.length === 1 ? "" : "s"} could not be migrated</p>
          <ul className="mt-2 space-y-1 text-steel">{failures.map((failure) => <li key={failure.name}>{failure.name}: {failure.error}</li>)}</ul>
        </div>
      )}
      {confirming && candidates && <ConfirmDialog title="Migrate attachments to R2?" description={`Copy and verify ${candidates.length} attachment${candidates.length === 1 ? "" : "s"}. Existing Firebase files will be retained for rollback.`} confirmLabel="Start migration" onConfirm={migrate} onClose={() => setConfirming(false)} />}
      {confirmingCertifications && <ConfirmDialog title="Copy certifications to D1?" description="Copy and verify the Firestore certification catalog in D1. The Firestore records will be retained for rollback." confirmLabel="Copy and verify" onConfirm={migrateCertifications} onClose={() => setConfirmingCertifications(false)} />}
      {confirmingOperations && <ConfirmDialog title="Copy operational data to D1?" description="Copy and verify calendar events, attendance history, and timeclock PINs in one batch. Firestore records will be retained for rollback." confirmLabel="Copy and verify all" onConfirm={migrateOperations} onClose={() => setConfirmingOperations(false)} />}
      {confirmingCore && <ConfirmDialog title="Copy users and tasks to D1?" description="Copy and verify all user profiles and complete task records together. Firestore remains unchanged for rollback." confirmLabel="Copy and verify final data" onConfirm={migrateCore} onClose={() => setConfirmingCore(false)} />}
    </div>
  );
}

function formatMigrationBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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
  const { certifications } = useCertifications();
  const { pins } = useTimeclockPins(true);
  const [showForm, setShowForm] = useState(false);
  const [showBatchForm, setShowBatchForm] = useState(false);
  const [lastCreated, setLastCreated] = useState<AccountCredentials | null>(null);
  const [batchResults, setBatchResults] = useState<AccountCredentials[] | null>(null);
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
        <div className="flex gap-2">
          <button onClick={() => setShowBatchForm(true)} className="btn-secondary text-sm">
            Batch import CSV
          </button>
          <button onClick={() => setShowForm(true)} className="btn-primary text-sm">
            + New account
          </button>
        </div>
      </div>

      {lastCreated && (
        <div className="bg-success/10 border border-success/30 rounded p-3 text-sm">
          <p className="font-medium">Account created for {lastCreated.email}</p>
          <p className="text-steel mt-1">
            Temporary password:{" "}
            <code className="bg-surface px-1.5 py-0.5 rounded border border-steel-line font-mono">
              {lastCreated.tempPassword}
            </code>{" "}
            — give this to the student. They&apos;ll be forced to set their own password on first
            login.
          </p>
          <p className="text-steel mt-2">
            Timeclock PIN:{" "}
            <code className="bg-surface px-1.5 py-0.5 rounded border border-steel-line font-mono">
              {lastCreated.timeclockPin}
            </code>
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => emailAccountCredentials(lastCreated)}
              className="btn-primary text-xs"
            >
              Email login details
            </button>
            <button
              type="button"
              onClick={() => setLastCreated(null)}
              className="text-xs text-steel underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {batchResults && (
        <div className="bg-success/10 border border-success/30 rounded p-3 text-sm">
          <div className="flex items-center justify-between mb-2">
            <p className="font-medium">
              Created {batchResults.filter((r) => !r.error).length} of {batchResults.length} accounts
            </p>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  downloadCsv(
                    "account-credentials-" + new Date().toISOString().slice(0, 10) + ".csv",
                    [
                      ["Name", "Email", "Temp password", "Timeclock PIN", "Status"],
                      ...batchResults.map((r) => [
                        r.name,
                        r.email,
                        r.tempPassword,
                        r.timeclockPin,
                        r.error ? "Failed: " + r.error : "Created",
                      ]),
                    ]
                  )
                }
                className="text-xs tracked-label text-blueprint"
              >
                Download CSV
              </button>
              <button
                onClick={() => setBatchResults(null)}
                className="text-xs text-steel underline"
              >
                Dismiss
              </button>
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-steel">
                  <th className="pr-3 py-1">Name</th>
                  <th className="pr-3 py-1">Email</th>
                  <th className="pr-3 py-1">Temp password</th>
                  <th className="pr-3 py-1">Timeclock PIN</th>
                  <th className="py-1"></th>
                </tr>
              </thead>
              <tbody>
                {batchResults.map((r) => (
                  <tr key={r.email} className="border-t border-success/20">
                    <td className="pr-3 py-1">{r.name}</td>
                    <td className="pr-3 py-1">{r.email}</td>
                    <td className="pr-3 py-1 font-mono">
                      {r.error ? <span className="text-danger">{r.error}</span> : r.tempPassword}
                    </td>
                    <td className="pr-3 py-1 font-mono">{r.error ? "-" : r.timeclockPin}</td>
                    <td className="py-1 text-right">
                      {!r.error && (
                        <button
                          type="button"
                          onClick={() => emailAccountCredentials(r)}
                          className="text-blueprint font-sans font-medium hover:underline"
                        >
                          Email
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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

      {showForm && (
        <NewAccountDialog
          certifications={certifications}
          onClose={() => setShowForm(false)}
          onCreated={(name, email, tempPassword, timeclockPin) => {
            setLastCreated({ name, email, tempPassword, timeclockPin });
            setShowForm(false);
          }}
        />
      )}

      {showBatchForm && (
        <BatchImportDialog
          onClose={() => setShowBatchForm(false)}
          onDone={(results) => {
            setBatchResults(results);
            setShowBatchForm(false);
          }}
        />
      )}
    </div>
  );
}

interface CsvRow {
  name: string;
  email: string;
  role: string;
  subteam: string;
  [key: string]: string;
}

function emailAccountCredentials(credentials: AccountCredentials) {
  const siteUrl = new URL(window.location.href);
  siteUrl.pathname = siteUrl.pathname.replace(/\/admin\/?$/, "/");
  siteUrl.search = "";
  siteUrl.hash = "";

  const subject = "Your 401 Ops account";
  const body = [
    `Hi ${credentials.name},`,
    "",
    "Your 401 Ops account is ready.",
    "",
    `Site: ${siteUrl.toString()}`,
    `Sign-in email: ${credentials.email}`,
    `Temporary password: ${credentials.tempPassword}`,
    `Timeclock PIN: ${credentials.timeclockPin}`,
    "",
    "The first time you sign in, you will be asked to choose a new password. Keep your timeclock PIN private and ask a coach if you need help.",
  ].join("\n");

  const mailtoUrl =
    `mailto:${encodeURIComponent(credentials.email)}` +
    `?subject=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(body)}`;

  window.open(mailtoUrl, "_blank");
}

function BatchImportDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (results: AccountCredentials[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);

  const validRoles = new Set(["student", "student_leader", "coach"]);
  const validSubteams = new Set<string>(SUBTEAMS);

  function normalizeRole(raw: string) {
    return raw.trim().toLowerCase().replace(/\s+/g, "_");
  }
  function normalizeSubteam(raw: string) {
    return raw.trim().toLowerCase();
  }

  const parsedRows = rows.map((r) => {
    const role = normalizeRole(r.role);
    const subteam = normalizeSubteam(r.subteam);
    const errors: string[] = [];
    if (!r.name?.trim()) errors.push("missing name");
    if (!r.email?.trim() || !r.email.includes("@")) errors.push("invalid email");
    if (!validRoles.has(role)) errors.push("invalid role");
    if (role !== "coach" && !validSubteams.has(subteam)) errors.push("invalid subteam");
    return { ...r, role, subteam, errors };
  });

  const validRows = parsedRows.filter((r) => r.errors.length === 0);
  const invalidCount = parsedRows.length - validRows.length;

  function handleFile(file: File) {
    setFileError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result);
        const parsed = parseCsv<CsvRow>(text);
        if (parsed.length === 0) {
          setFileError("No rows found. Make sure the file has a header row: name,email,role,subteam");
          return;
        }
        setRows(parsed);
      } catch {
        setFileError("Couldn't read that file as CSV.");
      }
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    setImporting(true);
    setProgress(0);
    const results: AccountCredentials[] = [];
    for (const row of validRows) {
      try {
        const { tempPassword, timeclockPin } = await createAccount({
          displayName: row.name.trim(),
          email: row.email.trim(),
          role: row.role as Role,
          subteam: row.role === "coach" ? null : (row.subteam as Subteam),
        });
        results.push({ name: row.name.trim(), email: row.email.trim(), tempPassword, timeclockPin });
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error";
        results.push({ name: row.name.trim(), email: row.email.trim(), tempPassword: "-", timeclockPin: "-", error: message });
      }
      setProgress((p) => p + 1);
    }
    setImporting(false);
    onDone(results);
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="bg-paper-raised border border-steel-line rounded w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="tracked-label text-xs text-blueprint font-bold">Batch import accounts</h2>
          <button type="button" onClick={onClose} className="text-steel text-sm">
            Close
          </button>
        </div>

        <p className="text-sm text-steel">
          Upload a CSV with columns <code className="font-mono">name,email,role,subteam</code>.
          Role is one of <code className="font-mono">student</code>,{" "}
          <code className="font-mono">student_leader</code>, or{" "}
          <code className="font-mono">coach</code>. Subteam is one of{" "}
          {SUBTEAMS.join(", ")} (leave blank for coaches).
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
          className="text-sm"
        />
        {fileError && <p className="text-sm text-danger">{fileError}</p>}

        {rows.length > 0 && (
          <div>
            <p className="text-sm mb-2">
              {validRows.length} valid row{validRows.length === 1 ? "" : "s"} ready to import
              {invalidCount > 0 && (
                <span className="text-danger"> — {invalidCount} skipped due to errors</span>
              )}
            </p>
            <div className="max-h-56 overflow-y-auto border border-steel-line rounded">
              <table className="w-full text-xs">
                <thead className="bg-paper sticky top-0">
                  <tr className="text-left text-steel">
                    <th className="px-2 py-1">Name</th>
                    <th className="px-2 py-1">Email</th>
                    <th className="px-2 py-1">Role</th>
                    <th className="px-2 py-1">Subteam</th>
                    <th className="px-2 py-1">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((r, i) => (
                    <tr key={i} className={"border-t border-steel-line " + (r.errors.length > 0 ? "text-danger" : "")}>
                      <td className="px-2 py-1">{r.name}</td>
                      <td className="px-2 py-1">{r.email}</td>
                      <td className="px-2 py-1">{r.role}</td>
                      <td className="px-2 py-1">{r.subteam || "—"}</td>
                      <td className="px-2 py-1">
                        {r.errors.length > 0 ? r.errors.join(", ") : "ok"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <button
          onClick={handleImport}
          disabled={validRows.length === 0 || importing}
          className="btn-primary w-full"
        >
          {importing
            ? `Creating accounts… (${progress}/${validRows.length})`
            : `Create ${validRows.length} account${validRows.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </ModalBackdrop>
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
    await sendPasswordResetEmail(auth, user.email);
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

function NewAccountDialog({
  certifications,
  onClose,
  onCreated,
}: {
  certifications: import("@/types").Certification[];
  onClose: () => void;
  onCreated: (name: string, email: string, tempPassword: string, timeclockPin: string) => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [subteam, setSubteam] = useState<Subteam>("mechanical");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  void certifications;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { tempPassword, timeclockPin } = await createAccount({
        displayName,
        email,
        role,
        subteam: role === "coach" ? null : subteam,
      });
      onCreated(displayName, email, tempPassword, timeclockPin);
    } catch (err) {
      const code = (err as { code?: string } | undefined)?.code ?? "";
      const message = err instanceof Error ? err.message : String(err);
      if (code.includes("email-already-in-use")) {
        setError("That email is already registered.");
      } else if (code === "permission-denied") {
        setError(
          "The account was created, but saving its profile was denied by Firestore. This usually means firestore.rules hasn't been published yet (Firebase console > Firestore Database > Rules > Publish), or your own coach profile document is missing/misconfigured."
        );
      } else {
        setError(`Couldn't create the account: ${message}`);
      }
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
          <h2 className="tracked-label text-xs text-blueprint font-bold">New account</h2>
          <button type="button" onClick={onClose} className="text-steel text-sm">
            Close
          </button>
        </div>
        <label className="block">
          <span className="tracked-label text-xs text-steel">Name</span>
          <input className="input mt-1" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </label>
        <label className="block">
          <span className="tracked-label text-xs text-steel">Email</span>
          <input type="email" className="input mt-1" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="block">
          <span className="tracked-label text-xs text-steel">Role</span>
          <select className="input mt-1" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="student">Student</option>
            <option value="student_leader">Student leader</option>
            <option value="coach">Coach</option>
          </select>
        </label>
        {role !== "coach" && (
          <label className="block">
            <span className="tracked-label text-xs text-steel">Subteam</span>
            <select className="input mt-1" value={subteam} onChange={(e) => setSubteam(e.target.value as Subteam)}>
              {SUBTEAMS.map((s) => (
                <option key={s} value={s}>
                  {SUBTEAM_META[s].label}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? "Creating…" : "Create account"}
        </button>
      </form>
    </ModalBackdrop>
  );
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
