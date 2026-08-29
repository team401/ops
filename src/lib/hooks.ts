"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Task, UserProfile, Certification, TimeEntry, TimeclockPin, InventoryItem } from "@/types";

// These use onSnapshot directly (rather than one-shot fetches) so that when
// one student drags a card, or a coach edits a cert, every open board
// updates live without a manual refresh.

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "tasks"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setTasks(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            ...data,
            assigneeUids: data.assigneeUids ?? [],
            history: data.history ?? [],
            pointOfContactUid: data.pointOfContactUid ?? data.createdByUid,
            blockedReason: data.blockedReason ?? null,
            blockedDetails: data.blockedDetails ?? "",
            prerequisiteTaskIds: data.prerequisiteTaskIds ?? [],
            comments: data.comments ?? [],
            attachments: data.attachments ?? [],
          } as Task;
        })
      );
      setLoading(false);
    });
    return unsub;
  }, []);

  return { tasks, loading };
}

export function useUsers() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
    const unsub = onSnapshot(collection(db, "certifications"), (snap) => {
      setCertifications(snap.docs.map((d) => d.data() as Certification));
      setLoading(false);
    });
    return unsub;
  }, []);

  return { certifications, loading };
}

// null means all entries (coach); a uid means only that person's entries;
// undefined waits for the auth profile before opening a Firestore listener.
export function useTimeEntries(scopeUid: string | null | undefined) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (scopeUid === undefined) return;
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
