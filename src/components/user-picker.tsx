"use client";

import { useState, useRef, useEffect } from "react";
import type { UserProfile } from "@/types";

interface UserPickerProps {
  users: UserProfile[];
  selectedUids: string[];
  onChange: (uids: string[]) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function UserPicker({
  users,
  selectedUids,
  onChange,
  disabled,
  placeholder = "Search by name…",
}: UserPickerProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedUsers = users.filter((u) => selectedUids.includes(u.uid));
  const matches = users
    .filter((u) => !selectedUids.includes(u.uid))
    .filter((u) => u.displayName.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  function add(uid: string) {
    onChange([...selectedUids, uid]);
    setQuery("");
  }

  function remove(uid: string) {
    onChange(selectedUids.filter((u) => u !== uid));
  }

  return (
    <div ref={containerRef} className="relative">
      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {selectedUsers.map((u) => (
            <span
              key={u.uid}
              className="text-xs pl-2 pr-1 py-1 rounded-sm bg-blueprint text-white flex items-center gap-1"
            >
              {u.displayName}
              {u.role === "coach" && " (coach)"}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(u.uid)}
                  className="hover:bg-white/20 rounded-sm w-4 h-4 flex items-center justify-center"
                  aria-label={`Remove ${u.displayName}`}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {!disabled && (
        <>
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
          />
          {open && matches.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded border border-steel-line bg-surface shadow-md">
              {matches.map((u) => (
                <button
                  type="button"
                  key={u.uid}
                  onClick={() => add(u.uid)}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-blueprint/10 flex items-center justify-between"
                >
                  <span>{u.displayName}</span>
                  <span className="tracked-label text-[9px] text-steel">
                    {u.role === "coach" ? "coach" : u.role === "student_leader" ? "student leader" : "student"}
                  </span>
                </button>
              ))}
            </div>
          )}
          {open && query && matches.length === 0 && (
            <div className="absolute z-10 mt-1 w-full bg-surface border border-steel-line rounded shadow-md px-3 py-1.5 text-xs text-steel">
              No matches
            </div>
          )}
        </>
      )}
    </div>
  );
}
