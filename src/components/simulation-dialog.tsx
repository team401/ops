"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Input, Spinner } from "@team401/web-ui";
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
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Simulate another user</DialogTitle>
          <DialogDescription>Preview navigation, permissions, and task visibility as a team member. Your real coach login stays active, and any actions still run as you.</DialogDescription>
        </DialogHeader>
        <label className="relative mt-4 block">
          <Search aria-hidden="true" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-steel" />
          <span className="sr-only">Search team members</span>
          <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search members…" className="pl-9" />
        </label>
        <div className="mt-3 max-h-[55dvh] space-y-1 overflow-y-auto">
          {loading && <p className="flex items-center justify-center gap-2 p-4 text-center text-sm text-steel"><Spinner size="sm" /> Loading members…</p>}
          {!loading && candidates.map((user) => (
            <Button key={user.uid} type="button" variant="ghost" onClick={() => { startSimulation(user.uid); onClose(); }} className="flex h-auto w-full items-center justify-between gap-3 px-3 py-2.5 text-left whitespace-normal">
              <span className="min-w-0"><span className="block truncate font-semibold">{user.displayName}</span><span className="block truncate text-xs text-steel">{user.email}</span></span>
              <span className="shrink-0 text-right text-xs capitalize text-steel">{user.role.replace("_", " ")}{user.subteam ? <><br />{user.subteam}</> : null}</span>
            </Button>
          ))}
          {!loading && candidates.length === 0 && <p className="p-4 text-center text-sm text-steel">No team members match that search.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

