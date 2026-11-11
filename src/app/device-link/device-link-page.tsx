"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { respondToDeviceLink } from "@/lib/auth-api";

export default function DeviceLinkPage() {
  const { firebaseUser, profile, loading } = useAuth();
  const [credentials, setCredentials] = useState<{ id: string; token: string } | null>(null);
  const [returnPath, setReturnPath] = useState("/device-link");
  const [working, setWorking] = useState<"approve" | "deny" | null>(null);
  const [decision, setDecision] = useState<"approved" | "denied" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const url = new URL(window.location.href);
    const id = url.searchParams.get("id");
    const token = url.searchParams.get("token");
    queueMicrotask(() => {
      setReturnPath(`${url.pathname}${url.search}`);
      if (id && token) setCredentials({ id, token });
      else setError("This device sign-in link is incomplete.");
    });
  }, []);

  async function respond(approve: boolean) {
    if (!credentials) return;
    setWorking(approve ? "approve" : "deny");
    setError("");
    try {
      await respondToDeviceLink(credentials.id, credentials.token, approve);
      setDecision(approve ? "approved" : "denied");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The device sign-in request could not be completed.");
    } finally {
      setWorking(null);
    }
  }

  return <main className="flex flex-1 items-center justify-center px-4 py-10">
    <section className="w-full max-w-sm space-y-5 rounded-lg border border-steel-line bg-paper-raised p-7 shadow-lg">
      <div><p className="tracked-label text-xs text-blueprint">401 Ops</p><h1 className="mt-1 text-xl font-semibold">Approve device sign-in</h1></div>
      {loading ? <p className="text-sm text-steel">Checking your account…</p> : decision ? <>
        <p className="text-sm font-medium">{decision === "approved" ? "Approved. The other device will sign in automatically." : "Denied. The other device was not signed in."}</p>
        <p className="text-sm text-steel">You can close this page.</p>
      </> : !firebaseUser || !profile ? <>
        <p className="text-sm text-steel">Sign in on this device first, then approve the new device.</p>
        <Link className="btn-primary block text-center" href={`/login?next=${encodeURIComponent(returnPath)}`}>Sign in</Link>
      </> : <>
        <p className="text-sm">Sign in the new device as <strong>{profile.displayName}</strong>?</p>
        <p className="text-sm text-steel">Only approve a QR code currently visible on a device in front of you.</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn-secondary" disabled={Boolean(working) || !credentials} onClick={() => void respond(false)}>{working === "deny" ? "Denying…" : "Deny"}</button>
          <button type="button" className="btn-primary" disabled={Boolean(working) || !credentials} onClick={() => void respond(true)}>{working === "approve" ? "Approving…" : "Approve"}</button>
        </div>
      </>}
      {error && <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
    </section>
  </main>;
}
