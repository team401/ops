"use client";

import { useState } from "react";
import { Search, X } from "lucide-react";
import { ModalBackdrop } from "@/components/modal-backdrop";
import { useAuth } from "@/context/auth-context";
import { useUsers } from "@/lib/hooks";

export function SimulationDialog({ onClose }: { onClose: () => void }) {
  const { users, loading } = useUsers();
  const { actualProfile, startSimulation } = useAuth();
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const candidates = users
    .filter((user) => user.uid !== actualProfile?.uid)
    .filter((user) => !normalizedQuery || `${user.displayName} ${user.email} ${user.role} ${user.subteam ?? ""}`.toLowerCase().includes(normalizedQuery))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return (
    <ModalBackdrop onClose={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="simulation-title" className="w-full max-w-lg rounded-lg border border-steel-line bg-paper-raised p-4 text-ink shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="simulation-title" className="text-lg font-bold">Simulate another user</h2>
            <p className="mt-1 text-sm text-steel">Preview navigation, permissions, and task visibility as a team member. Your real coach login stays active, and any actions still run as you.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close simulation picker" className="flex min-h-9 min-w-9 items-center justify-center rounded hover:bg-blueprint/10"><X size={18} /></button>
        </div>
        <label className="relative mt-4 block">
          <Search aria-hidden="true" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-steel" />
          <span className="sr-only">Search team members</span>
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search members…" className="h-10 w-full rounded border border-steel-line bg-paper pl-9 pr-3 text-sm outline-none focus:border-blueprint focus:ring-2 focus:ring-blueprint/20" />
        </label>
        <div className="mt-3 max-h-[55dvh] space-y-1 overflow-y-auto">
          {loading && <p className="p-4 text-center text-sm text-steel">Loading members…</p>}
          {!loading && candidates.map((user) => (
            <button key={user.uid} type="button" onClick={() => { startSimulation(user.uid); onClose(); }} className="flex w-full items-center justify-between gap-3 rounded-md border border-transparent px-3 py-2.5 text-left hover:border-steel-line hover:bg-blueprint/10">
              <span className="min-w-0"><span className="block truncate font-semibold">{user.displayName}</span><span className="block truncate text-xs text-steel">{user.email}</span></span>
              <span className="shrink-0 text-right text-xs capitalize text-steel">{user.role.replace("_", " ")}{user.subteam ? <><br />{user.subteam}</> : null}</span>
            </button>
          ))}
          {!loading && candidates.length === 0 && <p className="p-4 text-center text-sm text-steel">No team members match that search.</p>}
        </div>
      </section>
    </ModalBackdrop>
  );
}

