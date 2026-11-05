self.addEventListener("push", (event) => {
  const notification = event.data ? event.data.json() : { title: "401 Ops", body: "You have a new task update." };
  event.waitUntil(self.registration.showNotification(notification.title || "401 Ops", {
    body: notification.body || "Open Ops to see the update.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: notification.taskId ? `task-${notification.taskId}` : "ops-notification",
    data: { url: "/board" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((windowClient) => "focus" in windowClient);
    return existing ? existing.focus() : clients.openWindow(event.notification.data?.url || "/board");
  }));
});
