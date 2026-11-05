"use strict";

self.addEventListener("push", function (event) {
  var notification = { title: "401 Ops", body: "You have a new task update." };
  if (event.data) {
    try {
      notification = event.data.json();
    } catch {
      notification.body = event.data.text();
    }
  }
  event.waitUntil(self.registration.showNotification(notification.title || "401 Ops", {
    body: notification.body || "Open Ops to see the update.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: notification.taskId ? "task-" + notification.taskId : "ops-notification",
    data: { url: "/board" },
  }));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (windows) {
    var existing = windows.find(function (windowClient) { return "focus" in windowClient; });
    var targetUrl = event.notification.data && event.notification.data.url ? event.notification.data.url : "/board";
    return existing ? existing.focus() : self.clients.openWindow(targetUrl);
  }));
});
