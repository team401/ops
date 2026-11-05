"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bell, X } from "lucide-react";
import { dismissAllNotifications, dismissNotification, fetchNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/notification-api";
import type { OpsNotification } from "@/types";

export function NotificationMenu() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<OpsNotification[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);
  const unread = useMemo(() => notifications.filter((notification) => !notification.readAt).length, [notifications]);

  useEffect(() => {
    let active = true;
    const load = () => fetchNotifications().then((records) => { if (active) setNotifications(records); }).catch(() => undefined);
    void load();
    const interval = window.setInterval(load, 30_000);
    window.addEventListener("focus", load);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener("focus", load); };
  }, []);

  useEffect(() => {
    if (!open) return;
    function closeMenu(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  async function readAll() {
    await markAllNotificationsRead();
    const now = new Date().toISOString();
    setNotifications((current) => current.map((notification) => ({ ...notification, readAt: notification.readAt ?? now })));
  }

  function readOne(notification: OpsNotification) {
    setOpen(false);
    if (notification.readAt) return;
    const now = new Date().toISOString();
    setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, readAt: now } : item));
    void markNotificationRead(notification.id);
  }

  function dismiss(id: string) {
    setNotifications((current) => current.filter((notification) => notification.id !== id));
    void dismissNotification(id).catch(() => fetchNotifications().then(setNotifications));
  }

  function dismissAll() {
    const previous = notifications;
    setNotifications([]);
    void dismissAllNotifications().catch(() => setNotifications(previous));
  }

  return <div ref={menuRef} className="relative">
    <button type="button" onClick={() => setOpen((value) => !value)} className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-white/30 bg-white/10 text-white hover:bg-white/15" aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"} aria-expanded={open}>
      <Bell size={16} />
      {unread > 0 && <span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-hazard px-1 text-[9px] font-bold text-[#14181c]">{unread > 9 ? "9+" : unread}</span>}
    </button>
    {open && <section className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(24rem,calc(100vw-1rem))] overflow-hidden rounded-lg border border-steel-line bg-paper-raised text-ink shadow-xl">
      <div className="flex items-center justify-between gap-3 border-b border-steel-line px-3 py-2.5"><h2 className="text-sm font-semibold">Notifications</h2>{notifications.length > 0 && <div className="flex items-center gap-3">{unread > 0 && <button type="button" onClick={readAll} className="text-xs font-medium text-blueprint hover:underline">Mark all read</button>}<button type="button" onClick={dismissAll} className="text-xs font-medium text-danger hover:underline">Delete all</button></div>}</div>
      <div className="max-h-[min(28rem,65dvh)] overflow-y-auto">
        {notifications.map((notification) => <div key={notification.id} className={`relative border-b border-steel-line last:border-b-0 ${notification.readAt ? "" : "bg-blueprint/5"}`}>
          <Link href="/board" onClick={() => readOne(notification)} className="block py-3 pl-3 pr-10 hover:bg-blueprint/8">
            <span className="flex items-start gap-2"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.readAt ? "bg-transparent" : "bg-blueprint"}`} /><span className="min-w-0"><span className="block text-sm font-semibold">{notification.title}</span><span className="mt-0.5 block whitespace-normal text-xs text-steel">{notification.body}</span><span className="mt-1 block text-[10px] text-steel">{new Date(notification.createdAt).toLocaleString()}</span></span></span>
          </Link>
          <button type="button" onClick={() => dismiss(notification.id)} aria-label={`Dismiss ${notification.title}`} className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded text-steel hover:bg-danger/10 hover:text-danger"><X size={14} /></button>
        </div>)}
        {notifications.length === 0 && <p className="px-4 py-8 text-center text-sm text-steel">No notifications yet.</p>}
      </div>
    </section>}
  </div>;
}
