import React, { useMemo, useState } from "react";
import { ArrowLeft, Bell, LifeBuoy, ListFilter, MessageSquare, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { BrowserUser, InboxNotification, SupportTicket, WebsiteMessage } from "@/types/browser";

interface NotificationCenterProps {
  user: BrowserUser | null;
  activeTab: "all" | "alerts" | "nova" | "websites" | "tickets";
  notifications: InboxNotification[];
  websiteMessages: WebsiteMessage[];
  tickets: SupportTicket[];
  onTabChange: (tab: "all" | "alerts" | "nova" | "websites" | "tickets") => void;
  onSetNotificationRead: (id: string, read: boolean) => Promise<void>;
  onSetWebsiteMessageRead: (id: string, read: boolean) => void;
  onMarkAllInboxRead?: () => Promise<void>;
  onMarkAllWebsiteRead?: () => void;
  onMarkTicketRead: (ticketId: string) => Promise<void>;
  onOpenTicket: (ticketId: string) => void;
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

function inboxNotificationBadge(notification: InboxNotification) {
  return notification.target_user_id ? "User alert" : "Global alert";
}

function alertToneClasses(color: InboxNotification["color"], isRead: boolean) {
  const readState = isRead
    ? "border-border/80 bg-background/45"
    : "";
  switch (color) {
    case "red":
      return {
        card: `${readState || "border-red-500/35 bg-red-500/10"}`,
        badge: "bg-red-500/15 text-red-200",
        body: "bg-red-500/8 ring-red-500/20",
        title: "text-red-100",
      };
    case "orange":
      return {
        card: `${readState || "border-orange-500/35 bg-orange-500/10"}`,
        badge: "bg-orange-500/15 text-orange-200",
        body: "bg-orange-500/8 ring-orange-500/20",
        title: "text-orange-100",
      };
    case "green":
      return {
        card: `${readState || "border-emerald-500/35 bg-emerald-500/10"}`,
        badge: "bg-emerald-500/15 text-emerald-200",
        body: "bg-emerald-500/8 ring-emerald-500/20",
        title: "text-emerald-100",
      };
    case "purple":
      return {
        card: `${readState || "border-violet-500/35 bg-violet-500/10"}`,
        badge: "bg-violet-500/15 text-violet-200",
        body: "bg-violet-500/8 ring-violet-500/20",
        title: "text-violet-100",
      };
    case "cyan":
    default:
      return {
        card: `${readState || "border-cyan-500/35 bg-cyan-500/10"}`,
        badge: "bg-cyan-500/15 text-cyan-200",
        body: "bg-cyan-500/8 ring-cyan-500/20",
        title: "text-cyan-100",
      };
  }
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  user,
  activeTab,
  notifications,
  websiteMessages,
  tickets,
  onTabChange,
  onSetNotificationRead,
  onSetWebsiteMessageRead,
  onMarkAllInboxRead,
  onMarkAllWebsiteRead,
  onMarkTicketRead,
  onOpenTicket,
  onBack,
  onClose,
}) => {
  const [busy, setBusy] = useState<string | null>(null);

  const ticketUnreadCount = useMemo(
    () => tickets.filter((ticket) => ticket.unread).length,
    [tickets],
  );
  const alertUnreadCount = useMemo(
    () => notifications.filter((entry) => !entry.is_read).length,
    [notifications],
  );
  const ticketNotifications = useMemo(
    () =>
      [...tickets].sort((left, right) => {
        if (left.unread !== right.unread) return left.unread ? -1 : 1;
        return right.updated_at - left.updated_at;
      }),
    [tickets],
  );
  const novaMessages = useMemo(
    () => websiteMessages.filter((message) => message.tab_id === "system"),
    [websiteMessages],
  );
  const siteMessages = useMemo(
    () => websiteMessages.filter((message) => message.tab_id !== "system"),
    [websiteMessages],
  );
  const novaUnreadCount = useMemo(
    () => novaMessages.filter((entry) => !entry.is_read).length,
    [novaMessages],
  );
  const siteUnreadCount = useMemo(
    () => siteMessages.filter((entry) => !entry.is_read).length,
    [siteMessages],
  );
  const hasAnyNotifications =
    notifications.length > 0 ||
    novaMessages.length > 0 ||
    siteMessages.length > 0 ||
    ticketNotifications.length > 0;

  async function toggleNotification(id: string, read: boolean) {
    setBusy(`notification:${id}`);
    try {
      await onSetNotificationRead(id, read);
    } finally {
      setBusy(null);
    }
  }

  const hasUnreadInActiveTab = useMemo(() => {
    if (activeTab === "all") {
      return (
        notifications.some((entry) => !entry.is_read) ||
        novaMessages.some((entry) => !entry.is_read) ||
        siteMessages.some((entry) => !entry.is_read) ||
        ticketNotifications.some((entry) => entry.unread)
      );
    }
    if (activeTab === "alerts") {
      return notifications.some((entry) => !entry.is_read);
    }
    if (activeTab === "nova") {
      return novaMessages.some((entry) => !entry.is_read);
    }
    if (activeTab === "websites") {
      return siteMessages.some((entry) => !entry.is_read);
    }
    return ticketNotifications.some((entry) => entry.unread);
  }, [activeTab, notifications, novaMessages, siteMessages, ticketNotifications]);

  async function markAllVisibleRead() {
    setBusy("mark-all");
    try {
      if (activeTab === "all" || activeTab === "alerts") {
        if (notifications.some((entry) => !entry.is_read)) {
          await onMarkAllInboxRead?.();
        }
      }
      if (activeTab === "all") {
        onMarkAllWebsiteRead?.();
      } else if (activeTab === "nova") {
        novaMessages
          .filter((entry) => !entry.is_read)
          .forEach((entry) => onSetWebsiteMessageRead(entry.id, true));
      } else if (activeTab === "websites") {
        siteMessages
          .filter((entry) => !entry.is_read)
          .forEach((entry) => onSetWebsiteMessageRead(entry.id, true));
      }
      if (activeTab === "all" || activeTab === "tickets") {
        await Promise.all(
          ticketNotifications
            .filter((entry) => entry.unread)
            .map((entry) => onMarkTicketRead(entry.id)),
        );
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[275] bg-background/90 backdrop-blur-sm">
      <div className="flex h-full flex-col p-4">
        <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-border bg-card shadow-2xl">
          <div className="flex items-start justify-between gap-4 border-b border-border px-8 py-5">
            <div>
              <div className="flex items-center gap-3">
                {onBack ? (
                  <Button variant="secondary" size="sm" onClick={onBack}>
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    Back
                  </Button>
                ) : null}
                <div className="text-xl font-semibold">Notifications</div>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                View everything in one place by default, or filter by alerts, Nova, websites, and tickets.
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasUnreadInActiveTab ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void markAllVisibleRead()}
                  disabled={busy === "mark-all"}
                >
                  Mark all as read
                </Button>
              ) : null}
              <button
                onClick={onClose}
                className="rounded-lg p-2 transition-colors hover:bg-chrome-hover"
                title="Close notifications"
                aria-label="Close notifications"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="border-b border-border px-8 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <CategoryButton active={activeTab === "all"} icon={ListFilter} label="All" onClick={() => onTabChange("all")} />
              <CategoryButton active={activeTab === "alerts"} icon={Bell} label={`Alerts (${alertUnreadCount})`} onClick={() => onTabChange("alerts")} />
              <CategoryButton active={activeTab === "nova"} icon={Sparkles} label={`Nova (${novaUnreadCount})`} onClick={() => onTabChange("nova")} />
              <CategoryButton active={activeTab === "websites"} icon={MessageSquare} label={`Websites (${siteUnreadCount})`} onClick={() => onTabChange("websites")} />
              <CategoryButton active={activeTab === "tickets"} icon={LifeBuoy} label={`Tickets (${ticketUnreadCount})`} onClick={() => onTabChange("tickets")} />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
            {activeTab === "all" && !hasAnyNotifications ? (
              <EmptyState text={user ? "No notifications yet." : "Sign in to receive account alerts and ticket updates."} />
            ) : null}

            {(activeTab === "all" || activeTab === "alerts") ? (
              <div className="space-y-3">
                {activeTab === "all" ? (
                  <SectionHeading title="Alerts" count={notifications.length} />
                ) : null}
                {onMarkAllInboxRead && notifications.some((entry) => !entry.is_read) ? (
                  <div className="flex justify-end">
                    <Button variant="secondary" size="sm" onClick={() => void onMarkAllInboxRead()}>
                      Mark all read
                    </Button>
                  </div>
                ) : null}
                {notifications.length === 0 ? (
                  <EmptyState text={user ? "No account alerts right now." : "Sign in to receive account alerts."} />
                ) : (
                  notifications.map((notification) => {
                    const tone = alertToneClasses(notification.color, notification.is_read);
                    return (
                    <article key={notification.id} className={`rounded-2xl border p-4 ${tone.card}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className={`text-sm font-semibold ${notification.is_read ? "text-foreground" : tone.title}`}>{notification.title}</div>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${notification.is_read ? "bg-muted text-muted-foreground" : tone.badge}`}>
                              {inboxNotificationBadge(notification)}
                            </span>
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {notification.created_by_username ?? "Nova"} · {formatTime(notification.created_at)}
                          </div>
                          <p className={`mt-3 rounded-xl px-3 py-3 text-sm leading-6 text-foreground ring-1 ${notification.is_read ? "bg-card/90 ring-border/60" : tone.body}`}>
                            {notification.message}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy === `notification:${notification.id}`}
                          onClick={() => void toggleNotification(notification.id, !notification.is_read)}
                        >
                          {notification.is_read ? "Mark unread" : "Mark read"}
                        </Button>
                      </div>
                    </article>
                  )})
                )}
              </div>
            ) : null}

            {(activeTab === "all" || activeTab === "nova") ? (
              <div className="space-y-3">
                {activeTab === "all" ? (
                  <SectionHeading title="Nova" count={novaMessages.length} />
                ) : null}
                {novaMessages.length === 0 ? (
                  <EmptyState text="No Nova tips or system notices yet." />
                ) : (
                  novaMessages.map((message) => (
                    <article key={message.id} className={`rounded-2xl border p-4 ${message.is_read ? "border-border bg-background/40" : "border-primary/30 bg-primary/5"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-primary" />
                            <div className="text-sm font-semibold">{message.title}</div>
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground">{formatTime(message.created_at)}</div>
                          <p className="mt-3 rounded-xl bg-card/90 px-3 py-3 text-sm leading-6 text-foreground ring-1 ring-border/60">
                            {message.message}
                          </p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => onSetWebsiteMessageRead(message.id, !message.is_read)}>
                          {message.is_read ? "Mark unread" : "Mark read"}
                        </Button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            ) : null}

            {(activeTab === "all" || activeTab === "websites") ? (
              <div className="space-y-3">
                {activeTab === "all" ? (
                  <SectionHeading title="Websites" count={siteMessages.length} />
                ) : null}
                {onMarkAllWebsiteRead && siteMessages.some((entry) => !entry.is_read) ? (
                  <div className="flex justify-end">
                    <Button variant="secondary" size="sm" onClick={() => onMarkAllWebsiteRead()}>
                      Mark all read
                    </Button>
                  </div>
                ) : null}
                {siteMessages.length === 0 ? (
                  <EmptyState text="No website notices yet." />
                ) : (
                  siteMessages.map((message) => (
                    <article key={message.id} className={`rounded-2xl border p-4 ${message.is_read ? "border-border bg-background/40" : "border-primary/30 bg-primary/5"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold">{message.title}</div>
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {message.tab_title} · {formatTime(message.created_at)}
                          </div>
                          <p className="mt-3 rounded-xl bg-card/90 px-3 py-3 text-sm leading-6 text-foreground ring-1 ring-border/60">
                            {message.message || "This website sent a message without extra text."}
                          </p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => onSetWebsiteMessageRead(message.id, !message.is_read)}>
                          {message.is_read ? "Mark unread" : "Mark read"}
                        </Button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            ) : null}

            {(activeTab === "all" || activeTab === "tickets") ? (
              <div className="space-y-3">
                {activeTab === "all" ? (
                  <SectionHeading title="Tickets" count={ticketNotifications.length} />
                ) : null}
                {ticketNotifications.length === 0 ? (
                  <EmptyState text="No tickets yet." />
                ) : (
                  ticketNotifications.map((ticket) => (
                    <button
                      key={ticket.id}
                      type="button"
                      onClick={() => {
                        if (ticket.unread) {
                          void onMarkTicketRead(ticket.id);
                        }
                        onOpenTicket(ticket.id);
                      }}
                      className={`w-full rounded-2xl border px-4 py-4 text-left transition-colors ${
                        ticket.unread
                          ? "border-primary/35 bg-primary/10 shadow-[0_0_0_1px_rgba(59,130,246,0.08)] hover:bg-primary/15"
                          : "border-border bg-background/40 hover:border-primary/30 hover:bg-background/70"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-semibold">{ticket.subject}</div>
                            {ticket.unread ? (
                              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                Unread
                              </span>
                            ) : (
                              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                Read
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {ticket.status === "closed" ? "Closed ticket" : "Ticket thread"} · {formatTime(ticket.updated_at)}
                          </div>
                        </div>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${ticket.unread ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                          Open thread
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

const CategoryButton: React.FC<{
  active: boolean;
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}> = ({ active, icon: Icon, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors ${active ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card/40 text-muted-foreground"}`}
  >
    <Icon className="h-4 w-4" />
    {label}
  </button>
);

const SectionHeading: React.FC<{ title: string; count: number }> = ({ title, count }) => (
  <div className="pt-2">
    <div className="text-sm font-semibold text-foreground">
      {title} <span className="text-muted-foreground">({count})</span>
    </div>
  </div>
);

const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
    {text}
  </div>
);
