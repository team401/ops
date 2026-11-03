"use client";

import { FormEvent, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { EmailAuthProvider, reauthenticateWithCredential, sendPasswordResetEmail, updatePassword } from "firebase/auth";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/context/auth-context";
import { auth } from "@/lib/firebase";
import { getCardDefault, setCardDefault, subscribeCardDefault, type CardDefault } from "@/lib/card-preferences";
import { getDeviceId, revokeDeviceSession, watchDeviceSessions, type DeviceSession } from "@/lib/device-sessions";

export default function AccountPage() {
  const { profile, firebaseUser, signOut } = useAuth();
  const cardDefaultValue = useSyncExternalStore(subscribeCardDefault, getCardDefault, () => "collapsed");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [otherDevices, setOtherDevices] = useState<DeviceSession[]>([]);
  useEffect(() => {
    if (!firebaseUser) return;
    return watchDeviceSessions(firebaseUser.uid, (sessions) => {
      const currentId = getDeviceId();
      setOtherDevices(sessions.filter((session) => session.id !== currentId && !session.revoked));
    });
  }, [firebaseUser]);
  if (!profile || !firebaseUser) return null;
  const currentUser = firebaseUser;
  const currentProfile = profile;

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    if (newPassword !== confirmPassword) return setMessage("The new passwords do not match.");
    setSaving(true);
    try {
      const credential = EmailAuthProvider.credential(currentUser.email ?? currentProfile.email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPassword);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setMessage("Password changed.");
    } catch {
      setMessage("Password could not be changed. Check your current password and try again.");
    } finally { setSaving(false); }
  }

  async function sendReset() {
    setMessage("");
    try {
      await sendPasswordResetEmail(auth, currentUser.email ?? currentProfile.email);
      setMessage("Password-reset email sent.");
    } catch { setMessage("The reset email could not be sent."); }
  }

  function changeCardDefault(value: CardDefault) {
    setCardDefault(value);
  }

  return <AppShell>
    <div className="mx-auto max-w-5xl">
      <div className="mb-5"><h1 className="text-xl font-semibold">Account</h1><p className="text-sm text-steel">Security, reports, and your Ops preferences.</p></div>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className="account-card"><h2>Profile</h2><p className="font-semibold">{profile.displayName}</p><p className="text-sm text-steel">{profile.email}</p><div className="mt-4 flex flex-wrap gap-2"><Link href="/reports" className="btn-secondary">Open reports</Link><button type="button" onClick={() => signOut()} className="btn-secondary">Sign out</button></div></section>
        <section className="account-card"><h2>Task-card settings</h2><p className="mb-3 text-sm text-steel">Your assigned tasks stay expanded. Choose how other people&apos;s cards appear by default in Kanban.</p><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => changeCardDefault("collapsed")} className={cardDefaultValue === "collapsed" ? "btn-primary" : "btn-secondary"}>Collapsed</button><button type="button" onClick={() => changeCardDefault("expanded")} className={cardDefaultValue === "expanded" ? "btn-primary" : "btn-secondary"}>Expanded</button></div></section>
        <section className="account-card"><h2>Change password</h2><form className="grid gap-3" onSubmit={changePassword}><input className="input" type="password" autoComplete="current-password" placeholder="Current password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /><input className="input" type="password" autoComplete="new-password" minLength={6} placeholder="New password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /><input className="input" type="password" autoComplete="new-password" minLength={6} placeholder="Confirm new password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /><div className="flex flex-wrap gap-2"><button className="btn-primary" disabled={saving}>{saving ? "Changing…" : "Change password"}</button><button type="button" onClick={sendReset} className="btn-secondary">Email reset link</button></div>{message && <p role="status" className="text-sm text-steel">{message}</p>}</form></section>
        <section className="account-card"><h2>Signed-in devices</h2><div className="rounded-lg border border-steel-line bg-surface p-3"><p className="text-sm font-semibold">This device</p><p className="mt-1 text-xs text-steel">Current browser session</p></div><div className="mt-2 grid gap-2">{otherDevices.map((device) => <div key={device.id} className="flex items-center gap-3 rounded-lg border border-steel-line bg-surface p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold" title={device.userAgent}>{device.label}</p><p className="text-xs text-steel">Last active {new Date(device.lastSeenAt).toLocaleString()}</p></div><button type="button" className="btn-secondary shrink-0 text-xs" onClick={() => revokeDeviceSession(currentUser.uid, device.id)}>Sign out</button></div>)}</div>{otherDevices.length === 0 && <p className="mt-3 text-sm text-steel">No other active Ops devices are registered.</p>}<p className="mt-3 text-xs text-steel">Revoked browsers sign out when they next connect to Ops.</p></section>
      </div>
    </div>
  </AppShell>;
}
