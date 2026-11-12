"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  confirmPasswordReset,
  signInWithCustomToken,
  signInWithEmailAndPassword,
  updatePassword,
  verifyPasswordResetCode,
} from "firebase/auth";
import QRCode from "qrcode";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/context/auth-context";
import { fetchUser, saveUser } from "@/lib/core-api";
import { beginDeviceLink, pollDeviceLink, requestPasswordReset, type DeviceLinkStart } from "@/lib/auth-api";

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
  const [qrMode, setQrMode] = useState(false);
  const [qrBusy, setQrBusy] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [deviceLink, setDeviceLink] = useState<(DeviceLinkStart & { image: string }) | null>(null);
  const [resetCode, setResetCode] = useState<string | null>(null);
  const [resetEmail, setResetEmail] = useState("");
  const [checkingResetCode, setCheckingResetCode] = useState(false);

  function destination() {
    const next = new URLSearchParams(window.location.search).get("next");
    return next?.startsWith("/") && !next.startsWith("//") ? next : "/board";
  }

  // Already signed in with a finalized account -> go straight to the board.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "resetPassword") return;
    if (!loading && firebaseUser && profile && !profile.mustResetPassword) {
      router.replace(destination());
    }
  }, [loading, firebaseUser, profile, router]);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const code = search.get("oobCode");
    if (search.get("mode") !== "resetPassword" || !code) return;
    queueMicrotask(() => {
      setCheckingResetCode(true);
      setError(null);
      verifyPasswordResetCode(auth, code).then((verifiedEmail) => {
        setResetCode(code);
        setResetEmail(verifiedEmail);
      }).catch(() => {
        setError("This password-reset link is invalid or has expired. Request a new link below.");
        setResetMode(true);
      }).finally(() => setCheckingResetCode(false));
    });
  }, []);

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
      router.replace(destination());
    } catch {
      setError("Couldn't update your password. Try signing in again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetRequest(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    setResetMessage(null);
    try {
      await requestPasswordReset(email.trim().toLowerCase());
      setResetMessage("If that address has an account, Firebase sent a reset link. Check spam or junk mail if it does not arrive within a few minutes.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The reset request failed. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetCompletion(e: FormEvent) {
    e.preventDefault();
    if (!resetCode) return;
    setError(null);
    if (newPassword.length < 8) return setError("Use at least 8 characters.");
    if (newPassword !== confirmPassword) return setError("Passwords don't match.");
    setSubmitting(true);
    try {
      await confirmPasswordReset(auth, resetCode, newPassword);
      const credential = await signInWithEmailAndPassword(auth, resetEmail, newPassword);
      const nextProfile = await fetchUser(credential.user.uid);
      if (nextProfile.mustResetPassword) await saveUser({ ...nextProfile, mustResetPassword: false });
      router.replace(destination());
    } catch {
      setError("The password could not be reset. The link may have expired; request a new one and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function beginQrSignIn() {
    setQrMode(true);
    setQrBusy(true);
    setQrError(null);
    setDeviceLink(null);
    try {
      const link = await beginDeviceLink();
      const image = await QRCode.toDataURL(link.approvalUrl, { width: 360, margin: 1, errorCorrectionLevel: "M" });
      setDeviceLink({ ...link, image });
    } catch (caught) {
      setQrError(caught instanceof Error ? caught.message : "Could not create a sign-in code.");
    } finally {
      setQrBusy(false);
    }
  }

  useEffect(() => {
    if (!deviceLink) return;
    let cancelled = false;
    let timer: number | undefined;
    async function poll() {
      if (!deviceLink) return;
      try {
        const result = await pollDeviceLink(deviceLink.id, deviceLink.pollToken);
        if (result.status === "approved") {
          await signInWithCustomToken(auth, result.customToken);
          router.replace(destination());
          return;
        }
        if (!cancelled) timer = window.setTimeout(poll, 1500);
      } catch (caught) {
        if (cancelled) return;
        setQrError(caught instanceof Error ? caught.message : "Could not finish QR sign-in.");
        setDeviceLink(null);
      }
    }
    timer = window.setTimeout(poll, 1000);
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [deviceLink, router]);

  if (checkingResetCode) {
    return <main className="flex-1 grid-paper flex items-center justify-center px-4"><p className="tracked-label text-sm text-steel">Checking reset link…</p></main>;
  }

  if (resetCode) {
    return <main className="flex-1 grid-paper flex items-center justify-center px-4">
      <form onSubmit={handleResetCompletion} className="bg-paper-raised border border-steel-line rounded w-full max-w-sm p-8 space-y-5">
        <div><p className="tracked-label text-xs text-blueprint mb-1">401 Ops</p><h1 className="text-xl font-semibold">Choose a new password</h1><p className="mt-1 text-sm text-steel">Resetting the password for {resetEmail}.</p></div>
        <Field label="New password"><input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="input" minLength={8} autoComplete="new-password" required /></Field>
        <Field label="Confirm password"><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="input" minLength={8} autoComplete="new-password" required /></Field>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={submitting} className="btn-primary w-full">{submitting ? "Resetting…" : "Reset password and sign in"}</button>
      </form>
    </main>;
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
        onSubmit={qrMode ? (event) => event.preventDefault() : resetMode ? handleResetRequest : handleSignIn}
        className="bg-paper-raised border border-steel-line rounded w-full max-w-sm p-8 space-y-5"
      >
        <div>
          <p className="tracked-label text-xs text-blueprint mb-1">401 Ops</p>
          <h1 className="text-xl font-semibold">{resetMode ? "Reset your password" : qrMode ? "Sign in with a QR code" : "Sign in"}</h1>
          <p className="text-sm text-steel mt-1">
            {resetMode ? "Enter your account email and we’ll send you a reset link." : qrMode ? "Scan this from a device where you are already signed in, then approve the new device." : "Use the email and password your coach gave you."}
          </p>
        </div>
        {!qrMode && <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            required
            autoComplete="email"
          />
        </Field>}
        {!resetMode && !qrMode && <Field label="Password">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            required
            autoComplete="current-password"
          />
        </Field>}
        {qrMode ? <>
          {qrBusy && <div className="flex min-h-64 items-center justify-center text-sm text-steel">Creating secure code…</div>}
          {deviceLink && <>
            {/* Generated data URLs do not benefit from Next image optimization. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={deviceLink.image} alt="QR code for signing in this device" className="mx-auto w-full max-w-[300px] rounded-lg bg-white p-2" />
          </>}
          {qrError && <p role="alert" className="text-sm text-danger">{qrError}</p>}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-secondary" onClick={() => { setQrMode(false); setDeviceLink(null); setQrError(null); }}>Use password</button>
            <button type="button" className="btn-primary" disabled={qrBusy} onClick={() => void beginQrSignIn()}>New code</button>
          </div>
        </> : <>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          {resetMessage && <p role="status" className="rounded border border-steel-line bg-surface px-3 py-2 text-sm text-steel">{resetMessage}</p>}
          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? (resetMode ? "Sending…" : "Signing in…") : (resetMode ? "Send reset link" : "Sign in")}
          </button>
          <button type="button" className="w-full text-sm font-medium text-blueprint hover:underline" onClick={() => { setResetMode((current) => !current); setError(null); setResetMessage(null); }}>
            {resetMode ? "Back to sign in" : "Forgot your password?"}
          </button>
          {!resetMode && <button type="button" className="btn-secondary w-full" onClick={() => void beginQrSignIn()}>Sign in with a QR code</button>}
        </>}
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
