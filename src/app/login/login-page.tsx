"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Team401SignIn } from "@team401/web-ui";
import { useAuth } from "@/context/auth-context";
import { beginDeviceLink, completeCentralSignIn, pollDeviceLink, requestPasswordReset, type DeviceLinkStart } from "@/lib/auth-api";

export default function LoginPage() {
  const { authUser, loading, refreshSession } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [resetMode, setResetMode] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrMode, setQrMode] = useState(false);
  const [qrBusy, setQrBusy] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [deviceLink, setDeviceLink] = useState<(DeviceLinkStart & { image: string }) | null>(null);
  function destination() {
    const next = new URLSearchParams(window.location.search).get("next");
    if (!next?.startsWith("/")) return "/board";
    const target = new URL(next, window.location.origin);
    return target.origin === window.location.origin ? target.pathname + target.search + target.hash : "/board";
  }

  useEffect(() => {
    if (!loading && authUser) router.replace(destination());
  }, [authUser, loading, router]);

  async function handleResetRequest(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setResetMessage(null);
    try {
      await requestPasswordReset(email.trim().toLowerCase());
      setResetMessage("If that address has an account, Team 401 Auth sent a reset link. Check spam or junk mail if it does not arrive within a few minutes.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The reset request failed. Try again.");
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
    const poll = async () => {
      try {
        const result = await pollDeviceLink(deviceLink.id, deviceLink.pollToken);
        if (result.status === "authenticated") {
          await refreshSession();
          router.replace(destination());
          return;
        }
        if (!cancelled) timer = window.setTimeout(poll, 1500);
      } catch (caught) {
        if (cancelled) return;
        setQrError(caught instanceof Error ? caught.message : "Could not finish QR sign-in.");
        setDeviceLink(null);
      }
    };
    timer = window.setTimeout(poll, 1000);
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [deviceLink, refreshSession, router]);

  if (!resetMode && !qrMode) {
    return <main className="flex-1 grid-paper flex items-center justify-center px-4">
      <div className="bg-paper-raised border border-steel-line rounded w-full max-w-sm p-8 space-y-4">
        <Team401SignIn
          application="ops"
          authOrigin={typeof window !== "undefined" && window.location.hostname.endsWith(".pages.dev") ? `${window.location.origin}/api/central-auth` : undefined}
          completeSignIn={async (authorization) => {
            await completeCentralSignIn(authorization);
            if (!await refreshSession()) throw new Error("Your credentials were accepted, but Ops could not establish a browser session.");
          }}
          onAuthenticated={() => router.replace(destination())}
          onForgotPassword={() => { setError(null); setResetMessage(null); setResetMode(true); }}
          heading="401 Ops"
        />
        <button type="button" className="btn-secondary w-full" onClick={() => void beginQrSignIn()}>Sign in with a QR code</button>
      </div>
    </main>;
  }

  return <main className="flex-1 grid-paper flex items-center justify-center px-4">
    <form onSubmit={qrMode ? (event) => event.preventDefault() : handleResetRequest} className="bg-paper-raised border border-steel-line rounded w-full max-w-sm p-8 space-y-5">
      <div><p className="tracked-label text-xs text-blueprint mb-1">401 Ops</p><h1 className="text-xl font-semibold">{resetMode ? "Reset your password" : "Sign in with a QR code"}</h1><p className="text-sm text-steel mt-1">{resetMode ? "Enter your Team 401 account email and we’ll send you a reset link." : "Scan this from a device where you are already signed in, then approve the new device."}</p></div>
      {resetMode ? <>
        <label className="block"><span className="tracked-label text-xs text-steel">Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="input mt-1" required autoComplete="email" /></label>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {resetMessage && <p role="status" className="rounded border border-steel-line bg-surface px-3 py-2 text-sm text-steel">{resetMessage}</p>}
        <button type="submit" disabled={submitting} className="btn-primary w-full">{submitting ? "Sending…" : "Send reset link"}</button>
        <button type="button" className="w-full text-sm font-medium text-blueprint hover:underline" onClick={() => { setResetMode(false); setError(null); }}>Back to sign in</button>
      </> : <>
        {qrBusy && <div className="flex min-h-64 items-center justify-center text-sm text-steel">Creating secure code…</div>}
        {/* eslint-disable-next-line @next/next/no-img-element -- the QR code is a generated data URL */}
        {deviceLink && <img src={deviceLink.image} alt="QR code for signing in this device" className="mx-auto w-full max-w-[300px] rounded-lg bg-white p-2" />}
        {qrError && <p role="alert" className="text-sm text-danger">{qrError}</p>}
        <div className="grid grid-cols-2 gap-2"><button type="button" className="btn-secondary" onClick={() => { setQrMode(false); setDeviceLink(null); setQrError(null); }}>Use password</button><button type="button" className="btn-primary" disabled={qrBusy} onClick={() => void beginQrSignIn()}>New code</button></div>
      </>}
    </form>
  </main>;
}
