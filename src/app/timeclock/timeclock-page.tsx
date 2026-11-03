"use client";

import { useEffect, useState, type FormEvent } from "react";
import { EmailAuthProvider, reauthenticateWithCredential, signOut as firebaseSignOut } from "firebase/auth";
import { AppShell } from "@/components/app-shell";
import { ModalBackdrop } from "@/components/modal-backdrop";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { durationMs, formatDuration } from "@/components/personal-time-report";
import { useAuth } from "@/context/auth-context";
import { auth } from "@/lib/firebase";
import { useTimeEntries, useUsers } from "@/lib/hooks";
import {
  clearKioskSession,
  getKioskSession,
  startKioskSession,
  type KioskConfig,
} from "@/lib/kiosk-session";
import {
  clockInUser,
  clockOutEntry,
  clockOutEveryone,
  findUidByPin,
} from "@/lib/timeclock-actions";
import type { TimeclockActivity, TimeEntry, UserProfile } from "@/types";

export default function TimeclockPage() {
  const { profile, actualProfile, isCoach } = useAuth();
  const { users } = useUsers();
  const entryScope = profile && isCoach ? null : undefined;
  const { entries, loading } = useTimeEntries(entryScope);
  const [now, setNow] = useState(() => new Date());
  const [showKioskSetup, setShowKioskSetup] = useState(false);
  const [kioskConfig, setKioskConfig] = useState<KioskConfig | null>(null);
  const [kioskChecked, setKioskChecked] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmSignOutAll, setConfirmSignOutAll] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isCoach) return;
    const timer = window.setTimeout(() => {
      setKioskConfig(getKioskSession());
      setKioskChecked(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isCoach]);

  if (!profile) return <AppShell><p className="text-sm text-steel">Loading…</p></AppShell>;
  if (isCoach && !kioskChecked) {
    return <div className="fixed inset-0 bg-paper grid-paper flex items-center justify-center"><p className="tracked-label text-sm text-steel">Loading timeclock…</p></div>;
  }

  const activeEntries = entries.filter((entry) => !entry.clockOut);

  async function signOutOne(entry: TimeEntry) {
    if (!profile) return;
    setActionError(null);
    try {
      await clockOutEntry(entry.id, actualProfile?.uid ?? profile.uid);
    } catch {
      setActionError("That person could not be signed out. Refresh and try again.");
    }
  }

  async function signOutAll() {
    if (!profile || activeEntries.length === 0) return;
    setActionError(null);
    try {
      await clockOutEveryone(activeEntries, actualProfile?.uid ?? profile.uid);
    } catch {
      setActionError("Not everyone could be signed out. Refresh and try again.");
    }
  }

  function startKiosk(config: KioskConfig) {
    startKioskSession(config);
    setKioskConfig(config);
    setShowKioskSetup(false);
  }

  function exitKiosk() {
    clearKioskSession();
    setKioskConfig(null);
  }

  return (
    <AppShell>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Timeclock</h1>
          <p className="text-sm text-steel">
            {isCoach ? "Track attendance, manage active sessions, and review team hours." : "Review your shop and outreach hours."}
          </p>
        </div>
        {isCoach && (
          <button type="button" onClick={() => setShowKioskSetup(true)} className="btn-primary text-sm">Start kiosk</button>
        )}
      </div>

      {!isCoach ? (
        <div className="bg-paper-raised border border-steel-line rounded p-4">
          <h2 className="font-medium">Your time report has moved</h2>
          <p className="text-sm text-steel mt-1">Open Reports to see your task history, certifications, attendance sessions, and cumulative hours together.</p>
        </div>
      ) : loading ? (
        <p className="text-sm text-steel">Loading time history…</p>
      ) : isCoach ? (
        <CoachDashboard
          users={users}
          activeEntries={activeEntries}
          now={now}
          error={actionError}
          onSignOut={signOutOne}
          onSignOutAll={() => setConfirmSignOutAll(true)}
        />
      ) : null}
      {confirmSignOutAll && <ConfirmDialog title="Sign everyone out?" description={`Sign out all ${activeEntries.length} people currently clocked in?`} confirmLabel="Sign everyone out" onConfirm={signOutAll} onClose={() => setConfirmSignOutAll(false)} />}

      {showKioskSetup && (
        <KioskSetup onClose={() => setShowKioskSetup(false)} onStart={startKiosk} />
      )}
      {kioskConfig && isCoach && (
        <Kiosk
          config={kioskConfig}
          coach={profile}
          users={users}
          entries={entries}
          now={now}
          onExit={exitKiosk}
        />
      )}
    </AppShell>
  );
}

function CoachDashboard({
  users,
  activeEntries,
  now,
  error,
  onSignOut,
  onSignOutAll,
}: {
  users: UserProfile[];
  activeEntries: TimeEntry[];
  now: Date;
  error: string | null;
  onSignOut: (entry: TimeEntry) => void;
  onSignOutAll: () => void;
}) {
  return (
    <div className="space-y-6">
      <section className="bg-paper-raised border border-steel-line rounded p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="tracked-label text-xs font-bold">Currently signed in</h2>
            <p className="text-xs text-steel mt-1">{activeEntries.length} active session{activeEntries.length === 1 ? "" : "s"}</p>
          </div>
          {activeEntries.length > 0 && (
            <button type="button" onClick={onSignOutAll} className="text-danger border border-danger/40 rounded px-3 py-2 text-xs font-medium">
              Sign everyone out
            </button>
          )}
        </div>
        {error && <p className="text-sm text-danger mb-3">{error}</p>}
        {activeEntries.length === 0 ? (
          <p className="text-sm text-steel">Nobody is currently clocked in.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {activeEntries.map((entry) => {
              const user = users.find((candidate) => candidate.uid === entry.uid);
              return (
                <div key={entry.id} className="border border-success/30 bg-success/10 rounded p-3">
                  <p className="font-medium text-sm">{user?.displayName ?? "Former team member"}</p>
                  <p className="text-xs text-steel mt-1">{activityLabel(entry)} · {formatDuration(durationMs(entry, now))}</p>
                  <p className="text-[10px] text-steel mt-1">Since {formatDateTime(entry.clockIn)}</p>
                  <button type="button" onClick={() => onSignOut(entry)} className="btn-secondary text-xs mt-3 w-full">Sign out</button>
                </div>
              );
            })}
          </div>
        )}
      </section>

    </div>
  );
}

function KioskSetup({ onClose, onStart }: { onClose: () => void; onStart: (config: KioskConfig) => void }) {
  const [activity, setActivity] = useState<TimeclockActivity>("shop");
  const [activityName, setActivityName] = useState("Team shop");
  function submit(event: FormEvent) {
    event.preventDefault();
    onStart({ activity, activityName: activityName.trim() });
  }
  return (
    <ModalBackdrop onClose={onClose}>
      <form onSubmit={submit} className="bg-paper-raised border border-steel-line rounded w-full max-w-sm p-6 space-y-4">
        <div className="flex justify-between gap-3">
          <h2 className="tracked-label text-xs text-blueprint font-bold">Start timeclock kiosk</h2>
          <button type="button" onClick={onClose} className="text-sm text-steel">Close</button>
        </div>
        <label className="block">
          <span className="tracked-label text-xs text-steel">Activity</span>
          <select className="input mt-1" value={activity} onChange={(event) => setActivity(event.target.value as TimeclockActivity)}>
            <option value="shop">Shop</option>
            <option value="outreach">Outreach</option>
          </select>
        </label>
        <label className="block">
          <span className="tracked-label text-xs text-steel">Session name</span>
          <input className="input mt-1" value={activityName} onChange={(event) => setActivityName(event.target.value)} maxLength={80} placeholder="Team shop, Demo at the library…" />
        </label>
        <p className="text-xs text-steel">PINs are managed from Admin → Roster. This browser will remain in kiosk mode after a refresh. A coach can verify their password or safely sign the coach account out to exit.</p>
        <button type="submit" className="btn-primary w-full">Launch kiosk</button>
      </form>
    </ModalBackdrop>
  );
}

function Kiosk({
  config,
  coach,
  users,
  entries,
  now,
  onExit,
}: {
  config: KioskConfig;
  coach: UserProfile;
  users: UserProfile[];
  entries: TimeEntry[];
  now: Date;
  onExit: () => void;
}) {
  const [pin, setPin] = useState("");
  const [processing, setProcessing] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [showExit, setShowExit] = useState(false);
  const activeEntries = entries
    .filter((entry) => !entry.clockOut)
    .sort((a, b) => a.clockIn.localeCompare(b.clockIn));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!pin) return;
    setProcessing(true);
    setFeedback(null);
    try {
      const uid = await findUidByPin(pin);
      const user = users.find((candidate) => candidate.uid === uid);
      if (!uid || !user) throw new Error("PIN not recognized. Ask a coach for help.");
      const openEntry = entries.find((entry) => entry.uid === uid && !entry.clockOut);
      if (openEntry) {
        await clockOutEntry(openEntry.id, coach.uid);
        setFeedback({ type: "success", message: `${user.displayName} signed out. See you next time!` });
      } else {
        await clockInUser(uid, config.activity, config.activityName, coach.uid);
        setFeedback({ type: "success", message: `${user.displayName} signed in. Welcome!` });
      }
      setPin("");
    } catch (error) {
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Timeclock failed. Ask a coach for help." });
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-paper grid-paper flex flex-col">
      <header className="bg-paper-raised border-b border-steel-line px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <p className="tracked-label text-[10px] text-blueprint">Timeclock kiosk</p>
          <p className="text-sm font-medium">{config.activityName || (config.activity === "shop" ? "Shop" : "Outreach")}</p>
        </div>
        <button type="button" onClick={() => setShowExit(true)} className="btn-secondary text-xs">Coach exit</button>
      </header>
      <main className="flex-1 overflow-y-auto p-5 flex items-center justify-center">
        <div className="w-full max-w-5xl grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.75fr)] items-start">
        <form onSubmit={submit} className="w-full text-center bg-paper-raised border border-steel-line rounded p-6 sm:p-10 shadow-sm">
          <h1 className="text-2xl font-semibold">Sign in or out</h1>
          <p className="text-sm text-steel mt-2">Enter your 1–3 digit PIN.</p>
          <input
            autoFocus
            className="input mt-6 text-center font-mono text-4xl tracking-[0.35em] py-4"
            value={pin}
            onChange={(event) => {
              setPin(event.target.value.replace(/\D/g, "").slice(0, 3));
              setFeedback(null);
            }}
            inputMode="numeric"
            pattern="[0-9]{1,3}"
            aria-label="Timeclock PIN"
          />
          <button type="submit" disabled={!pin || processing} className="btn-primary w-full mt-4 text-lg py-3">
            {processing ? "Checking…" : "Continue"}
          </button>
          <div className="h-20 mt-5 flex items-start justify-center" aria-live="polite">
            {feedback && (
              <p className={`w-full max-h-20 overflow-y-auto rounded border p-3 text-sm font-medium ${feedback.type === "success" ? "bg-success/10 border-success/30 text-success" : "bg-danger/10 border-danger/30 text-danger"}`}>
                {feedback.message}
              </p>
            )}
          </div>
          <p className="text-xs text-steel mt-1">Signing in records attendance for {activityLabelFromConfig(config)}.</p>
        </form>
        <section className="bg-paper-raised border border-steel-line rounded p-4 shadow-sm">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h2 className="tracked-label text-xs font-bold">Currently signed in</h2>
            <span className="text-xs text-steel">{activeEntries.length}</span>
          </div>
          {activeEntries.length === 0 ? (
            <p className="text-sm text-steel py-4 text-center">Nobody is signed in yet.</p>
          ) : (
            <div className="divide-y divide-steel-line max-h-[55vh] overflow-y-auto">
              {activeEntries.map((entry) => {
                const user = users.find((candidate) => candidate.uid === entry.uid);
                return (
                  <div key={entry.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-success shrink-0" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{user?.displayName ?? "Former team member"}</p>
                        <p className="text-[10px] text-steel truncate">{activityLabel(entry)}</p>
                      </div>
                    </div>
                    <span className="text-xs font-semibold shrink-0">{formatDuration(durationMs(entry, now))}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        </div>
      </main>
      {showExit && <KioskExit onCancel={() => setShowExit(false)} onExit={onExit} />}
    </div>
  );
}

function KioskExit({ onCancel, onExit }: { onCancel: () => void; onExit: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const currentUser = auth.currentUser;
    if (!currentUser?.email) {
      setError("The current Firebase account has no email address. Use the safe sign-out option below.");
      return;
    }
    setChecking(true);
    setError(null);
    try {
      // Use the email from Firebase Authentication itself. The profile email
      // can become stale if an account is changed in the Firebase console.
      await reauthenticateWithCredential(currentUser, EmailAuthProvider.credential(currentUser.email, password));
      onExit();
    } catch (caught) {
      const code = (caught as { code?: string }).code ?? "";
      if (["auth/invalid-credential", "auth/wrong-password", "auth/user-mismatch"].includes(code)) {
        setError("That password does not match the currently signed-in coach account.");
      } else if (code === "auth/network-request-failed") {
        setError("The kiosk could not reach Firebase. Check the internet connection and try again.");
      } else if (code === "auth/too-many-requests") {
        setError("Firebase temporarily blocked password attempts. Wait a moment or use safe sign-out.");
      } else {
        setError(`Firebase could not verify this account${code ? ` (${code})` : ""}. Use safe sign-out below.`);
      }
    } finally {
      setChecking(false);
    }
  }

  async function safeSignOut() {
    setChecking(true);
    setError(null);
    try {
      await firebaseSignOut(auth);
      onExit();
    } catch {
      setError("Firebase could not sign the coach account out. Check the internet connection and try again.");
      setChecking(false);
    }
  }
  return (
    <ModalBackdrop onClose={onCancel}>
      <form onSubmit={submit} className="bg-paper-raised border border-steel-line rounded w-full max-w-sm p-6 space-y-4">
        <div>
          <h2 className="tracked-label text-xs text-blueprint font-bold">Exit kiosk mode</h2>
          <p className="text-xs text-steel mt-1">Enter the currently signed-in coach&apos;s password to return to the app.</p>
        </div>
        <input type="password" className="input" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus autoComplete="current-password" placeholder="Coach password" />
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={!password || checking} className="btn-primary">{checking ? "Checking…" : "Exit kiosk"}</button>
          <button type="button" onClick={onCancel} className="btn-secondary">Cancel</button>
        </div>
        <div className="border-t border-steel-line pt-4">
          <button type="button" onClick={safeSignOut} disabled={checking} className="text-danger text-sm font-medium">
            Sign coach out and exit kiosk
          </button>
          <p className="text-[10px] text-steel mt-1">This always returns the device to the login screen, so it cannot expose coach access.</p>
        </div>
      </form>
    </ModalBackdrop>
  );
}


function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function activityLabel(entry: TimeEntry) {
  return entry.activityName || (entry.activity === "shop" ? "Shop" : "Outreach");
}

function activityLabelFromConfig(config: KioskConfig) {
  return config.activityName || (config.activity === "shop" ? "shop time" : "this outreach event");
}
