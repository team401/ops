"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/auth-context";
import { certificationsUseD1, fetchCertifications } from "@/lib/certification-api";
import { fetchCalendarEvents, fetchTimeEntries, fetchTimeclockPins, operationsUseD1 } from "@/lib/operations-api";
import { coreUsesD1, fetchTasks, fetchUsers } from "@/lib/core-api";
import type { Task, UserProfile, Certification, TimeEntry, TimeclockPin, InventoryItem, CalendarEvent } from "@/types";

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
    if (coreUsesD1()) {
      let active = true;
      const load = () => fetchTasks().then((records) => { if (active) { setTasks(records.sort((a, b) => b.createdAt.localeCompare(a.createdAt))); setLoadedRole(role); } }).catch(console.error).finally(() => { if (active) setLoading(false); });
      void load(); const interval = window.setInterval(load, 20_000); window.addEventListener("ops:tasks-changed", load);
      return () => { active = false; window.clearInterval(interval); window.removeEventListener("ops:tasks-changed", load); };
    }
    const source = role === "student"
      ? query(collection(db, "tasks"), where("leadersOnly", "==", false))
      : collection(db, "tasks");
    const unsub = onSnapshot(source, (snap) => {
      setTasks(
        snap.docs
          .map((d) => {
            const data = d.data();
            return {
              ...data,
              leadersOnly: data.leadersOnly ?? false,
              assigneeUids: data.assigneeUids ?? [],
              history: data.history ?? [],
              pointOfContactUid: data.pointOfContactUid ?? data.createdByUid,
              blockedReason: data.blockedReason ?? null,
              blockedDetails: data.blockedDetails ?? "",
              prerequisiteTaskIds: data.prerequisiteTaskIds ?? [],
              comments: data.comments ?? [],
              attachments: data.attachments ?? [],
              links: data.links ?? [],
              order: data.order ?? new Date(data.createdAt).getTime(),
              archived: data.archived ?? false,
              archivedAt: data.archivedAt ?? null,
              archivedByUid: data.archivedByUid ?? null,
            } as Task;
          })
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      );
      setLoadedRole(role);
      setLoading(false);
    });
    return unsub;
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
    if (coreUsesD1()) {
      let active = true;
      const load = () => fetchUsers().then((records) => { if (active) setUsers(records); }).catch(console.error).finally(() => { if (active) setLoading(false); });
      void load(); const interval = window.setInterval(load, 60_000); window.addEventListener("ops:users-changed", load);
      return () => { active = false; window.clearInterval(interval); window.removeEventListener("ops:users-changed", load); };
    }
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      setUsers(snap.docs.map((d) => d.data() as UserProfile));
      setLoading(false);
    });
    return unsub;
  }, []);

  return { users, loading };
}

export function useCertifications() {
  const [certifications, setCertifications] = useState<Certification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (certificationsUseD1()) {
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
    }
    const unsub = onSnapshot(collection(db, "certifications"), (snap) => {
      setCertifications(snap.docs.map((d) => d.data() as Certification));
      setLoading(false);
    });
    return unsub;
  }, []);

  return { certifications, loading };
}

export function useCalendarEvents() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (operationsUseD1()) {
      let active = true;
      const load = () => fetchCalendarEvents().then((records) => { if (active) setEvents(records); }).catch(console.error).finally(() => { if (active) setLoading(false); });
      void load();
      const interval = window.setInterval(load, 60_000);
      window.addEventListener("ops:calendar-changed", load);
      return () => { active = false; window.clearInterval(interval); window.removeEventListener("ops:calendar-changed", load); };
    }
    const source = query(collection(db, "calendarEvents"), orderBy("startDate", "asc"));
    return onSnapshot(source, (snapshot) => {
      setEvents(snapshot.docs.map((record) => record.data() as CalendarEvent));
      setLoading(false);
    });
  }, []);

  return { events, loading };
}

// null means all entries (coach); a uid means only that person's entries;
// undefined waits for the auth profile before opening a Firestore listener.
export function useTimeEntries(scopeUid: string | null | undefined) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (scopeUid === undefined) return;
    if (operationsUseD1()) {
      let active = true;
      const load = () => fetchTimeEntries(scopeUid === null).then((records) => { if (active) setEntries(records.sort((a, b) => b.clockIn.localeCompare(a.clockIn))); }).catch(console.error).finally(() => { if (active) setLoading(false); });
      void load();
      const interval = window.setInterval(load, 30_000);
      window.addEventListener("ops:time-changed", load);
      return () => { active = false; window.clearInterval(interval); window.removeEventListener("ops:time-changed", load); };
    }
    const source = scopeUid
      ? query(collection(db, "timeEntries"), where("uid", "==", scopeUid))
      : collection(db, "timeEntries");
    const unsub = onSnapshot(source, (snap) => {
      setEntries(
        snap.docs
          .map((entry) => entry.data() as TimeEntry)
          .sort((a, b) => b.clockIn.localeCompare(a.clockIn))
      );
      setLoading(false);
    });
    return unsub;
  }, [scopeUid]);

  return { entries, loading };
}

export function useTimeclockPins(enabled: boolean) {
  const [pins, setPins] = useState<TimeclockPin[]>([]);

  useEffect(() => {
    if (!enabled) return;
    if (operationsUseD1()) {
      let active = true;
      const load = () => fetchTimeclockPins().then((records) => { if (active) setPins(records); }).catch(console.error);
      void load();
      window.addEventListener("ops:pins-changed", load);
      return () => { active = false; window.removeEventListener("ops:pins-changed", load); };
    }
    return onSnapshot(collection(db, "timeclockPins"), (snap) => {
      setPins(snap.docs.map((pin) => pin.data() as TimeclockPin));
    });
  }, [enabled]);

  return { pins: enabled ? pins : [] };
}

export function useInventory() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const source = query(collection(db, "inventory"), orderBy("updatedAt", "desc"));
    return onSnapshot(
      source,
      (snapshot) => {
        setItems(
          snapshot.docs.map((record) => {
            const data = record.data();
            return {
              ...data,
              id: record.id,
              quantity: data.quantity ?? 0,
              minimumQuantity: data.minimumQuantity ?? 0,
              location: data.location ?? "",
              manufacturer: data.manufacturer ?? "",
              partNumber: data.partNumber ?? "",
              vendorUrl: data.vendorUrl ?? "",
              notes: data.notes ?? "",
              specs: data.specs ?? {},
              createdAt: data.createdAt?.toDate?.() ?? null,
              updatedAt: data.updatedAt?.toDate?.() ?? null,
            } as InventoryItem;
          }),
        );
        setError(null);
        setLoading(false);
      },
      (snapshotError) => {
        console.error(snapshotError);
        setError("Inventory could not be loaded. Check that the latest Firestore rules are deployed.");
        setLoading(false);
      },
    );
  }, []);

  return { items, loading, error };
}
