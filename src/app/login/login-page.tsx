"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updatePassword,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/context/auth-context";
import { saveUser } from "@/lib/core-api";

export default function LoginPage() {
  const { firebaseUser, profile, loading } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  // Already signed in with a finalized account -> go straight to the board.
  useEffect(() => {
    if (!loading && firebaseUser && profile && !profile.mustResetPassword) {
      router.replace("/board");
    }
  }, [loading, firebaseUser, profile, router]);

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setError("That email or password wasn't recognized. Check with your coach if you're not sure.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handlePasswordReset(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (!auth.currentUser) return;
    setSubmitting(true);
    try {
      await updatePassword(auth.currentUser, newPassword);
      if (profile) await saveUser({ ...profile, mustResetPassword: false });
      router.replace("/board");
    } catch {
      setError("Couldn't update your password. Try signing in again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetRequest(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResetMessage(null);
    try {
      await sendPasswordResetEmail(auth, email.trim().toLowerCase());
      setResetMessage("If that address has an account, a reset link has been sent.");
    } catch {
      // Keep the response generic so this screen never reveals which students
      // have accounts. Firebase may also intentionally hide that distinction.
      setResetMessage("If that address has an account, a reset link has been sent.");
    } finally {
      setSubmitting(false);
    }
  }

  // Stage 2: signed in on a temp password, must set a real one before continuing.
  if (firebaseUser && profile?.mustResetPassword) {
    return (
      <main className="flex-1 grid-paper flex items-center justify-center px-4">
        <form
          onSubmit={handlePasswordReset}
          className="bg-paper-raised border border-steel-line rounded w-full max-w-sm p-8 space-y-5"
        >
          <div>
            <p className="tracked-label text-xs text-blueprint mb-1">First login</p>
            <h1 className="text-xl font-semibold">Set a new password</h1>
            <p className="text-sm text-steel mt-1">
              Welcome, {profile.displayName}. Choose a password only you know.
            </p>
          </div>
          <Field label="New password">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input"
              required
            />
          </Field>
          <Field label="Confirm password">
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input"
              required
            />
          </Field>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? "Saving…" : "Save and continue"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="flex-1 grid-paper flex items-center justify-center px-4">
      <form
        onSubmit={resetMode ? handleResetRequest : handleSignIn}
        className="bg-paper-raised border border-steel-line rounded w-full max-w-sm p-8 space-y-5"
      >
        <div>
          <p className="tracked-label text-xs text-blueprint mb-1">401 Ops</p>
          <h1 className="text-xl font-semibold">{resetMode ? "Reset your password" : "Sign in"}</h1>
          <p className="text-sm text-steel mt-1">
            {resetMode ? "Enter your account email and we’ll send you a reset link." : "Use the email and password your coach gave you."}
          </p>
        </div>
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            required
            autoComplete="email"
          />
        </Field>
        {!resetMode && <Field label="Password">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            required
            autoComplete="current-password"
          />
        </Field>}
        {error && <p className="text-sm text-danger">{error}</p>}
        {resetMessage && <p role="status" className="rounded border border-steel-line bg-surface px-3 py-2 text-sm text-steel">{resetMessage}</p>}
        <button type="submit" disabled={submitting} className="btn-primary w-full">
          {submitting ? (resetMode ? "Sending…" : "Signing in…") : (resetMode ? "Send reset link" : "Sign in")}
        </button>
        <button type="button" className="w-full text-sm font-medium text-blueprint hover:underline" onClick={() => { setResetMode((current) => !current); setError(null); setResetMessage(null); }}>
          {resetMode ? "Back to sign in" : "Forgot your password?"}
        </button>
      </form>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="tracked-label text-xs text-steel">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
