// Core domain types for the Team 401 operations hub.

export type Role = "coach" | "student_leader" | "student";

export type Subteam =
  | "mechanical"
  | "electrical"
  | "programming"
  | "cad"
  | "outreach"
  | "finance";

export const SUBTEAMS: Subteam[] = [
  "mechanical",
  "electrical",
  "programming",
  "cad",
  "outreach",
  "finance",
];

export type TaskStatus = "backlog" | "in_progress" | "blocked" | "review" | "done";

export const TASK_STATUSES: TaskStatus[] = [
  "backlog",
  "in_progress",
  "blocked",
  "review",
  "done",
];

export type Priority = "low" | "medium" | "high";

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  role: Role;
  subteam: Subteam | null;
  certificationIds: string[];
  createdAt: string;
  mustResetPassword: boolean;
}

export interface Certification {
  id: string;
  name: string;
  description: string;
  subteam: Subteam | null;
}

export type TaskHistoryEventType = "assigned" | "unassigned" | "completed";

export interface TaskHistoryEntry {
  type: TaskHistoryEventType;
  uid: string;
  at: string;
}

export type BlockedReason = "parts" | "information" | "approval" | "prerequisite" | "other";

export interface TaskComment {
  id: string;
  body: string;
  authorUid: string;
  createdAt: string;
}

export interface TaskAttachment {
  id: string;
  name: string;
  url: string;
  storagePath: string;
  storageProvider: "r2";
  contentType: string;
  size: number;
  uploadedByUid: string;
  createdAt: string;
}

export interface TaskLink {
  id: string;
  label: string;
  url: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  leadersOnly: boolean;
  subteam: Subteam;
  status: TaskStatus;
  priority: Priority;
  requiredCertificationIds: string[];
  requireAllCertifications: boolean;
  assigneeUids: string[];
  createdByUid: string;
  pointOfContactUid: string;
  blockedReason: BlockedReason | null;
  blockedDetails: string;
  prerequisiteTaskIds: string[];
  comments: TaskComment[];
  attachments: TaskAttachment[];
  links: TaskLink[];
  order: number;
  archived: boolean;
  archivedAt: string | null;
  archivedByUid: string | null;
  createdAt: string;
  updatedAt: string;
  dueDate: string | null;
  history: TaskHistoryEntry[];
}

export type CalendarEventCategory =
  | "outreach"
  | "competition"
  | "deadline"
  | "meeting"
  | "other";

export type CalendarEventRecurrence = "none" | "weekly" | "monthly" | "yearly";

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  category: CalendarEventCategory;
  startDate: string;
  endDate: string;
  location: string;
  recurrence: CalendarEventRecurrence;
  recurrenceUntil: string | null;
  createdByUid: string;
  createdAt: string;
  updatedAt: string;
}

export interface OpsNotification {
  id: string;
  type: "assignment" | "comment" | "status" | string;
  title: string;
  body: string;
  taskId: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationPreferences {
  inAppEnabled: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  vapidPublicKey: string | null;
}

export type TimeclockActivity = "shop" | "outreach";

export interface TimeEntry {
  id: string;
  uid: string;
  activity: TimeclockActivity;
  activityName: string;
  clockIn: string;
  clockOut: string | null;
  clockedInByUid: string;
  clockedOutByUid: string | null;
}

export interface TimeclockPin {
  uid: string;
  pin: string;
  updatedAt: string;
}
