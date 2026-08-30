"use client";

import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { useAuth } from "@/context/auth-context";
import { useUsers, useCertifications } from "@/lib/hooks";
import { grantCertification, revokeCertification } from "@/lib/admin-actions";
import { SUBTEAM_META } from "@/lib/subteam-meta";
import type { UserProfile, Certification } from "@/types";

export default function CertificationsPage() {
  const { profile, isCoach, isStudentLeader } = useAuth();
  const canManage = isCoach || isStudentLeader;

  return (
    <AppShell>
      <div className="mb-5">
        <h1 className="text-lg font-semibold">Certifications</h1>
        <p className="text-sm text-steel">
          {canManage
            ? "Grant or revoke certifications for team members. Tasks with matching requirements unlock automatically."
            : "Your certifications determine which tasks you can claim."}
        </p>
      </div>

      {canManage ? <ManageGrid /> : <MyCertifications />}
      {!profile && null}
    </AppShell>
  );
}

function MyCertifications() {
  const { profile } = useAuth();
  const { certifications, loading } = useCertifications();

  if (loading || !profile) {
    return <p className="text-sm text-steel">Loading…</p>;
  }

  const relevant = certifications.filter(
    (c) => c.subteam === null || c.subteam === profile.subteam
  );

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {relevant.map((c) => {
        const held = profile.certificationIds.includes(c.id);
        return (
          <div
            key={c.id}
            className={`border rounded p-3 ${
              held ? "bg-success/10 border-success/30" : "bg-paper-raised border-steel-line"
            }`}
          >
            <div className="flex items-center justify-between">
              <p className="font-medium text-sm">{c.name}</p>
              <span
                className={`tracked-label text-[10px] ${held ? "text-success" : "text-steel"}`}
              >
                {held ? "Certified" : "Not yet"}
              </span>
            </div>
            {c.description && <p className="text-xs text-steel mt-1">{c.description}</p>}
          </div>
        );
      })}
      {relevant.length === 0 && (
        <p className="text-sm text-steel">No certifications defined for your subteam yet.</p>
      )}
    </div>
  );
}

function ManageGrid() {
  const { profile, isCoach } = useAuth();
  const { users } = useUsers();
  const { certifications } = useCertifications();
  const [query, setQuery] = useState("");
  const [expandedUid, setExpandedUid] = useState<string | null>(null);

  const members = users
    .filter((u) => isCoach || (u.role !== "coach" && u.subteam === profile?.subteam))
    .filter((u) => u.displayName.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  if (certifications.length === 0) {
    return (
      <p className="text-sm text-steel">
        No certifications exist yet. {isCoach ? "Create some from Admin > Certifications." : "Ask your coach to add some."}
      </p>
    );
  }

  async function toggle(user: UserProfile, cert: Certification) {
    if (user.certificationIds.includes(cert.id)) {
      await revokeCertification(user.uid, cert.id);
    } else {
      await grantCertification(user.uid, cert.id);
    }
  }

  return (
    <div>
      <input
        className="input mb-3 max-w-xs"
        placeholder="Search team members…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="hidden max-h-[70dvh] overflow-auto rounded border border-steel-line bg-paper-raised lg:block">
        <table className="text-sm min-w-full">
          <thead className="bg-paper border-b border-steel-line sticky top-0 z-10">
            <tr>
              <th className="text-left px-3 py-2 tracked-label text-[10px] text-steel sticky left-0 bg-paper">
                Team member
              </th>
              {certifications.map((c) => (
                <th key={c.id} className="px-3 py-2 tracked-label text-[10px] text-steel whitespace-nowrap">
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((u) => (
              <tr key={u.uid} className="border-b border-steel-line last:border-0">
                <td className="px-3 py-2 sticky left-0 bg-paper-raised whitespace-nowrap">
                  <p className="font-medium">{u.displayName}</p>
                  <p className="text-[10px] text-steel">
                    {memberDetails(u)}
                  </p>
                </td>
                {certifications.map((c) => {
                  const held = u.certificationIds.includes(c.id);
                  return (
                    <td key={c.id} className="px-3 py-2 text-center">
                      <button
                        onClick={() => toggle(u, c)}
                        className={`w-6 h-6 rounded-sm border text-xs ${
                          held
                            ? "bg-success text-white border-success"
                            : "bg-surface text-steel border-steel-line hover:border-steel"
                        }`}
                        title={held ? `Revoke ${c.name}` : `Grant ${c.name}`}
                      >
                        {held ? "✓" : ""}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={certifications.length + 1} className="px-3 py-6 text-center text-steel text-sm">
                  No team members match &quot;{query}&quot;.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 lg:hidden">
        {members.map((member) => {
          const expanded = expandedUid === member.uid;
          return (
            <div key={member.uid} className="bg-paper-raised border border-steel-line rounded overflow-hidden">
              <button
                type="button"
                className="w-full flex items-center justify-between gap-3 p-3 text-left"
                onClick={() => setExpandedUid(expanded ? null : member.uid)}
                aria-expanded={expanded}
              >
                <span className="min-w-0">
                  <span className="block font-medium text-sm truncate">{member.displayName}</span>
                  <span className="block text-[10px] text-steel mt-0.5">{memberDetails(member)}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <span className="tracked-label text-[9px] text-steel">
                    {member.certificationIds.length} certified
                  </span>
                  <span className="text-blueprint" aria-hidden="true">{expanded ? "−" : "+"}</span>
                </span>
              </button>

              {expanded && (
                <div className="border-t border-steel-line p-3 space-y-2">
                  {certifications.map((certification) => {
                    const held = member.certificationIds.includes(certification.id);
                    return (
                      <button
                        type="button"
                        key={certification.id}
                        onClick={() => toggle(member, certification)}
                        className={`w-full flex items-start justify-between gap-3 rounded border p-2.5 text-left ${held
                          ? "border-success/40 bg-success/10"
                          : "border-steel-line bg-surface"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{certification.name}</span>
                          <span className="block text-[10px] text-steel mt-0.5">
                            {certification.subteam ? SUBTEAM_META[certification.subteam].label : "All subteams"}
                          </span>
                        </span>
                        <span className={`tracked-label text-[10px] shrink-0 ${held ? "text-success" : "text-steel"}`}>
                          {held ? "✓ Certified" : "Not certified"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {members.length === 0 && (
          <p className="text-sm text-steel text-center py-6">No team members match &quot;{query}&quot;.</p>
        )}
      </div>
    </div>
  );
}

function memberDetails(user: UserProfile) {
  const role = user.role === "coach" ? "Coach" : user.role === "student_leader" ? "Student leader" : "Student";
  return user.subteam ? `${role} · ${SUBTEAM_META[user.subteam].label}` : role;
}
