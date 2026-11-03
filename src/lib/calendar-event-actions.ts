import { collection, deleteDoc, doc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { CalendarEvent } from "@/types";
import { deleteD1CalendarEvent, fetchCalendarEvents, operationsUseD1, saveCalendarEvent } from "@/lib/operations-api";

type CalendarEventInput = Omit<
  CalendarEvent,
  "id" | "createdByUid" | "createdAt" | "updatedAt"
>;

export async function createCalendarEvent(input: CalendarEventInput, createdByUid: string) {
  const ref = doc(collection(db, "calendarEvents"));
  const now = new Date().toISOString();
  const event: CalendarEvent = {
    ...input,
    id: ref.id,
    createdByUid,
    createdAt: now,
    updatedAt: now,
  };
  if (operationsUseD1()) return saveCalendarEvent(event, true);
  await setDoc(ref, event);
  return event;
}

export async function updateCalendarEvent(
  eventId: string,
  changes: Partial<CalendarEventInput>
) {
  if (operationsUseD1()) {
    const current = (await fetchCalendarEvents()).find((event) => event.id === eventId);
    if (!current) throw new Error("Calendar event not found.");
    await saveCalendarEvent({ ...current, ...changes }, false);
    return;
  }
  await updateDoc(doc(db, "calendarEvents", eventId), {
    ...changes,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteCalendarEvent(eventId: string) {
  if (operationsUseD1()) return deleteD1CalendarEvent(eventId);
  await deleteDoc(doc(db, "calendarEvents", eventId));
}
