import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Ban, BellRing, LifeBuoy, MessageSquare, Sparkles, WifiOff, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { tryStandardBrowserShortcuts } from "@/lib/shortcuts";
import { useBrowserStore } from "@/store/browserStore";
import { TabBar } from "./TabBar";
import { UrlBar } from "./UrlBar";
import { ContentArea } from "./ContentArea";
import { SettingsPanel } from "./SettingsPanel";
import { HistoryPanel } from "./HistoryPanel";
import { BookmarksPanel } from "./BookmarksPanel";
import { ExtensionsPanel } from "./ExtensionsPanel";
import { AccountPanel } from "./AccountPanel";
import { AdminPanel } from "./AdminPanel";
import { NotificationCenter } from "./NotificationCenter";
import { TicketsPanel } from "./TicketsPanel";
import { AdminNotificationCenter } from "./AdminNotificationCenter";
import { SyncPanel } from "./SyncPanel";
import { ContextMenu } from "./ContextMenu";
import { Tutorial } from "./Tutorial";
import type { PanelType } from "@/types/browser";

const DISMISSED_ALERTS_KEY = "nova.browser.dismissed-alerts";
const AUTO_HIDE_ALERT_MS = 6500;

function normalizeShortcutKey(value: string) {
  switch (value) {
    case " ":
      return "Space";
    case ",":
      return ",";
    case ".":
      return ".";
    default:
      return value.length === 1 ? value.toUpperCase() : value;
  }
}

function shortcutFromEvent(event: KeyboardEvent) {
  const parts = [
    event.ctrlKey ? "Ctrl" : "",
    event.shiftKey ? "Shift" : "",
    event.altKey ? "Alt" : "",
    event.metaKey ? "Meta" : "",
    normalizeShortcutKey(event.key),
  ].filter(Boolean);
  return parts.join("+");
}

function hasOpenModalDialog() {
  return Boolean(
    document.querySelector("[role='dialog'][data-state='open'], [role='alertdialog'][data-state='open']"),
  );
}

function resolveContextMenuUrl(rawValue: string | null | undefined, baseUrl: string) {
  if (!rawValue) return undefined;
  try {
    return new URL(rawValue, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function buildContextMenuPayload(target: EventTarget | null, baseUrl: string, x: number, y: number) {
  const element = target instanceof Element ? target : null;
  const linkElement = element?.closest("a[href]");
  const imageElement = element?.closest("img") as HTMLImageElement | null;
  return {
    x,
    y,
    linkUrl: resolveContextMenuUrl(linkElement?.getAttribute("href"), baseUrl),
    imageUrl: resolveContextMenuUrl(imageElement?.currentSrc || imageElement?.getAttribute("src"), baseUrl),
  };
}

function popupAlertToneClasses(color?: "cyan" | "purple" | "green" | "orange" | "red") {
  switch (color) {
    case "red":
      return {
        card: "border-red-500/50 bg-red-950/65",
        icon: "bg-red-500/15 text-red-300",
        badge: "bg-red-500/15 text-red-200",
        message: "text-red-50",
      };
    case "orange":
      return {
        card: "border-orange-500/50 bg-orange-950/60",
        icon: "bg-orange-500/15 text-orange-300",
        badge: "bg-orange-500/15 text-orange-200",
        message: "text-orange-50",
      };
    case "green":
      return {
        card: "border-emerald-500/50 bg-emerald-950/60",
        icon: "bg-emerald-500/15 text-emerald-300",
        badge: "bg-emerald-500/15 text-emerald-200",
        message: "text-emerald-50",
      };
    case "purple":
      return {
        card: "border-violet-500/50 bg-violet-950/60",
        icon: "bg-violet-500/15 text-violet-300",
        badge: "bg-violet-500/15 text-violet-200",
        message: "text-violet-50",
      };
    case "cyan":
      return {
        card: "border-cyan-500/50 bg-cyan-950/55",
        icon: "bg-cyan-500/15 text-cyan-300",
        badge: "bg-cyan-500/15 text-cyan-200",
        message: "text-cyan-50",
      };
    default:
      return {
        card: "border-primary/45 bg-background/95",
        icon: "bg-primary/15 text-primary",
        badge: "bg-primary/12 text-primary-foreground",
        message: "text-foreground",
      };
  }
}

export const BrowserShell: React.FC = () => {
  const store = useBrowserStore();
  const activePanel = store.activePanel;
  const isAdmin = store.user?.isAdmin;
  const transportConfig = store.transportConfig;
  const refreshAdminData = store.refreshAdminData;
  const setScramjetError = store.setScramjetError;
  const postScreenShareFrame = store.postScreenShareFrame;
  const alertList = store.alerts;
  const showTutorial = store.showTutorial;
  const dismissTutorial = store.dismissTutorial;
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    linkUrl?: string;
    imageUrl?: string;
  } | null>(null);
  const shellRootRef = useRef<HTMLDivElement | null>(null);
  const contentRootRef = useRef<HTMLDivElement | null>(null);
  const contentAreaRef = useRef<HTMLDivElement | null>(null);
  const tabFullscreenHostRef = useRef<HTMLDivElement | null>(null);
  const registerTabFullscreenHost = useCallback((el: HTMLDivElement | null) => {
    tabFullscreenHostRef.current = el;
  }, []);
  const [dismissedAlertIds, setDismissedAlertIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(DISMISSED_ALERTS_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [alertSeenAtById, setAlertSeenAtById] = useState<Record<string, number>>({});
  const [dismissedScreenNotificationIds, setDismissedScreenNotificationIds] = useState<string[]>([]);
  const [statusNoticeSeenAtById, setStatusNoticeSeenAtById] = useState<
    Record<string, number>
  >({});
  const [countdownNow, setCountdownNow] = useState(() => Date.now());

  const handlePostScreenShareFrame = useCallback(
    (requestId: string, dataUrl: string) => {
      void postScreenShareFrame(requestId, dataUrl);
    },
    [postScreenShareFrame],
  );

  const handleFullscreenTab = useCallback(() => {
    const target = tabFullscreenHostRef.current ?? contentAreaRef.current;
    if (!target) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      store.setActivePanel("none");
      void target.requestFullscreen();
    }
  }, [store]);

  const togglePanel = useCallback((panel: PanelType) => {
    store.setActivePanel(store.activePanel === panel ? "none" : panel);
  }, [store]);

  const handleHome = useCallback(() => {
    const activeTabId = store.activeTab?.id;
    const tabCount = store.tabs.length;
    if (activeTabId && tabCount > 1) {
      store.closeTab(activeTabId);
    } else if (activeTabId) {
      store.navigateTo("newtab");
      return;
    }
    store.addTab("newtab", "New Tab");
  }, [store]);

  const handleAddBookmark = useCallback(() => {
    if (!store.activeTab || store.activeTab.url === "newtab") return;
    const exists = store.bookmarks.some((b) => b.url === store.activeTab?.url);
    if (exists) {
      const bm = store.bookmarks.find((b) => b.url === store.activeTab?.url);
      if (bm) store.removeBookmark(bm.id);
    } else {
      store.addBookmark({
        title: store.activeTab.title,
        url: store.activeTab.url,
        favicon: store.activeTab.favicon || "",
      });
    }
  }, [store]);

  const handlePanelNavigate = useCallback(async (url: string) => {
    await store.navigateTo(url);
    store.setActivePanel("none");
  }, [store]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      e.preventDefault();
      const baseUrl =
        store.activeTab?.url && /^https?:/i.test(store.activeTab.url)
          ? store.activeTab.url
          : window.location.origin;
      setContextMenu(buildContextMenuPayload(e.target, baseUrl, e.clientX, e.clientY));
    };
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, [store.activeTab?.url]);

  const handleShortcutEvent = useCallback((e: Pick<KeyboardEvent, "key" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey" | "preventDefault" | "target">) => {
      if (e.key === "Escape") {
        if (contextMenu) {
          setContextMenu(null);
          return true;
        }
        if (hasOpenModalDialog()) {
          return false;
        }
        if (activePanel !== "none") {
          store.setActivePanel("none");
          return true;
        }
        if (showTutorial) {
          dismissTutorial();
          return true;
        }
        return false;
      }

      const target = e.target;
      if (
        target instanceof HTMLElement &&
        target.closest("input, textarea, select, [contenteditable='true']")
      ) {
        return false;
      }

      if (
        tryStandardBrowserShortcuts(e as KeyboardEvent, {
          reload: () => store.regenTab(),
          restoreClosedTab: () => store.restoreLastClosedTab(),
        })
      ) {
        return true;
      }

      const key = shortcutFromEvent(e as KeyboardEvent);

      for (const shortcut of store.settings.shortcuts) {
        const normalized = shortcut.keys.replace(/\s/g, "");
        if (key === normalized) {
          e.preventDefault();
          switch (shortcut.action) {
            case "new-tab": store.addTab(); break;
            case "close-tab": if (store.activeTab) store.closeTab(store.activeTab.id); break;
            case "reload-tab": store.regenTab(); break;
            case "restore-closed-tab": store.restoreLastClosedTab(); break;
            case "settings": togglePanel("settings"); break;
            case "history": togglePanel("history"); break;
            case "home": handleHome(); break;
            case "bookmarks": togglePanel("bookmarks"); break;
            case "inspect": store.requestInspect(); break;
            case "back": store.goBack(); break;
            case "forward": store.goForward(); break;
          }
          return true;
        }
      }

      return false;
    }, [activePanel, contextMenu, dismissTutorial, handleHome, showTutorial, store, togglePanel]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (contextMenu) {
          setContextMenu(null);
          return;
        }
        if (hasOpenModalDialog()) {
          return;
        }
        if (activePanel !== "none") {
          store.setActivePanel("none");
          return;
        }
        if (showTutorial) {
          dismissTutorial();
        }
        return;
      }
      void handleShortcutEvent(e);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [activePanel, contextMenu, dismissTutorial, handleShortcutEvent, showTutorial, store]);

  useEffect(() => {
    if (activePanel === "admin" && isAdmin) {
      void refreshAdminData();
    }
  }, [activePanel, isAdmin, refreshAdminData]);

  useEffect(() => {
    const nextIds = alertList.map((alert) => alert.id);
    setDismissedAlertIds((current) =>
      current.filter((id) => nextIds.includes(id)),
    );
    setAlertSeenAtById((current) => {
      const next: Record<string, number> = {};
      for (const alert of alertList) {
        next[alert.id] = current[alert.id] ?? Date.now();
      }
      return next;
    });
  }, [alertList]);

  useEffect(() => {
    localStorage.setItem(
      DISMISSED_ALERTS_KEY,
      JSON.stringify(dismissedAlertIds),
    );
  }, [dismissedAlertIds]);

  useEffect(() => {
    const timers = alertList
      .filter((alert) => !dismissedAlertIds.includes(alert.id))
      .map((alert) =>
        window.setTimeout(() => {
          setDismissedAlertIds((current) =>
            current.includes(alert.id) ? current : [...current, alert.id],
          );
        }, Math.max(0, AUTO_HIDE_ALERT_MS - (Date.now() - (alertSeenAtById[alert.id] ?? Date.now())))),
      );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [alertList, alertSeenAtById, dismissedAlertIds]);

  const visibleAlerts = useMemo(
    () =>
      store.alerts
        .filter((alert) => !dismissedAlertIds.includes(alert.id))
        .slice(0, 3),
    [dismissedAlertIds, store.alerts],
  );

  const dismissStatusNotice = useCallback((id: string) => {
    if (id === "navigation-error") {
      store.setNavigationError(null);
      return;
    }
    if (id === "auth-error") {
      store.setAuthError(null);
    }
    if (id === "inspect-notice") {
      store.clearInspectNotice();
    }
  }, [store]);

  const isVertical = store.settings.theme.tabOrientation === "vertical";
  const statusNotices = useMemo(() => {
    const notices = [];
    if (store.navigationError) {
      notices.push({
        id: "navigation-error",
        title: "Navigation blocked",
        message: store.navigationError,
        color: "orange" as const,
      });
    }
    if (store.authError) {
      notices.push({
        id: "auth-error",
        title: "Sign-in issue",
        message: store.authError,
      });
    }
    if (store.inspectNotice) {
      notices.push({
        id: "inspect-notice",
        title: "Inspect unavailable",
        message: store.inspectNotice,
        color: "orange" as const,
      });
    }
    return notices;
  }, [store.authError, store.inspectNotice, store.navigationError]);

  useEffect(() => {
    setStatusNoticeSeenAtById((current) => {
      const next: Record<string, number> = {};
      for (const notice of statusNotices) {
        if (notice.id === "auth-error") continue;
        next[notice.id] = current[notice.id] ?? Date.now();
      }
      return next;
    });
  }, [statusNotices]);

  useEffect(() => {
    const timers = statusNotices
      .filter((notice) => notice.id !== "auth-error")
      .map((notice) => {
        const seenAt = statusNoticeSeenAtById[notice.id] ?? Date.now();
        const delay = Math.max(0, AUTO_HIDE_ALERT_MS - (Date.now() - seenAt));
        return window.setTimeout(() => dismissStatusNotice(notice.id), delay);
      });
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [statusNotices, statusNoticeSeenAtById, dismissStatusNotice]);

  const screenNotificationSourceIds = useMemo(
    () => [
      ...store.websiteMessages
        .filter((message) => !message.is_read)
        .map((message) => message.id),
      ...store.supportTickets
        .filter((ticket) => ticket.unread)
        .map((ticket) => `ticket:${ticket.id}`),
    ],
    [store.supportTickets, store.websiteMessages],
  );

  useEffect(() => {
    const hasVisibleServerAlerts = alertList.some(
      (alert) => !dismissedAlertIds.includes(alert.id),
    );
    const hasAutoStatusNotices = statusNotices.some(
      (notice) => notice.id !== "auth-error",
    );
    const hasScreenNotifications = screenNotificationSourceIds.some(
      (id) => !dismissedScreenNotificationIds.includes(id),
    );
    if (!hasVisibleServerAlerts && !hasAutoStatusNotices && !hasScreenNotifications) return;
    const timer = window.setInterval(() => setCountdownNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [alertList, dismissedAlertIds, dismissedScreenNotificationIds, screenNotificationSourceIds, statusNotices]);

  const unreadMessages = useMemo(
    () =>
      store.inboxFeed.filter((notification) => !notification.is_read).length +
      store.websiteMessages.filter((message) => !message.is_read).length +
      store.supportTickets.filter((ticket) => ticket.unread).length,
    [store.inboxFeed, store.supportTickets, store.websiteMessages],
  );
  const screenNotifications = useMemo(
    () => {
      const websiteItems = store.websiteMessages
        .filter((message) => !message.is_read && !dismissedScreenNotificationIds.includes(message.id))
        .map((message) => ({
          id: message.id,
          title: message.title,
          message: message.message || "This notification did not include extra text.",
          createdAt: message.created_at,
          color: message.tab_id === "system" ? ("cyan" as const) : ("purple" as const),
          badge: message.tab_id === "system" ? "Nova" : "Website",
          icon: message.tab_id === "system" ? "nova" as const : "website" as const,
        }));
      const ticketItems = store.supportTickets
        .filter((ticket) => ticket.unread && !dismissedScreenNotificationIds.includes(`ticket:${ticket.id}`))
        .map((ticket) => ({
          id: `ticket:${ticket.id}`,
          title: ticket.subject,
          message: ticket.messages[ticket.messages.length - 1]?.body || "You have a new ticket update.",
          createdAt: ticket.updated_at,
          color: "green" as const,
          badge: "Ticket",
          icon: "ticket" as const,
        }));
      return [...websiteItems, ...ticketItems].sort((left, right) => right.createdAt - left.createdAt);
    },
    [dismissedScreenNotificationIds, store.supportTickets, store.websiteMessages],
  );

  useEffect(() => {
    setDismissedScreenNotificationIds((current) =>
      current.filter((id) => screenNotificationSourceIds.includes(id)),
    );
  }, [screenNotificationSourceIds]);

  useEffect(() => {
    const timers = screenNotifications.map((notification) => {
      const delay = Math.max(0, AUTO_HIDE_ALERT_MS - (Date.now() - notification.createdAt));
      return window.setTimeout(() => {
        setDismissedScreenNotificationIds((current) =>
          current.includes(notification.id) ? current : [...current, notification.id],
        );
      }, delay);
    });
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [screenNotifications]);

  if (!store.isReady) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-background">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.25),_transparent_40%),linear-gradient(135deg,#020617,#0f172a_55%,#0b1120)]" />
        <div className="relative flex h-full items-center justify-center p-8">
          <div className="w-full max-w-xl rounded-[2rem] border border-white/10 bg-background/65 p-10 text-center shadow-2xl backdrop-blur-xl">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 text-primary">
              <Sparkles className="h-8 w-8" />
            </div>
            <div className="text-4xl font-semibold tracking-tight">
              <span className="text-primary">Nova</span>
              <span className="ml-1 text-foreground">Browser</span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Preparing your workspace, syncing preferences, and spinning up Nova's services.
            </p>
            <div className="mt-8 overflow-hidden rounded-full bg-white/10">
              <div className="h-2 w-1/3 animate-[loading_1.2s_ease-in-out_infinite] rounded-full bg-primary" />
            </div>
            <div className="mt-6 grid gap-3 text-left text-xs text-muted-foreground sm:grid-cols-3">
              <div className="rounded-2xl border border-border/60 bg-background/40 px-4 py-3">Loading theme</div>
              <div className="rounded-2xl border border-border/60 bg-background/40 px-4 py-3">Restoring tabs</div>
              <div className="rounded-2xl border border-border/60 bg-background/40 px-4 py-3">Checking alerts</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (store.banned) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-chrome text-foreground p-6">
        <div className="max-w-lg rounded-3xl border border-border bg-card p-8 text-center shadow-2xl">
          <Ban className="mx-auto mb-4 w-10 h-10 text-destructive" />
          <h1 className="text-2xl font-semibold mb-3">Access blocked</h1>
          <p className="text-sm text-muted-foreground mb-3">{store.banned.reason}</p>
          <p className="text-sm text-muted-foreground">
            Issued by <span className="text-foreground">{store.banned.issuedByUsername}</span>
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            {store.banned.expiresAt ? `Ban expires ${new Date(store.banned.expiresAt).toLocaleString()}` : "This ban is indefinite."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={shellRootRef} className="h-screen w-screen flex flex-col overflow-hidden bg-chrome select-none">
      {(visibleAlerts.length > 0 ||
        statusNotices.length > 0 ||
        screenNotifications.length > 0) && (
        <div className="pointer-events-none fixed left-1/2 top-20 z-[250] flex w-full max-w-2xl -translate-x-1/2 flex-col gap-3 px-4">
          {[
            ...statusNotices,
            ...visibleAlerts,
            ...screenNotifications,
          ].map((alert) => (
            (() => {
              const tone = popupAlertToneClasses("color" in alert ? alert.color : undefined);
              return (
            <div
              key={alert.id}
              className={cn(
                "pointer-events-auto rounded-2xl border px-5 py-4 text-foreground shadow-2xl backdrop-blur-xl",
                tone.card,
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl",
                    tone.icon,
                  )}
                >
                  {"icon" in alert ? (
                    alert.icon === "nova" ? <Sparkles className="h-4 w-4" /> : alert.icon === "ticket" ? <LifeBuoy className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />
                  ) : "created_at" in alert ? (
                    <BellRing className="h-4 w-4" />
                  ) : alert.color === "red" ? (
                    <WifiOff className="h-4 w-4" />
                  ) : (
                    <AlertTriangle className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <div className="text-sm font-semibold text-white">{alert.title}</div>
                    {"badge" in alert ? (
                      <div className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", tone.badge)}>
                        {alert.badge}
                      </div>
                    ) : "target_user_id" in alert ? (
                      <div className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", tone.badge)}>
                        {alert.target_user_id ? "User alert" : "Global alert"}
                      </div>
                    ) : null}
                    {"created_at" in alert && typeof alert.created_at === "number" && (
                      <div className="text-[11px] uppercase tracking-wide text-white/60">
                        {new Date(alert.created_at).toLocaleString()}
                      </div>
                    )}
                  </div>
                  <div className={cn("mt-1 text-sm", tone.message)}>{alert.message}</div>
                  {"created_by_username" in alert && alert.created_by_username && (
                    <div className="mt-2 text-xs text-white/65">
                      Sent by {alert.created_by_username}
                    </div>
                  )}
                  {(() => {
                    const seenAt =
                      "badge" in alert
                        ? alert.createdAt
                        : statusNoticeSeenAtById[alert.id] ??
                          ("created_by_username" in alert
                            ? alertSeenAtById[alert.id]
                            : undefined);
                    if (seenAt === undefined) return null;
                    return (
                      <div className="mt-2 text-[10px] uppercase tracking-wide text-white/55">
                        Hides in{" "}
                        {Math.max(
                          0,
                          Math.ceil(
                            (AUTO_HIDE_ALERT_MS - (countdownNow - seenAt)) / 1000,
                          ),
                        )}
                        s
                      </div>
                    );
                  })()}
                </div>
                <button
                  onClick={() =>
                    "badge" in alert
                      ? setDismissedScreenNotificationIds((current) =>
                          current.includes(alert.id) ? current : [...current, alert.id],
                        )
                      : "created_at" in alert
                        ? setDismissedAlertIds((current) =>
                            current.includes(alert.id) ? current : [...current, alert.id],
                          )
                        : dismissStatusNotice(alert.id)
                  }
                  className="rounded-lg p-1 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label={`Dismiss ${alert.title}`}
                  title={`Dismiss ${alert.title}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
              );
            })()
          ))}
        </div>
      )}

      {store.showTutorial && (
        <Tutorial
          settings={store.settings}
          themePresets={store.themePresets}
          onUpdateSettings={store.updateSettings}
          onUpdateTheme={store.updateTheme}
          onRegister={store.register}
          onLoginFromSetup={store.loginFromSetupWizard}
          authError={store.authError}
          onDismiss={store.dismissTutorial}
          jumpToReviewAfterAuth={store.tutorialJumpToReview}
          onConsumedJumpToReview={store.clearTutorialJumpToReview}
          accountUsername={store.user?.username ?? null}
        />
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          canGoBack={Boolean(store.activeTab?.canGoBack)}
          canGoForward={Boolean(store.activeTab?.canGoForward)}
          isBookmarked={Boolean(store.activeTab && store.bookmarks.some((b) => b.url === store.activeTab?.url))}
          isMuted={Boolean(store.activeTab?.isMuted)}
          currentUrl={store.activeTab?.url}
          onBack={store.goBack}
          onForward={store.goForward}
          onReload={store.regenTab}
          onToggleMute={() => {
            if (store.activeTab) {
              store.toggleTabMuted(store.activeTab.id);
            }
          }}
          onToggleBookmark={handleAddBookmark}
          linkUrl={contextMenu.linkUrl}
          imageUrl={contextMenu.imageUrl}
          onOpenInNewTab={(url) => store.openInNewTab(url)}
          onInspect={store.requestInspect}
          onOpenSettings={() => store.setActivePanel("settings")}
        />
      )}

      {!isVertical && (
        <TabBar
          tabs={store.tabs}
          onActivate={store.setActiveTab}
          onClose={store.closeTab}
          onAdd={() => store.addTab()}
          onMove={store.moveTab}
          density={store.settings.theme.density}
          orientation="horizontal"
        />
      )}

      {store.screenSharePrompt && (
        <div className="fixed left-1/2 top-24 z-[270] w-full max-w-lg -translate-x-1/2 px-4">
          <div className="rounded-2xl border border-primary/40 bg-card/95 px-4 py-3 shadow-2xl backdrop-blur">
            <div className="text-sm font-semibold text-foreground">Screen view requested</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Administrator <span className="text-foreground">{store.screenSharePrompt.adminUsername}</span>{" "}
              asked to view this browser window. Only the visible tab area is captured as a snapshot.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                onClick={() => void store.respondScreenShare(true)}
              >
                Allow
              </button>
              <button
                type="button"
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground"
                onClick={() => void store.respondScreenShare(false)}
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      <UrlBar
        activeTab={store.activeTab}
        onNavigate={store.navigateTo}
        onRegen={store.regenTab}
        onHome={handleHome}
        onBack={store.goBack}
        onForward={store.goForward}
        onFullscreen={handleFullscreenTab}
        onTogglePanel={togglePanel}
        activePanel={store.activePanel}
        onAddBookmark={handleAddBookmark}
        onInspect={store.requestInspect}
        canGoBack={Boolean(store.activeTab?.canGoBack)}
        canGoForward={Boolean(store.activeTab?.canGoForward)}
        bookmarks={store.bookmarks}
        searchEngine={store.settings.defaultSearchEngine}
        searchSuggestions={store.settings.searchSuggestions}
        density={store.settings.theme.density}
        user={store.user}
        unreadMessages={unreadMessages}
      />

      {store.settings.showBookmarksBar && store.bookmarks.length > 0 && (
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-chrome px-2 py-1">
          {store.bookmarks.map((bookmark) => (
            <button
              key={bookmark.id}
              type="button"
              onClick={() => handlePanelNavigate(bookmark.url)}
              className="flex shrink-0 items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-chrome-hover hover:text-foreground"
              title={bookmark.title}
            >
              {bookmark.favicon ? (
                <img
                  src={bookmark.favicon}
                  alt=""
                  className="h-3.5 w-3.5 rounded-sm object-cover"
                />
              ) : (
                <div className="flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-primary/15 text-[9px] font-semibold text-primary">
                  {bookmark.title[0]?.toUpperCase() ?? "B"}
                </div>
              )}
              <span className="max-w-36 truncate">{bookmark.title}</span>
            </button>
          ))}
        </div>
      )}

      {(store.activePanel === "notifications" || store.activePanel === "messages") && (
        <NotificationCenter
          user={store.user}
          activeTab={store.notificationCenterTab}
          notifications={store.inboxFeed}
          websiteMessages={store.websiteMessages}
          tickets={store.supportTickets}
          onTabChange={store.setNotificationCenterTab}
          onSetNotificationRead={store.setNotificationRead}
          onSetWebsiteMessageRead={store.setWebsiteMessageRead}
          onMarkAllInboxRead={store.markAllInboxNotificationsRead}
          onMarkAllWebsiteRead={store.markAllWebsiteMessagesRead}
          onMarkTicketRead={store.markSupportTicketRead}
          onOpenTicket={(ticketId) => store.openTicketsPanel(ticketId)}
          onBack={store.canGoBackPanel ? store.goBackPanel : undefined}
          onClose={() => store.setActivePanel("none")}
        />
      )}
      {store.activePanel === "tickets" && (
        <TicketsPanel
          user={store.user}
          tickets={store.supportTickets}
          currentTabUrl={
            store.activeTab?.url &&
            store.activeTab.url !== "newtab" &&
            !store.activeTab.url.startsWith("nova://")
              ? store.activeTab.url
              : ""
          }
          selectedTicketId={store.selectedSupportTicketId}
          onSelectTicket={store.setSelectedSupportTicketId}
          onCreateTicket={store.createSupportTicket}
          onReplyTicket={store.replySupportTicket}
          onMarkTicketRead={store.markSupportTicketRead}
          onCloseTicket={store.closeSupportTicket}
          onOpenAccount={() => store.setActivePanel("account")}
          onBack={store.canGoBackPanel ? store.goBackPanel : undefined}
          onClose={() => store.setActivePanel("none")}
        />
      )}
      {store.activePanel === "admin-notifications" && store.user?.isAdmin && (
        <AdminNotificationCenter
          notifications={store.adminNotifications}
          onSetNotificationRead={(id, read) => store.setAdminNotificationRead(id, read)}
          onOpenAdminTarget={(notification) => {
            void store.setAdminNotificationRead(notification.id, true);
            if (notification.ticket_id) {
              void store.markSupportTicketRead(notification.ticket_id);
              store.openAdminPanel("tickets", { ticketId: notification.ticket_id });
              return;
            }
            if (notification.username) {
              store.openAdminPanel("logs", { searchQuery: notification.username });
              return;
            }
            store.openAdminPanel(notification.kind.startsWith("ticket") ? "tickets" : "logs");
          }}
          onBack={store.canGoBackPanel ? store.goBackPanel : undefined}
          onClose={() => store.setActivePanel("none")}
        />
      )}

      <div ref={contentRootRef} className="flex min-h-0 flex-1 overflow-hidden">
        {isVertical && (
          <TabBar
            tabs={store.tabs}
            onActivate={store.setActiveTab}
            onClose={store.closeTab}
            onAdd={() => store.addTab()}
            onMove={store.moveTab}
            density={store.settings.theme.density}
            orientation="vertical"
          />
        )}

        <ContentArea
          ref={contentAreaRef}
          tabs={store.tabs}
          activeTab={store.activeTab}
          bookmarks={store.bookmarks}
          shortcuts={store.shortcuts}
          gamesApps={store.gamesApps}
          onAddShortcut={store.addShortcutTile}
          onUpdateShortcut={store.updateShortcutTile}
          onMoveShortcut={store.moveShortcutTile}
          onRemoveShortcut={store.removeShortcutTile}
          onAddCustomGameApp={store.addCustomGameApp}
          onRemoveCustomGameApp={store.removeCustomGameApp}
          onNavigate={store.navigateTo}
          onOpenInNewTab={store.openInNewTab}
          searchEngine={store.settings.defaultSearchEngine}
          searchSuggestions={store.settings.searchSuggestions}
          backgroundUrl={store.settings.theme.backgroundUrl}
          onOpenTickets={() => store.openTicketsPanel()}
          tabBehavior={store.settings.tabBehavior}
          transportConfig={store.transportConfig}
          inspectRequestToken={store.inspectRequestToken}
          erudaEnabled={store.settings.erudaEnabled}
          darkReaderEnabled={store.settings.extensions.darkReader}
          scramjetErrorMessage={store.scramjetError}
          onLoadingChange={store.markTabLoading}
          onTabLoadTimeout={store.failTabLoad}
          onFrameNavigate={store.handleFrameNavigation}
          onScramjetError={store.setScramjetError}
          onFrameContextMenu={(payload) => setContextMenu(payload)}
          onFramePointerDown={() => setContextMenu(null)}
          onFrameShortcut={handleShortcutEvent}
          onFrameFullscreenRequest={handleFullscreenTab}
          onRegisterTabFullscreenHost={registerTabFullscreenHost}
          onFrameWebsiteMessage={({ tabId, kind, title, message, url }) => {
            const sourceTab = store.tabs.find((entry) => entry.id === tabId);
            store.pushWebsiteMessage({
              tab_id: tabId,
              tab_title: sourceTab?.title || title,
              tab_url: url,
              kind,
              title,
              message,
            });
          }}
          onPasswordCapture={() => {}}
          screenShareCaptureId={store.screenShareCaptureId}
          onPostScreenShareFrame={handlePostScreenShareFrame}
          onInspectErudaFailed={store.notifyInspectFailure}
        />

        {store.activePanel === "settings" && (
          <SettingsPanel
            settings={store.settings}
            onUpdateSettings={store.updateSettings}
            onUpdateTheme={store.updateTheme}
            themePresets={store.themePresets}
            onBack={store.canGoBackPanel ? store.goBackPanel : undefined}
            onClose={() => store.setActivePanel('none')}
            onOpenAccountDetails={() => store.setActivePanel("account")}
          />
        )}
        {store.activePanel === "history" && (
          <HistoryPanel
            history={store.history}
            onNavigate={handlePanelNavigate}
            onClear={store.clearHistory}
            onRemoveEntry={store.removeHistoryEntry}
            onBack={store.canGoBackPanel ? store.goBackPanel : undefined}
            onClose={() => store.setActivePanel("none")}
          />
        )}
        {store.activePanel === "bookmarks" && (
          <BookmarksPanel
            bookmarks={store.bookmarks}
            onNavigate={handlePanelNavigate}
            onRemove={store.removeBookmark}
            onBack={store.canGoBackPanel ? store.goBackPanel : undefined}
            onClose={() => store.setActivePanel("none")}
          />
        )}
        {store.activePanel === "extensions" && (
          <ExtensionsPanel
            settings={store.settings}
            proxyLocations={store.proxyLocations}
            transportConfig={store.transportConfig}
            onUpdateSettings={store.updateSettings}
            onProxyLocationChange={store.updateProxyLocation}
            onBack={store.canGoBackPanel ? store.goBackPanel : undefined}
            onClose={() => store.setActivePanel("none")}
          />
        )}
        {store.activePanel === "account" && (
          <AccountPanel
            user={store.user}
            authError={store.authError}
            syncPromptOpen={store.syncPromptOpen}
            onClearAuthError={() => store.setAuthError(null)}
            onLogin={store.login}
            onRegister={store.register}
            onLogout={store.logout}
            onStartTotpSetup={store.startTotpSetup}
            onVerifyTotp={store.verifyTotp}
            onDisableTotp={store.disableTotp}
            onChangePassword={store.changePassword}
            onOpenTickets={() => store.openTicketsPanel()}
            onOpenAdmin={() => store.openAdminPanel("overview")}
            onOpenBrowserSettings={() => store.setActivePanel("settings")}
            onBack={store.canGoBackPanel ? store.goBackPanel : undefined}
            onClose={() => store.setActivePanel("none")}
          />
        )}
        {store.activePanel === "admin" && store.user?.isAdmin && (
          <AdminPanel
            users={store.adminUsers}
            sessions={store.adminSessions}
            logs={store.adminLogs}
            blockedSites={store.blockedSites}
            alerts={store.adminAlerts}
            tickets={store.adminTickets}
            notifications={store.adminNotifications}
            activeBans={store.adminActiveBans}
            recentUnbans={store.adminRecentUnbans}
            stats={store.adminStats}
            initialSection={store.adminSection}
            initialSearchQuery={store.adminSearchQuery}
            initialSelectedTicketId={store.selectedAdminTicketId}
            onBack={store.canGoBackPanel ? store.goBackPanel : undefined}
            onClose={() => store.setActivePanel("none")}
            onRefresh={store.refreshAdminData}
            onBanUser={store.banUser}
            onPromoteOrDemote={store.updateUserRole}
            onResetPassword={store.resetUserPassword}
            onResetTotp={store.resetUserTotp}
            onChangeUsername={store.changeUsername}
            onSendAlert={store.sendAlert}
            onRemoveAlert={store.removeAlert}
            onAddBlockedSite={store.addBlockedSite}
            onImportBlockedSites={store.importBlockedSites}
            onUpdateBlockedSite={store.updateBlockedSite}
            onRemoveBlockedSite={store.removeBlockedSite}
            onBanSession={store.banSession}
            onReplyTicket={store.replySupportTicket}
            onMarkTicketRead={store.markSupportTicketRead}
            onCloseTicket={store.closeSupportTicket}
            onRevokeBan={store.revokeBan}
            onDeleteUser={store.deleteUser}
            onOpenAdminNotifications={() => store.setActivePanel("admin-notifications")}
            onSectionChange={store.setAdminSection}
            onSearchQueryChange={store.setAdminSearchQuery}
            onSelectedTicketChange={store.setSelectedAdminTicketId}
          />
        )}
      </div>

      {store.syncPromptOpen && (
        <div className="fixed inset-0 z-[260] flex min-h-0 items-center justify-center overflow-y-auto bg-background/80 p-4 py-8 backdrop-blur-sm">
          {store.pendingLocalState && store.pendingServerState ? (
            <SyncPanel
              localState={store.pendingLocalState}
              accountState={store.pendingServerState}
              sessionPasswords={store.syncSessionPasswords}
              accountPasswords={store.syncAccountPasswords}
              onApply={store.applyMergedSyncState}
            />
          ) : null}
        </div>
      )}
    </div>
  );
};
