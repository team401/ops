"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { fetchCertifications } from "@/lib/certification-api";
import { fetchCalendarEvents, fetchTimeEntries, fetchTimeclockPins } from "@/lib/operations-api";
import { fetchTasks, fetchUsers } from "@/lib/core-api";
import type { Task, UserProfile, Certification, TimeEntry, TimeclockPin, CalendarEvent } from "@/types";

// These use onSnapshot directly (rather than one-shot fetches) so that when
// one student drags a card, or a coach edits a cert, every open board
// updates live without a manual refresh.

export function useTasks() {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedRole, setLoadedRole] = useState<UserProfile["role"] | undefined>();
  const role = profile?.role;

  useEffect(() => {
    if (!role) return;
    let active = true;
    const load = () => fetchTasks().then((records) => { if (active) { setTasks(records.sort((a, b) => b.createdAt.localeCompare(a.createdAt))); setLoadedRole(role); } }).catch(console.error).finally(() => { if (active) setLoading(false); });
    void load(); const interval = window.setInterval(load, 20_000); window.addEventListener("ops:tasks-changed", load);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener("ops:tasks-changed", load); };
  }, [role]);

  return {
    tasks: loadedRole === role ? tasks : [],
    loading: loading || loadedRole !== role,
  };
}

export function useUsers() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = () => fetchUsers().then((records) => { if (active) setUsers(records); }).catch(console.error).finally(() => { if (active) setLoading(false); });
    void load(); const interval = window.setInterval(load, 60_000); window.addEventListener("ops:users-changed", load);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener("ops:users-changed", load); };
  }, []);

  return { users, loading };
}

export function useCertifications() {
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = () => fetchCertifications().then((records) => {
      if (active) setCertifications(records);
    }).catch((error) => {
      console.error("Could not load certifications from D1", error);
    }).finally(() => { if (active) setLoading(false); });
    void load();
    const interval = window.setInterval(load, 60_000);
    const handleFocus = () => { void load(); };
    window.addEventListener("focus", handleFocus);
    window.addEventListener("ops:certifications-changed", handleFocus);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("ops:certifications-changed", handleFocus);
    };
  }, []);

  return { certifications, loading };
}

export function useCalendarEvents() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = () => fetchCalendarEvents().then((records) => { if (active) setEvents(records); }).catch(console.error).finally(() => { if (active) setLoading(false); });
    void load();
    const interval = window.setInterval(load, 60_000);
    window.addEventListener("ops:calendar-changed", load);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener("ops:calendar-changed", load); };
  }, []);

  return { events, loading };
}

// null means all entries (coach); a uid means only that person's entries;
// undefined waits for the auth profile before loading entries.
export function useTimeEntries(scopeUid: string | null | undefined) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (scopeUid === undefined) return;
    let active = true;
    const load = () => fetchTimeEntries(scopeUid === null).then((records) => { if (active) setEntries(records.sort((a, b) => b.clockIn.localeCompare(a.clockIn))); }).catch(console.error).finally(() => { if (active) setLoading(false); });
    void load();
    const interval = window.setInterval(load, 30_000);
    window.addEventListener("ops:time-changed", load);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener("ops:time-changed", load); };
  }, [scopeUid]);

  return { entries, loading };
}

export function useTimeclockPins(enabled: boolean) {
  const [pins, setPins] = useState<TimeclockPin[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const load = () => fetchTimeclockPins().then((records) => { if (active) setPins(records); }).catch(console.error);
    void load();
    window.addEventListener("ops:pins-changed", load);
    return () => { active = false; window.removeEventListener("ops:pins-changed", load); };
  }, [enabled]);

  return { pins: enabled ? pins : [] };
}
