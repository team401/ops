import { collection, deleteDoc, doc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { CalendarEvent } from "@/types";

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
  await setDoc(ref, event);
  return event;
}

export async function updateCalendarEvent(
  eventId: string,
  changes: Partial<CalendarEventInput>
) {
  await updateDoc(doc(db, "calendarEvents", eventId), {
    ...changes,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteCalendarEvent(eventId: string) {
  await deleteDoc(doc(db, "calendarEvents", eventId));
}
