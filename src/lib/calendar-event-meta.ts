import type { CalendarEventCategory } from "@/types";

export const CALENDAR_EVENT_CATEGORIES: CalendarEventCategory[] = [
  "outreach",
  "competition",
  "deadline",
  "meeting",
  "other",
];

export const CALENDAR_EVENT_META: Record<
  CalendarEventCategory,
  { label: string; color: string }
> = {
  outreach: { label: "Outreach", color: "var(--outreach)" },
  competition: { label: "Competition", color: "var(--blueprint)" },
  deadline: { label: "Deadline", color: "var(--danger)" },
  meeting: { label: "Meeting", color: "var(--cad)" },
  other: { label: "Other", color: "var(--steel)" },
};
