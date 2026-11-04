import type { CalendarEvent } from "@/types";
import { deleteD1CalendarEvent, fetchCalendarEvents, saveCalendarEvent } from "@/lib/operations-api";

type CalendarEventInput = Omit<
  CalendarEvent,
  "id" | "createdByUid" | "createdAt" | "updatedAt"
>;

export async function createCalendarEvent(input: CalendarEventInput, createdByUid: string) {
  const now = new Date().toISOString();
  const event: CalendarEvent = {
    ...input,
    id: crypto.randomUUID(),
    createdByUid,
    createdAt: now,
    updatedAt: now,
  };
  return saveCalendarEvent(event, true);
}

export async function updateCalendarEvent(
  eventId: string,
  changes: Partial<CalendarEventInput>
) {
  const current = (await fetchCalendarEvents()).find((event) => event.id === eventId);
  if (!current) throw new Error("Calendar event not found.");
  await saveCalendarEvent({ ...current, ...changes, updatedAt: new Date().toISOString() }, false);
}

export async function deleteCalendarEvent(eventId: string) {
  return deleteD1CalendarEvent(eventId);
}
