import type { Task, UserProfile } from "@/types";

export function taskMatchesSearch(task: Task, users: UserProfile[], rawQuery: string) {
  const query = rawQuery.trim().toLocaleLowerCase();
  if (!query) return true;
  const assignees = users
    .filter((user) => task.assigneeUids.includes(user.uid))
    .map((user) => user.displayName);
  return [
    task.title,
    task.description,
    task.blockedDetails,
    ...assignees,
    ...(task.comments ?? []).map((comment) => comment.body),
    ...(task.links ?? []).flatMap((link) => [link.label, link.url]),
  ].some((value) => value.toLocaleLowerCase().includes(query));
}
