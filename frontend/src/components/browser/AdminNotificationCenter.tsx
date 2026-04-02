import React from "react";
import { ArrowLeft, BellRing, LifeBuoy, ShieldAlert, X } from "lucide-react";

import type { AdminNotification } from "@/types/browser";

interface AdminNotificationCenterProps {
  notifications: AdminNotification[];
  onSetNotificationRead: (id: string, read: boolean) => Promise<void> | void;
  onOpenAdminTarget: (notification: AdminNotification) => void;
  onBack?: () => void;
  onClose: () => void;
}

function formatTime(timestamp: number) {
  const delta = Date.now() - timestamp;
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.max(1, Math.round(delta / 60_000))}m ago`;
  if (delta < 86_400_000) return `${Math.max(1, Math.round(delta / 3_600_000))}h ago`;
  return `${Math.max(1, Math.round(delta / 86_400_000))}d ago`;
}

export const AdminNotificationCenter: React.FC<AdminNotificationCenterProps> = ({
  notifications,
  onSetNotificationRead,
  onOpenAdminTarget,
  onBack,
  onClose,
}) => (
  <div className="fixed inset-0 z-[281] bg-background/92 backdrop-blur-sm">
    <div className="flex h-full flex-col p-4">
      <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-8 py-5">
          <div>
            <div className="flex items-center gap-3">
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:border-primary/40 hover:bg-background"
                >
                  <span className="inline-flex items-center gap-1">
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </span>
                </button>
              ) : null}
              <div className="flex items-center gap-2 text-xl font-semibold">
                <BellRing className="h-5 w-5 text-primary" />
                Admin Notification Center
              </div>
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              Ticket openings, ticket replies, and flagged or blocked activity that needs staff attention.
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 transition-colors hover:bg-chrome-hover"
            title="Close admin notifications"
            aria-label="Close admin notifications"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
          {notifications.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
              No admin notifications right now.
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`rounded-2xl border px-5 py-4 transition-colors ${
                    notification.unread
                      ? "border-primary/30 bg-primary/5"
                      : "border-border bg-background/50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      {notification.kind === "ticket-opened" || notification.kind === "ticket-replied" ? (
                        <LifeBuoy className="h-4 w-4" />
                      ) : (
                        <ShieldAlert className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold">{notification.title}</div>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          {notification.kind.startsWith("ticket") ? "Tickets" : "Filters"}
                        </span>
                        {notification.unread ? (
                          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            Unread
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-sm text-foreground/90">{notification.message}</div>
                      <div className="mt-2 text-[11px] text-muted-foreground">
                        {formatTime(notification.created_at)}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenAdminTarget(notification)}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:border-primary/40 hover:bg-background"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => void onSetNotificationRead(notification.id, notification.unread)}
                        className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-chrome-hover hover:text-foreground"
                      >
                        {notification.unread ? "Mark read" : "Mark unread"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  </div>
);
