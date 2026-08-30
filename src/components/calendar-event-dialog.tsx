"use client";

import { useState, type FormEvent } from "react";
import { ModalBackdrop } from "@/components/modal-backdrop";
import { useAuth } from "@/context/auth-context";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  updateCalendarEvent,
} from "@/lib/calendar-event-actions";
import {
  CALENDAR_EVENT_CATEGORIES,
  CALENDAR_EVENT_META,
} from "@/lib/calendar-event-meta";
import type { CalendarEvent, CalendarEventCategory } from "@/types";

interface CalendarEventDialogProps {
  mode: "create" | "edit";
  event?: CalendarEvent;
  defaultDate?: string;
  canManage: boolean;
  onClose: () => void;
}

export function CalendarEventDialog({
  mode,
  event,
  defaultDate,
  canManage,
  onClose,
}: CalendarEventDialogProps) {
  const { profile } = useAuth();
  const initialDate = event?.startDate ?? defaultDate ?? new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState(event?.title ?? "");
  const [category, setCategory] = useState<CalendarEventCategory>(event?.category ?? "other");
  const [startDate, setStartDate] = useState(initialDate);
  const [endDate, setEndDate] = useState(event?.endDate ?? initialDate);
  const [location, setLocation] = useState(event?.location ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const readOnly = mode === "edit" && !canManage;

  function handleStartDate(nextDate: string) {
    setStartDate(nextDate);
    if (!endDate || endDate < nextDate) setEndDate(nextDate);
  }

  async function handleSubmit(submitEvent: FormEvent) {
    submitEvent.preventDefault();
    if (!profile || readOnly) return;
    if (!title.trim()) {
      setError("Enter an event title.");
      return;
    }
    if (!startDate || !endDate) {
      setError("Choose a start and end date.");
      return;
    }
    if (endDate < startDate) {
      setError("The end date cannot be before the start date.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const values = {
        title: title.trim(),
        category,
        startDate,
        endDate,
        location: location.trim(),
        description: description.trim(),
      };
      if (mode === "create") {
        await createCalendarEvent(values, profile.uid);
      } else if (event) {
        await updateCalendarEvent(event.id, values);
      }
      onClose();
    } catch (submitError) {
      console.error(submitError);
      setError("The calendar event could not be saved. Check your connection and try again.");
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!event || !canManage) return;
    setSubmitting(true);
    setError(null);
    try {
      await deleteCalendarEvent(event.id);
      onClose();
    } catch (deleteError) {
      console.error(deleteError);
      setError("The calendar event could not be deleted. Try again.");
      setSubmitting(false);
      setConfirmingDelete(false);
    }
  }

  const meta = CALENDAR_EVENT_META[category];

  return (
    <ModalBackdrop onClose={onClose}>
      <div
        className="max-h-[calc(100dvh-1rem)] w-full max-w-xl overflow-y-auto rounded border border-steel-line bg-paper-raised shadow-xl sm:max-h-[calc(100dvh-2rem)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-event-dialog-title"
      >
        <div className="flex items-start justify-between gap-4 border-b border-steel-line px-5 py-4">
          <div>
            <p className="tracked-label text-[10px] font-bold" style={{ color: meta.color }}>
              {mode === "create" ? "New calendar entry" : meta.label}
            </p>
            <h2 id="calendar-event-dialog-title" className="mt-1 text-lg font-semibold">
              {mode === "create" ? "Add event" : event?.title}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="text-xl leading-none text-steel hover:text-ink" aria-label="Close">
            ×
          </button>
        </div>

        {readOnly ? (
          <div className="space-y-4 p-5 text-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <Detail label="Dates" value={formatEventDates(event!)} />
              <Detail label="Location" value={event?.location || "Not specified"} />
            </div>
            {event?.description && <Detail label="Details" value={event.description} preserveLines />}
            <div className="flex justify-end border-t border-steel-line pt-4">
              <button type="button" onClick={onClose} className="btn-secondary">Close</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 p-5">
            <label className="block text-sm font-medium">
              Title
              <input
                className="input mt-1"
                value={title}
                onChange={(changeEvent) => setTitle(changeEvent.target.value)}
                maxLength={160}
                required
                autoFocus
                placeholder="e.g. FIRST Chesapeake District Championship"
              />
            </label>

            <label className="block text-sm font-medium">
              Type
              <select
                className="input mt-1"
                value={category}
                onChange={(changeEvent) => setCategory(changeEvent.target.value as CalendarEventCategory)}
              >
                {CALENDAR_EVENT_CATEGORIES.map((value) => (
                  <option key={value} value={value}>{CALENDAR_EVENT_META[value].label}</option>
                ))}
              </select>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Start date
                <input className="input mt-1" type="date" value={startDate} onChange={(changeEvent) => handleStartDate(changeEvent.target.value)} required />
              </label>
              <label className="block text-sm font-medium">
                End date
                <input className="input mt-1" type="date" value={endDate} min={startDate} onChange={(changeEvent) => setEndDate(changeEvent.target.value)} required />
              </label>
            </div>

            <label className="block text-sm font-medium">
              Location <span className="font-normal text-steel">(optional)</span>
              <input className="input mt-1" value={location} onChange={(changeEvent) => setLocation(changeEvent.target.value)} maxLength={200} placeholder="Venue, school, or address" />
            </label>

            <label className="block text-sm font-medium">
              Details <span className="font-normal text-steel">(optional)</span>
              <textarea className="input mt-1 min-h-28 resize-y" value={description} onChange={(changeEvent) => setDescription(changeEvent.target.value)} maxLength={2000} placeholder="Schedule, arrival instructions, registration notes, or anything else the team should know" />
            </label>

            {error && <p className="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-steel-line pt-4">
              <div>
                {mode === "edit" && !confirmingDelete && (
                  <button type="button" onClick={() => setConfirmingDelete(true)} className="text-sm font-medium text-danger hover:underline">
                    Delete event
                  </button>
                )}
                {mode === "edit" && confirmingDelete && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-danger">Delete permanently?</span>
                    <button type="button" onClick={handleDelete} disabled={submitting} className="btn-danger px-3 py-1.5 text-xs">Delete</button>
                    <button type="button" onClick={() => setConfirmingDelete(false)} className="text-xs text-steel hover:text-ink">Cancel</button>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="btn-secondary" disabled={submitting}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? "Saving…" : mode === "create" ? "Add event" : "Save changes"}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </ModalBackdrop>
  );
}

function Detail({ label, value, preserveLines = false }: { label: string; value: string; preserveLines?: boolean }) {
  return (
    <div>
      <p className="tracked-label text-[10px] text-steel">{label}</p>
      <p className={`mt-1 text-ink ${preserveLines ? "whitespace-pre-wrap" : ""}`}>{value}</p>
    </div>
  );
}

function formatEventDates(event: CalendarEvent) {
  const start = formatDate(event.startDate);
  return event.endDate === event.startDate ? start : `${start} – ${formatDate(event.endDate)}`;
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
