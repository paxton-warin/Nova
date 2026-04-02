import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  BarChart3,
  BellRing,
  Globe,
  LayoutDashboard,
  LifeBuoy,
  ListTree,
  MessageSquare,
  RefreshCw,
  Shield,
  Upload,
  UserCog,
  Users,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type {
  AdminBanRecord,
  AdminNotification,
  AdminLogEntry,
  AdminSession,
  AdminStats,
  AdminSupportTicket,
  AdminUser,
  BlockedSiteRecord,
  BrowserAlert,
} from "@/types/browser";

type BlockedSiteListGroup = {
  key: string;
  label: string;
  entries: BlockedSiteRecord[];
  searchText: string;
};

type AdminSection = "overview" | "logs" | "people" | "sessions" | "tickets" | "filters";

interface AdminPanelProps {
  users: AdminUser[];
  sessions: AdminSession[];
  logs: AdminLogEntry[];
  blockedSites: BlockedSiteRecord[];
  alerts: BrowserAlert[];
  tickets: AdminSupportTicket[];
  notifications: AdminNotification[];
  activeBans: AdminBanRecord[];
  recentUnbans: AdminBanRecord[];
  stats: AdminStats | null;
  initialSection?: AdminSection;
  initialSearchQuery?: string;
  initialSelectedTicketId?: string | null;
  onBack?: () => void;
  onClose: () => void;
  onRefresh: (options?: {
    filter?: string;
    timeframe?: AdminStats["timeframe"];
  }) => Promise<void> | void;
  onBanUser: (
    userId: string,
    reason: string,
    durationMinutes: number | null,
    targetSessionId?: string | null,
  ) => Promise<void> | void;
  onPromoteOrDemote: (userId: string, role: "user" | "admin") => Promise<void> | void;
  onResetPassword: (userId: string, newPassword: string) => Promise<void> | void;
  onResetTotp: (userId: string) => Promise<{
    ok: true;
    base32?: string;
    qrCodeDataUrl?: string;
    otpauthUrl?: string;
    requiresVerification?: boolean;
  }> | { ok: true; base32?: string; qrCodeDataUrl?: string; otpauthUrl?: string; requiresVerification?: boolean };
  onChangeUsername: (userId: string, username: string) => Promise<void> | void;
  onSendAlert: (
    title: string,
    message: string,
    color: BrowserAlert["color"],
    targetUserId?: string,
  ) => Promise<void> | void;
  onRemoveAlert: (id: string) => Promise<void> | void;
  onAddBlockedSite: (
    pattern: string,
    reason: string,
    userId?: string,
    options?: {
      listName?: string;
      mode?: "flag" | "block";
      notifyOnMatch?: boolean;
      isEnabled?: boolean;
    },
  ) => Promise<void> | void;
  onImportBlockedSites: (
    reason: string,
    content: string,
    userId?: string,
    options?: {
      listName?: string;
      mode?: "flag" | "block";
      notifyOnMatch?: boolean;
      isEnabled?: boolean;
    },
  ) => Promise<void> | void;
  onUpdateBlockedSite: (
    id: string,
    patch: {
      pattern?: string;
      reason?: string;
      listName?: string;
      mode?: "flag" | "block";
      notifyOnMatch?: boolean;
      isEnabled?: boolean;
    },
  ) => Promise<void> | void;
  onRemoveBlockedSite: (id: string) => Promise<void> | void;
  onBanSession: (
    reason: string,
    durationMinutes: number | null,
    targetSessionId: string,
  ) => Promise<void> | void;
  onReplyTicket: (ticketId: string, body: string, files?: File[]) => Promise<void> | void;
  onMarkTicketRead: (ticketId: string) => Promise<void> | void;
  onCloseTicket: (ticketId: string) => Promise<void> | void;
  onRevokeBan: (banId: string) => Promise<void> | void;
  onDeleteUser: (userId: string) => Promise<void> | void;
  onOpenAdminNotifications?: () => void;
  onSectionChange?: (section: AdminSection) => void;
  onSearchQueryChange?: (query: string) => void;
  onSelectedTicketChange?: (ticketId: string | null) => void;
}

const PAGE_SIZE = 8;
const LOG_PAGE_SIZE = 12;

function matchesSearch(value: string, query: string) {
  return !query || value.toLowerCase().includes(query);
}

function paginate<T>(items: T[], page: number, size: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const currentPage = Math.min(page, totalPages);
  return {
    items: items.slice((currentPage - 1) * size, currentPage * size),
    totalPages,
    currentPage,
  };
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  users,
  sessions,
  logs,
  blockedSites,
  alerts,
  tickets,
  notifications,
  activeBans,
  recentUnbans,
  stats,
  initialSection = "overview",
  initialSearchQuery = "",
  initialSelectedTicketId = null,
  onBack,
  onClose,
  onRefresh,
  onBanUser,
  onPromoteOrDemote,
  onResetPassword,
  onResetTotp,
  onChangeUsername,
  onSendAlert,
  onAddBlockedSite,
  onImportBlockedSites,
  onUpdateBlockedSite,
  onRemoveBlockedSite,
  onBanSession,
  onReplyTicket,
  onMarkTicketRead,
  onCloseTicket,
  onRevokeBan,
  onDeleteUser,
  onOpenAdminNotifications,
  onSectionChange,
  onSearchQueryChange,
  onSelectedTicketChange,
}) => {
  const [section, setSection] = useState<AdminSection>(initialSection);
  const [categoryFilter, setCategoryFilter] = useState<"all" | "flagged" | "regular" | "blocked">("all");
  const [timeframe, setTimeframe] = useState<AdminStats["timeframe"]>("24h");
  const [searchQueryBySection, setSearchQueryBySection] = useState<Record<AdminSection, string>>({
    overview: "",
    logs: initialSection === "logs" ? initialSearchQuery : "",
    people: initialSection === "people" ? initialSearchQuery : "",
    sessions: initialSection === "sessions" ? initialSearchQuery : "",
    tickets: initialSection === "tickets" ? initialSearchQuery : "",
    filters: initialSection === "filters" ? initialSearchQuery : "",
  });
  const [peopleFilter, setPeopleFilter] = useState<"all" | "flagged" | "banned" | "admins">("all");
  const [sessionFilter, setSessionFilter] =
    useState<"all" | "online" | "guest" | "user" | "flagged">("all");
  const [ticketFilter, setTicketFilter] = useState<
    "all" | "open" | "closed" | "unread" | "read" | "support"
  >("open");
  const [peoplePage, setPeoplePage] = useState(1);
  const [sessionsPage, setSessionsPage] = useState(1);
  const [logsPage, setLogsPage] = useState(1);
  const [ticketsPage, setTicketsPage] = useState(1);
  const [banReason, setBanReason] = useState("");
  const [banMinutes, setBanMinutes] = useState("60");
  const [alertTitle, setAlertTitle] = useState("");
  const [alertMessage, setAlertMessage] = useState("");
  const [alertColor, setAlertColor] = useState<BrowserAlert["color"]>("orange");
  const [blockPattern, setBlockPattern] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [blockListName, setBlockListName] = useState("");
  const [blockMode, setBlockMode] = useState<"flag" | "block">("block");
  const [blockNotifyOnMatch, setBlockNotifyOnMatch] = useState(true);
  const [blockImportName, setBlockImportName] = useState("");
  const [blockImportContent, setBlockImportContent] = useState("");
  const [passwordResetValues, setPasswordResetValues] = useState<Record<string, string>>({});
  const [usernameEditValues, setUsernameEditValues] = useState<Record<string, string>>({});
  const [banReasonsByUser, setBanReasonsByUser] = useState<Record<string, string>>({});
  const [banMinutesByUser, setBanMinutesByUser] = useState<Record<string, string>>({});
  const [banReasonsBySession, setBanReasonsBySession] = useState<Record<string, string>>({});
  const [banMinutesBySession, setBanMinutesBySession] = useState<Record<string, string>>({});
  const [ticketReplies, setTicketReplies] = useState<Record<string, string>>({});
  const [ticketReplyFiles, setTicketReplyFiles] = useState<Record<string, File[]>>({});
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(initialSelectedTicketId);
  const [renameTarget, setRenameTarget] = useState<AdminUser | null>(null);
  const [resetPasswordTarget, setResetPasswordTarget] = useState<AdminUser | null>(null);
  const [banUserTarget, setBanUserTarget] = useState<AdminUser | null>(null);
  const [banSessionTarget, setBanSessionTarget] = useState<AdminSession | null>(null);
  const [targetedAlertTarget, setTargetedAlertTarget] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [resetTotpTarget, setResetTotpTarget] = useState<AdminUser | null>(null);
  const [roleChangeTarget, setRoleChangeTarget] = useState<{ user: AdminUser; nextRole: "user" | "admin" } | null>(null);
  const [revokeBanTarget, setRevokeBanTarget] = useState<AdminBanRecord | null>(null);
  const [removeFilterTarget, setRemoveFilterTarget] = useState<{ label: string; entries: BlockedSiteRecord[] } | null>(null);
  const [closeTicketTarget, setCloseTicketTarget] = useState<AdminSupportTicket | null>(null);
  const [rolledTotpSecret, setRolledTotpSecret] = useState<{
    username: string;
    base32: string;
    qrCodeDataUrl: string;
  } | null>(null);
  const [editBlockedSiteTarget, setEditBlockedSiteTarget] = useState<BlockedSiteRecord | null>(null);
  const [editBlockedSiteEntries, setEditBlockedSiteEntries] = useState<BlockedSiteRecord[]>([]);
  const [editBlockedSitePattern, setEditBlockedSitePattern] = useState("");
  const [editBlockedSiteReason, setEditBlockedSiteReason] = useState("");
  const [editBlockedSiteListName, setEditBlockedSiteListName] = useState("");
  const [editBlockedSiteMode, setEditBlockedSiteMode] = useState<"flag" | "block">("block");
  const [editBlockedSiteNotify, setEditBlockedSiteNotify] = useState(true);
  const [editBlockedSiteEnabled, setEditBlockedSiteEnabled] = useState(true);
  const [globalAlertDialogOpen, setGlobalAlertDialogOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [overviewTicketId, setOverviewTicketId] = useState<string | null>(null);
  const [overviewSessionId, setOverviewSessionId] = useState<string | null>(null);

  const searchQuery = searchQueryBySection[section] ?? "";
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const onlineCutoff = Date.now() - 90_000;
  const peopleSearch = section === "people" ? normalizedSearch : "";
  const sessionSearch = section === "sessions" ? normalizedSearch : "";
  const logsSearch = section === "logs" ? normalizedSearch : "";
  const ticketsSearch = section === "tickets" ? normalizedSearch : "";
  const filtersSearch = section === "filters" ? normalizedSearch : "";

  useEffect(() => {
    onSectionChange?.(section);
  }, [onSectionChange, section]);

  useEffect(() => {
    onSearchQueryChange?.(searchQuery);
  }, [onSearchQueryChange, searchQuery]);

  useEffect(() => {
    onSelectedTicketChange?.(selectedTicketId);
  }, [onSelectedTicketChange, selectedTicketId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void onRefresh({ filter: categoryFilter, timeframe });
    }, 5000);
    return () => window.clearInterval(interval);
  }, [categoryFilter, onRefresh, timeframe]);

  useEffect(() => {
    setPeoplePage(1);
    setSessionsPage(1);
    setLogsPage(1);
    setTicketsPage(1);
  }, [peopleSearch, sessionSearch, logsSearch, ticketsSearch, filtersSearch, peopleFilter, sessionFilter, ticketFilter, categoryFilter]);

  useEffect(() => {
    setOverviewTicketId(null);
    setOverviewSessionId(null);
  }, [section]);

  const overviewContextLogs = useMemo(() => {
    if (overviewSessionId) {
      return logs.filter((entry) => entry.session_id === overviewSessionId).slice(0, 30);
    }
    if (overviewTicketId) {
      const ticket = tickets.find((t) => t.id === overviewTicketId);
      if (!ticket) return [];
      return logs
        .filter((entry) => entry.username && entry.username === ticket.owner_username)
        .slice(0, 30);
    }
    return [];
  }, [logs, overviewSessionId, overviewTicketId, tickets]);

  const filteredUsers = useMemo(
    () =>
      [...users]
        .filter((entry) => {
        if (
          peopleSearch &&
          !matchesSearch(entry.username, peopleSearch) &&
          !matchesSearch(entry.role, peopleSearch) &&
          !matchesSearch(entry.id, peopleSearch)
        ) {
          return false;
        }
        if (peopleFilter === "flagged") return entry.flagged_count > 0;
        if (peopleFilter === "banned") return Boolean(entry.active_ban_reason);
        if (peopleFilter === "admins") return entry.role !== "user";
        return true;
        })
        .sort((left, right) => {
          const leftSeen = left.latest_session_last_seen_at ?? 0;
          const rightSeen = right.latest_session_last_seen_at ?? 0;
          if (rightSeen !== leftSeen) return rightSeen - leftSeen;
          return left.username.localeCompare(right.username, undefined, { sensitivity: "base" });
        }),
    [peopleFilter, peopleSearch, users],
  );

  const filteredSessions = useMemo(
    () =>
      [...sessions]
        .filter((entry) => {
        const searchable = `${entry.username ?? "guest"} ${entry.session_id} ${entry.role ?? ""}`;
        if (sessionSearch && !matchesSearch(searchable, sessionSearch)) {
          return false;
        }
        if (sessionFilter === "online") return entry.last_seen_at >= onlineCutoff;
        if (sessionFilter === "guest") return !entry.user_id;
        if (sessionFilter === "user") return Boolean(entry.user_id);
        if (sessionFilter === "flagged") return entry.flagged_count > 0;
        return true;
        })
        .sort((left, right) => {
          if (right.last_seen_at !== left.last_seen_at) return right.last_seen_at - left.last_seen_at;
          const userRank = left.user_id ? 0 : 1;
          const otherUserRank = right.user_id ? 0 : 1;
          if (userRank !== otherUserRank) return userRank - otherUserRank;
          return (left.username ?? left.session_id).localeCompare(right.username ?? right.session_id, undefined, {
            sensitivity: "base",
          });
        }),
    [onlineCutoff, sessionFilter, sessionSearch, sessions],
  );

  const filteredLogs = useMemo(
    () =>
      logs.filter((entry) => {
        if (logsSearch) {
          const searchable = `${entry.hostname} ${entry.url} ${entry.username ?? "guest"} ${entry.session_id}`;
          if (!matchesSearch(searchable, logsSearch)) return false;
        }
        if (categoryFilter === "flagged") return entry.flagged || entry.blocked;
        if (categoryFilter === "blocked") return entry.blocked;
        if (categoryFilter === "regular") return !entry.flagged && !entry.blocked;
        return true;
      }),
    [categoryFilter, logs, logsSearch],
  );

  const filteredActiveBans = useMemo(() => {
    if (!logsSearch) return activeBans;
    return activeBans.filter((ban) => {
      const hay = `${ban.target_username ?? ""} ${ban.target_session_id ?? ""} ${ban.reason} ${ban.id}`;
      return matchesSearch(hay, logsSearch);
    });
  }, [activeBans, logsSearch]);

  const filteredRecentUnbans = useMemo(() => {
    if (!logsSearch) return recentUnbans;
    return recentUnbans.filter((ban) => {
      const hay = `${ban.target_username ?? ""} ${ban.target_session_id ?? ""} ${ban.reason} ${ban.id}`;
      return matchesSearch(hay, logsSearch);
    });
  }, [logsSearch, recentUnbans]);

  const filteredTickets = useMemo(
    () =>
      tickets.filter((entry) => {
        const searchable = `${entry.subject} ${entry.owner_username} ${entry.id}`;
        if (ticketsSearch && !matchesSearch(searchable, ticketsSearch)) {
          return false;
        }
        if (ticketFilter === "open") return entry.status === "open";
        if (ticketFilter === "closed") return entry.status === "closed";
        if (ticketFilter === "unread") return entry.unread_for_admin;
        if (ticketFilter === "read") return !entry.unread_for_admin;
        if (ticketFilter === "support") {
          return (entry.kind ?? "support") === "support";
        }
        return true;
      }),
    [ticketFilter, tickets, ticketsSearch],
  );

  const groupedBlockedSites = useMemo<BlockedSiteListGroup[]>(() => {
    const groups = new Map<string, BlockedSiteListGroup>();
    for (const site of blockedSites) {
      const label = site.list_name?.trim() || site.pattern;
      const key = site.list_name?.trim().toLowerCase() || `single:${site.pattern.toLowerCase()}`;
      const existing = groups.get(key);
      if (existing) {
        existing.entries.push(site);
        existing.searchText += ` ${site.pattern} ${site.reason}`.toLowerCase();
      } else {
        groups.set(key, {
          key,
          label,
          entries: [site],
          searchText: `${label} ${site.pattern} ${site.reason}`.toLowerCase(),
        });
      }
    }
    const values = [...groups.values()]
      .map((group) => ({
        ...group,
        entries: [...group.entries].sort((a, b) => a.pattern.localeCompare(b.pattern)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
    if (!filtersSearch) return values;
    return values.filter((group) => group.searchText.includes(filtersSearch));
  }, [blockedSites, filtersSearch]);

  const globalAlerts = useMemo(
    () => alerts.filter((alert) => !alert.target_user_id),
    [alerts],
  );

  const userAlertsByUserId = useMemo(() => {
    const grouped = new Map<string, BrowserAlert[]>();
    for (const alert of alerts) {
      if (!alert.target_user_id) continue;
      const current = grouped.get(alert.target_user_id) ?? [];
      current.push(alert);
      grouped.set(alert.target_user_id, current);
    }
    return grouped;
  }, [alerts]);

  useEffect(() => {
    if (!selectedTicketId) return;
    if (!tickets.some((ticket) => ticket.id === selectedTicketId)) {
      setSelectedTicketId(null);
    }
  }, [selectedTicketId, tickets]);

  const selectedTicket = selectedTicketId
    ? filteredTickets.find((ticket) => ticket.id === selectedTicketId) ??
      tickets.find((ticket) => ticket.id === selectedTicketId) ??
      null
    : null;

  useEffect(() => {
    if (section !== "tickets" || !selectedTicket?.unread_for_admin) return;
    void onMarkTicketRead(selectedTicket.id);
  }, [onMarkTicketRead, section, selectedTicket]);

  const pagedPeople = paginate(filteredUsers, peoplePage, PAGE_SIZE);
  const pagedSessions = paginate(filteredSessions, sessionsPage, PAGE_SIZE);
  const pagedLogs = paginate(filteredLogs, logsPage, LOG_PAGE_SIZE);
  const pagedTickets = paginate(filteredTickets, ticketsPage, PAGE_SIZE);
  const sessionPreview = filteredSessions.slice(0, 5);
  const logPreview = filteredLogs.slice(0, 6);
  const ticketPreview = filteredTickets.slice(0, 4);

  async function runAction(
    action: () => Promise<void> | void,
    success: string,
    actionId = "action",
  ) {
    setError(null);
    setMessage(null);
    setBusyAction(actionId);
    try {
      await action();
      setMessage(success);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBusyAction(null);
    }
  }

  function openBlockedSiteEditor(site: BlockedSiteRecord, entries: BlockedSiteRecord[] = [site]) {
    setEditBlockedSiteTarget(site);
    setEditBlockedSiteEntries(entries);
    setEditBlockedSitePattern(entries.map((entry) => entry.pattern).join("\n"));
    setEditBlockedSiteReason(site.reason);
    setEditBlockedSiteListName(site.list_name ?? "");
    setEditBlockedSiteMode((site.mode ?? "block") === "flag" ? "flag" : "block");
    setEditBlockedSiteNotify(Boolean(site.notify_on_match ?? 1));
    setEditBlockedSiteEnabled(Boolean(site.is_enabled));
  }

  async function appendBlockedSiteEditImport(files: FileList | null) {
    if (!files || files.length === 0) return;
    const importedChunks = (
      await Promise.all(
        Array.from(files).map(async (file) => {
          try {
            return await file.text();
          } catch {
            return "";
          }
        }),
      )
    )
      .map((content) => content.trim())
      .filter(Boolean);
    if (importedChunks.length === 0) return;
    setEditBlockedSitePattern((current) =>
      [current.trim(), ...importedChunks].filter(Boolean).join("\n"),
    );
  }

  async function copyRolledTotpSecret() {
    if (!rolledTotpSecret) return;
    try {
      await navigator.clipboard.writeText(rolledTotpSecret.base32);
      setMessage("TOTP secret copied.");
    } catch {
      setError("Unable to copy the TOTP secret.");
    }
  }

  function updateSectionSearch(nextSection: AdminSection, query: string) {
    setSearchQueryBySection((current) => ({ ...current, [nextSection]: query }));
  }

  function changeSection(nextSection: AdminSection, query = "") {
    setSection(nextSection);
    updateSectionSearch(nextSection, query);
  }

  const sessionMetricSummary = useMemo(() => {
    const dailyCutoff = Date.now() - 86_400_000;
    const dailyUserIds = new Set<string>();
    const dailyGuestSessionIds = new Set<string>();
    let loggedInSessions = 0;

    for (const entry of sessions) {
      if (entry.user_id) {
        loggedInSessions += 1;
        if (entry.last_seen_at >= dailyCutoff) {
          dailyUserIds.add(entry.user_id);
        }
      } else if (entry.last_seen_at >= dailyCutoff) {
        dailyGuestSessionIds.add(entry.session_id);
      }
    }

    return {
      totalSessions: sessions.length,
      loggedInSessions,
      guestSessions: sessions.length - loggedInSessions,
      dailyActiveUsers: dailyUserIds.size,
      dailyActiveGuests: dailyGuestSessionIds.size,
    };
  }, [sessions]);

  const overviewMetrics = [
    {
      icon: Globe,
      label: "Total Sessions",
      value: sessionMetricSummary.totalSessions,
      detail: `${sessionMetricSummary.loggedInSessions} logged in • ${sessionMetricSummary.guestSessions} guests`,
    },
    {
      icon: Users,
      label: "Daily Active",
      value: sessionMetricSummary.dailyActiveUsers,
      detail: `${sessionMetricSummary.dailyActiveGuests} guest sessions`,
    },
    {
      icon: Ban,
      label: "Active Bans",
      value: stats?.activeBans ?? filteredActiveBans.length,
      detail: `${filteredRecentUnbans.length} recent unbans`,
    },
    {
      icon: UserCog,
      label: "Flagged Users",
      value: users.filter((entry) => entry.flagged_count > 0).length,
      detail: `${users.length} total users`,
    },
    {
      icon: BarChart3,
      label: "Logs",
      value: stats?.totalLogs24h ?? logs.length,
      detail: `${stats?.flaggedLogs24h ?? logs.filter((entry) => entry.flagged).length} flagged`,
    },
    {
      icon: LifeBuoy,
      label: "Open Tickets",
      value: tickets.filter((entry) => entry.status === "open").length,
      detail: `${tickets.filter((entry) => entry.unread_for_admin).length} unread`,
    },
  ];

  const searchPlaceholder =
    section === "people"
      ? "Search users"
      : section === "sessions"
        ? "Search sessions"
        : section === "tickets"
          ? "Search tickets"
          : section === "filters"
            ? "Search filter lists"
            : section === "logs"
              ? "Search logs"
              : "";

  return (
    <div className="fixed inset-0 z-[280] bg-background/95 backdrop-blur-sm">
      <div className="h-full w-full p-4">
        <div className="flex h-full flex-col overflow-hidden rounded-[2rem] border border-border bg-card shadow-2xl">
          <div className="border-b border-border bg-background/40 px-8 py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 text-xl font-semibold">
                  {onBack ? (
                    <Button variant="secondary" size="sm" onClick={onBack}>
                      <ArrowLeft className="mr-1 h-4 w-4" />
                      Back
                    </Button>
                  ) : null}
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    Admin Control Center
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-full border border-border bg-background/70 px-3 py-2 text-[11px] text-muted-foreground">
                  Auto-refresh every 5s
                </div>
                {onOpenAdminNotifications ? (
                  <Button variant="secondary" onClick={onOpenAdminNotifications}>
                    <BellRing className="mr-1 h-3.5 w-3.5" />
                    Notifications ({notifications.filter((entry) => entry.unread).length})
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  disabled={busyAction === "refresh"}
                  onClick={() =>
                    void runAction(
                      () => onRefresh({ filter: categoryFilter, timeframe }),
                      "Admin data refreshed.",
                      "refresh",
                    )
                  }
                >
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                  {busyAction === "refresh" ? "Refreshing..." : "Refresh"}
                </Button>
                <button
                  onClick={onClose}
                  className="rounded-lg p-2 transition-colors hover:bg-chrome-hover"
                  title="Close admin panel"
                  aria-label="Close admin panel"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {(message || error) && (
            <div className={`px-6 py-3 text-sm ${error ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
              {error ?? message}
            </div>
          )}

          <div className="border-b border-border bg-background/30 px-8 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <SectionTab icon={LayoutDashboard} label="Overview" active={section === "overview"} onClick={() => changeSection("overview")} />
              <SectionTab icon={ListTree} label="Logs" active={section === "logs"} onClick={() => changeSection("logs")} />
              <SectionTab icon={Users} label="People" active={section === "people"} onClick={() => changeSection("people")} />
              <SectionTab icon={Globe} label="Sessions" active={section === "sessions"} onClick={() => changeSection("sessions")} />
              <SectionTab icon={LifeBuoy} label="Tickets" active={section === "tickets"} onClick={() => changeSection("tickets")} />
              <SectionTab icon={Upload} label="Filters" active={section === "filters"} onClick={() => changeSection("filters")} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {section !== "overview" ? (
                <Input
                  value={searchQuery}
                  onChange={(event) => updateSectionSearch(section, event.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-64"
                />
              ) : null}
              {section === "logs" ? (
                <select
                  value={categoryFilter}
                  onChange={(event) =>
                    setCategoryFilter(event.target.value as "all" | "flagged" | "regular" | "blocked")
                  }
                  className="rounded-lg border border-border bg-secondary px-3 py-2 text-xs text-foreground outline-none"
                >
                  <option value="all">All visits</option>
                  <option value="flagged">Flagged</option>
                  <option value="regular">Regular only</option>
                  <option value="blocked">Blocked</option>
                </select>
              ) : null}
              {section === "overview" || section === "logs" ? (
                <select
                  value={timeframe}
                  onChange={(event) => setTimeframe(event.target.value as AdminStats["timeframe"])}
                  className="rounded-lg border border-border bg-secondary px-3 py-2 text-xs text-foreground outline-none"
                >
                  <option value="24h">24 hours</option>
                  <option value="7d">7 days</option>
                  <option value="30d">30 days</option>
                </select>
              ) : null}
              <div className="rounded-full border border-border px-3 py-2 text-[11px] text-muted-foreground">
                {section === "people"
                  ? `${filteredUsers.length} users`
                  : section === "sessions"
                    ? `${filteredSessions.length} sessions`
                    : section === "tickets"
                      ? `${filteredTickets.length} tickets`
                      : section === "filters"
                        ? `${groupedBlockedSites.length} lists`
                        : `${filteredLogs.length} logs`}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-8">
            {section === "overview" && (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {overviewMetrics.map((item) => (
                    <MetricCard key={item.label} icon={item.icon} label={item.label} value={item.value} detail={item.detail} />
                  ))}
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                  <div className="space-y-6">
                    <PanelCard title="Activity Trend" icon={BarChart3}>
                      <ActivityChart points={stats?.activitySeries ?? []} />
                    </PanelCard>

                    <PanelCard title="Announcements" icon={AlertTriangle}>
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/40 px-4 py-3">
                          <div className="text-sm font-medium">New alert</div>
                          <Button
                            className="shrink-0"
                            disabled={busyAction === "send-global-alert"}
                            onClick={() => setGlobalAlertDialogOpen(true)}
                          >
                            Send Global Alert
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {globalAlerts.slice(0, 4).map((alert) => (
                            <div key={alert.id} className="rounded-2xl border border-border bg-card/40 px-4 py-3 text-xs">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="font-medium">{alert.title}</div>
                                  <StatusPill tone="default">Global alert</StatusPill>
                                </div>
                                <div className="mt-1 text-muted-foreground">{alert.message}</div>
                                <div className="mt-2 text-[11px] text-muted-foreground">
                                  Sent {formatRelativeTime(alert.created_at)}
                                  {alert.created_by_username ? ` by ${alert.created_by_username}` : ""}
                                </div>
                              </div>
                            </div>
                          ))}
                          {globalAlerts.length === 0 ? <EmptyText text="No global alerts sent yet." /> : null}
                        </div>
                      </div>
                    </PanelCard>

                    <PanelCard title="Filter Lists" icon={Globe}>
                      <div className="space-y-3">
                        <div className="text-xs text-muted-foreground">
                          {groupedBlockedSites.length} lists
                        </div>
                        <div className="max-h-56 space-y-2 overflow-y-auto rounded-xl border border-border bg-card/30 p-3">
                          {groupedBlockedSites.slice(0, 6).map((group) => (
                            <div
                              key={group.key}
                              className="rounded-lg border border-border/60 bg-background/40 px-3 py-3 text-xs"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate font-medium">{group.label}</span>
                                <StatusPill tone={(group.entries[0]?.mode ?? "block") === "block" ? "danger" : "warning"}>
                                  {(group.entries[0]?.mode ?? "block") === "block" ? "Block" : "Flag"}
                                </StatusPill>
                              </div>
                              <div className="mt-1 text-muted-foreground">
                                {group.entries.length} domain{group.entries.length === 1 ? "" : "s"} • notifications{" "}
                                {(group.entries[0]?.notify_on_match ?? 1) ? "on" : "off"}
                              </div>
                            </div>
                          ))}
                          {groupedBlockedSites.length === 0 ? (
                            <div className="text-xs text-muted-foreground">No lists yet.</div>
                          ) : null}
                        </div>
                        <Button variant="secondary" className="w-full" onClick={() => changeSection("filters")}>
                          Open Filters page
                        </Button>
                      </div>
                    </PanelCard>
                  </div>

                  <div className="space-y-6">
                    <PanelCard title="Support Queue" icon={LifeBuoy}>
                      <div className="space-y-3">
                        {ticketPreview.map((ticket) => (
                          <button
                            key={ticket.id}
                            type="button"
                            onClick={() => {
                              setSelectedTicketId(ticket.id);
                              changeSection("tickets");
                            }}
                            className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                              selectedTicketId === ticket.id
                                ? "border-primary bg-primary/10"
                                : "border-border bg-card/40 hover:border-primary/40"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="text-sm font-medium">{ticket.subject}</div>
                                <div className="mt-1 text-[11px] text-muted-foreground">
                                  {ticket.owner_username} • {formatRelativeTime(ticket.updated_at)}
                                </div>
                              </div>
                              {ticket.unread_for_admin && <StatusPill tone="info">Unread</StatusPill>}
                            </div>
                          </button>
                        ))}
                      </div>
                    </PanelCard>

                    <PanelCard title="Session Snapshot" icon={Globe}>
                      <div className="space-y-3">
                        {sessionPreview.map((entry) => (
                          <SessionRow
                            key={entry.session_id}
                            entry={entry}
                            onlineCutoff={onlineCutoff}
                            selected={overviewSessionId === entry.session_id}
                            onSelect={() => {
                              setOverviewSessionId(entry.session_id);
                              setOverviewTicketId(null);
                            }}
                          />
                        ))}
                      </div>
                    </PanelCard>

                    <PanelCard title="Recent Activity" icon={ListTree}>
                      <div className="space-y-3">
                        {logPreview.map((entry) => (
                          <LogCard key={entry.id} entry={entry} />
                        ))}
                      </div>
                    </PanelCard>

                    <PanelCard title="Ban Summary" icon={Ban}>
                      <div className="space-y-3">
                        <div className="text-xs text-muted-foreground">
                          {filteredActiveBans.length} active bans (search) • {filteredRecentUnbans.length} recent unbans
                        </div>
                        {filteredActiveBans.slice(0, 3).map((ban) => (
                          <BanCard
                            key={ban.id}
                            ban={ban}
                            onRevoke={() => setRevokeBanTarget(ban)}
                            revokeBusy={busyAction === `revoke-ban-${ban.id}`}
                          />
                        ))}
                      </div>
                    </PanelCard>
                  </div>
                </div>

                {(overviewTicketId || overviewSessionId) && (
                  <PanelCard
                    title={
                      overviewSessionId
                        ? `Logs for session ${overviewSessionId.slice(0, 8)}…`
                        : "Logs for ticket owner"
                    }
                    icon={ListTree}
                  >
                    {overviewContextLogs.length === 0 ? (
                      <div className="text-xs text-muted-foreground">
                        No matching log entries in the current dataset. Try another ticket or session, or open the full Logs tab.
                      </div>
                    ) : (
                      <div className="max-h-72 space-y-2 overflow-y-auto">
                        {overviewContextLogs.map((entry) => (
                          <LogCard key={entry.id} entry={entry} />
                        ))}
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setOverviewTicketId(null);
                          setOverviewSessionId(null);
                        }}
                      >
                        Clear selection
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => changeSection("logs")}>
                        Open Logs tab
                      </Button>
                    </div>
                  </PanelCard>
                )}
              </div>
            )}

            {section === "people" && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <FilterChip label="All" active={peopleFilter === "all"} onClick={() => setPeopleFilter("all")} />
                  <FilterChip label="Flagged" active={peopleFilter === "flagged"} onClick={() => setPeopleFilter("flagged")} />
                  <FilterChip label="Banned" active={peopleFilter === "banned"} onClick={() => setPeopleFilter("banned")} />
                  <FilterChip label="Admins" active={peopleFilter === "admins"} onClick={() => setPeopleFilter("admins")} />
                </div>

                {pagedPeople.items.map((entry) => (
                  <div key={entry.id} className="rounded-3xl border border-border bg-background/60 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 text-base font-semibold">
                          {entry.username}
                          <StatusPill tone={entry.role === "user" ? "default" : "info"}>{entry.role}</StatusPill>
                          {entry.active_ban_reason && <StatusPill tone="danger">Banned</StatusPill>}
                          {entry.flagged_count > 0 && <StatusPill tone="warning">{entry.flagged_count} flagged</StatusPill>}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          TOTP: {entry.totp_enabled ? "enabled" : "disabled"} • created {new Date(entry.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="text-[11px] text-muted-foreground">ID: {entry.id}</div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setUsernameEditValues((current) => ({ ...current, [entry.id]: current[entry.id] ?? entry.username }));
                          setRenameTarget(entry);
                        }}
                      >
                        Rename
                      </Button>
                      <Button variant="secondary" onClick={() => setResetPasswordTarget(entry)}>Reset Password</Button>
                      <Button
                        variant="secondary"
                        disabled={entry.role === "master_admin"}
                        onClick={() =>
                          setRoleChangeTarget({
                            user: entry,
                            nextRole: entry.role === "user" ? "admin" : "user",
                          })
                        }
                      >
                        {entry.role === "user" ? "Promote" : "Demote"}
                      </Button>
                      <Button
                        variant="secondary"
                        disabled={entry.role === "master_admin"}
                        onClick={() => setResetTotpTarget(entry)}
                      >
                        Reset TOTP
                      </Button>
                      <Button
                        variant={entry.active_ban_reason ? "secondary" : "destructive"}
                        disabled={entry.role === "master_admin"}
                        onClick={() => {
                          const activeBan = activeBans.find((ban) => ban.target_user_id === entry.id);
                          if (activeBan) {
                            setRevokeBanTarget(activeBan);
                            return;
                          }
                          if (entry.active_ban_reason) {
                            return;
                          }
                          setBanReasonsByUser((current) => ({ ...current, [entry.id]: current[entry.id] ?? banReason }));
                          setBanMinutesByUser((current) => ({ ...current, [entry.id]: current[entry.id] ?? banMinutes }));
                          setBanUserTarget(entry);
                        }}
                      >
                        {entry.active_ban_reason ? "Unban User" : "Ban User"}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setTargetedAlertTarget(entry)}
                      >
                        Send User Alert
                      </Button>
                      <Button
                        variant="destructive"
                        disabled={entry.role !== "user"}
                        onClick={() => setDeleteTarget(entry)}
                      >
                        Delete user
                      </Button>
                    </div>
                    <div className="mt-4 rounded-2xl border border-border bg-card/30 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium">User Alerts</div>
                        <div className="text-[11px] text-muted-foreground">
                          {(userAlertsByUserId.get(entry.id) ?? []).length} sent
                        </div>
                      </div>
                      <div className="mt-3 space-y-2">
                        {(userAlertsByUserId.get(entry.id) ?? []).slice(0, 3).map((alert) => (
                          <div key={alert.id} className="rounded-2xl border border-border bg-background/50 px-4 py-3 text-xs">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="font-medium">{alert.title}</div>
                              <StatusPill tone="info">User alert</StatusPill>
                            </div>
                            <div className="mt-1 text-muted-foreground">{alert.message}</div>
                            <div className="mt-2 text-[11px] text-muted-foreground">
                              Sent {formatRelativeTime(alert.created_at)}
                              {alert.created_by_username ? ` by ${alert.created_by_username}` : ""}
                            </div>
                          </div>
                        ))}
                        {(userAlertsByUserId.get(entry.id) ?? []).length === 0 ? (
                          <div className="text-xs text-muted-foreground">No user alerts sent yet.</div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}

                <PaginationBar page={pagedPeople.currentPage} totalPages={pagedPeople.totalPages} onChange={setPeoplePage} />
              </div>
            )}

            {section === "sessions" && (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <MetricCard icon={Globe} label="Total Sessions" value={sessionMetricSummary.totalSessions} detail={`${sessionMetricSummary.loggedInSessions} logged in`} />
                  <MetricCard icon={Users} label="Guest Sessions" value={sessionMetricSummary.guestSessions} detail="Guests can be banned directly" />
                  <MetricCard icon={UserCog} label="Daily Active Users" value={sessionMetricSummary.dailyActiveUsers} detail={`${sessionMetricSummary.dailyActiveGuests} guest sessions today`} />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <FilterChip label="All" active={sessionFilter === "all"} onClick={() => setSessionFilter("all")} />
                  <FilterChip label="Online" active={sessionFilter === "online"} onClick={() => setSessionFilter("online")} />
                  <FilterChip label="Guests" active={sessionFilter === "guest"} onClick={() => setSessionFilter("guest")} />
                  <FilterChip label="Signed In" active={sessionFilter === "user"} onClick={() => setSessionFilter("user")} />
                  <FilterChip label="Flagged" active={sessionFilter === "flagged"} onClick={() => setSessionFilter("flagged")} />
                </div>

                {pagedSessions.items.map((entry) => (
                  <div key={entry.session_id} className="rounded-3xl border border-border bg-background/60 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 text-base font-semibold">
                          {entry.username ?? "Guest session"}
                          <StatusPill tone={entry.last_seen_at >= onlineCutoff ? "success" : "default"}>
                            {entry.last_seen_at >= onlineCutoff ? "Online now" : `Last seen ${formatRelativeTime(entry.last_seen_at)}`}
                          </StatusPill>
                          {entry.active_ban_reason && <StatusPill tone="danger">Banned</StatusPill>}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {entry.user_id ? `User role: ${entry.role}` : "Guest"} • {entry.flagged_count} flagged visits • opened {new Date(entry.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="max-w-[24rem] text-right text-[11px] text-muted-foreground">
                        <div className="font-mono" title={entry.session_id}>
                          {entry.session_id.slice(0, 8)}…
                        </div>
                        <button
                          type="button"
                          className="mt-1 text-primary hover:underline"
                          onClick={() => void navigator.clipboard.writeText(entry.session_id)}
                        >
                          Copy full ID
                        </button>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {entry.user_id ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="gap-2"
                          onClick={() => {
                            changeSection("people", entry.username ?? entry.user_id ?? "");
                            setPeopleFilter("all");
                          }}
                        >
                          <UserCog className="h-4 w-4" />
                          Open in People
                        </Button>
                      ) : null}
                    </div>
                    <div className="mt-4">
                      <Button
                        variant={entry.active_ban_id ? "secondary" : "destructive"}
                        disabled={Boolean(entry.active_ban_reason && !entry.active_ban_id)}
                        onClick={() => {
                          if (entry.active_ban_id) {
                            const activeBan = activeBans.find((ban) => ban.id === entry.active_ban_id);
                            if (activeBan) {
                              setRevokeBanTarget(activeBan);
                            }
                            return;
                          }
                          setBanReasonsBySession((current) => ({ ...current, [entry.session_id]: current[entry.session_id] ?? banReason }));
                          setBanMinutesBySession((current) => ({ ...current, [entry.session_id]: current[entry.session_id] ?? banMinutes }));
                          setBanSessionTarget(entry);
                        }}
                      >
                        {entry.active_ban_reason ? "Unban Session" : "Ban Session"}
                      </Button>
                    </div>
                  </div>
                ))}

                <PaginationBar page={pagedSessions.currentPage} totalPages={pagedSessions.totalPages} onChange={setSessionsPage} />
              </div>
            )}

            {section === "logs" && (
              <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">Live Website Logs</div>
                    <div className="text-xs text-muted-foreground">
                      Showing page {pagedLogs.currentPage} of {pagedLogs.totalPages}
                    </div>
                  </div>
                  {pagedLogs.items.map((entry) => (
                    <LogCard key={entry.id} entry={entry} />
                  ))}
                  <PaginationBar page={pagedLogs.currentPage} totalPages={pagedLogs.totalPages} onChange={setLogsPage} />
                </div>

                <div className="space-y-6">
                  <PanelCard title="Active Bans" icon={Ban}>
                    <div className="space-y-3">
                      {activeBans.length === 0 ? (
                        <EmptyText text="No active bans." />
                      ) : (
                        activeBans.slice(0, 8).map((ban) => (
                          <BanCard
                            key={ban.id}
                            ban={ban}
                            onRevoke={() => setRevokeBanTarget(ban)}
                            revokeBusy={busyAction === `revoke-ban-${ban.id}`}
                          />
                        ))
                      )}
                    </div>
                  </PanelCard>

                  <PanelCard title="Recent Unbans" icon={RefreshCw}>
                    <div className="space-y-3">
                      {recentUnbans.length === 0 ? (
                        <EmptyText text="No recent unbans." />
                      ) : (
                        recentUnbans.slice(0, 8).map((ban) => <BanCard key={ban.id} ban={ban} showRevoked />)
                      )}
                    </div>
                  </PanelCard>

                  <PanelCard title="Active Tickets" icon={LifeBuoy}>
                    <div className="space-y-3">
                      {tickets.filter((ticket) => ticket.status === "open").slice(0, 6).map((ticket) => (
                        <button
                          key={ticket.id}
                          type="button"
                          onClick={() => {
                            setSelectedTicketId(ticket.id);
                            changeSection("tickets");
                          }}
                          className="w-full rounded-2xl border border-border bg-card/40 px-4 py-3 text-left transition-colors hover:border-primary/40"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium">{ticket.subject}</div>
                              <div className="mt-1 text-[11px] text-muted-foreground">
                                {ticket.owner_username} • {formatRelativeTime(ticket.updated_at)}
                              </div>
                            </div>
                            {ticket.unread_for_admin && <StatusPill tone="info">Unread</StatusPill>}
                          </div>
                        </button>
                      ))}
                    </div>
                  </PanelCard>

                  <PanelCard title="Blocking Rules" icon={Globe}>
                    <div className="space-y-3">
                      {blockedSites.slice(0, 8).map((site) => (
                        <div key={site.id} className="rounded-2xl border border-border bg-background/60 px-4 py-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-medium">{site.pattern}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {site.reason} {site.username ? `• ${site.username}` : "• Global"}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setRemoveFilterTarget({
                                  label: site.list_name ?? site.pattern,
                                  entries: [site],
                                })
                              }
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </PanelCard>
                </div>
              </div>
            )}

            {section === "filters" && (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-3">
                  <MetricCard icon={Globe} label="Total Rules" value={blockedSites.length} detail="Enabled filter records" />
                  <MetricCard icon={Ban} label="Blocking" value={blockedSites.filter((site) => (site.mode ?? "block") === "block").length} detail="Immediately blocked visits" />
                  <MetricCard icon={AlertTriangle} label="Notify Admin" value={blockedSites.filter((site) => Boolean(site.notify_on_match)).length} detail="Rules that create admin activity alerts" />
                </div>

                <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                  <PanelCard title="Create or Import Filter List" icon={Upload}>
                    <div className="space-y-3">
                      <Input placeholder="List name, e.g. Social" value={blockListName} onChange={(event) => setBlockListName(event.target.value)} />
                      <textarea
                        value={blockPattern}
                        onChange={(event) => setBlockPattern(event.target.value)}
                        placeholder={"Enter one domain per line, e.g.\nexample.com\nexample.org"}
                        className="min-h-28 w-full rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/50"
                      />
                      <Input placeholder="Reason shown to users/admins" value={blockReason} onChange={(event) => setBlockReason(event.target.value)} />
                      <div className="grid gap-3 md:grid-cols-2">
                        <select
                          value={blockMode}
                          onChange={(event) => setBlockMode(event.target.value as "flag" | "block")}
                          className="rounded-lg border border-border bg-secondary px-3 py-2 text-xs text-foreground outline-none"
                        >
                          <option value="block">Block visit</option>
                          <option value="flag">Flag only</option>
                        </select>
                        <label className="flex items-center justify-between rounded-lg border border-border bg-background/60 px-3 py-2 text-xs">
                          <span>Admin notifications</span>
                          <input
                            type="checkbox"
                            checked={blockNotifyOnMatch}
                            onChange={(event) => setBlockNotifyOnMatch(event.target.checked)}
                          />
                        </label>
                      </div>
                      <Button
                        className="w-full"
                        disabled={busyAction === "add-blocked-site"}
                        onClick={() =>
                          void runAction(
                            async () => {
                              const patterns = blockPattern
                                .split(/\r?\n/)
                                .map((entry) => entry.trim())
                                .filter(Boolean);
                              const sharedOptions = {
                                listName: blockListName || undefined,
                                mode: blockMode,
                                notifyOnMatch: blockNotifyOnMatch,
                                isEnabled: true,
                              } as const;
                              if (patterns.length > 1) {
                                await onImportBlockedSites(
                                  blockReason || "Manual filter list",
                                  patterns.join("\n"),
                                  undefined,
                                  sharedOptions,
                                );
                              } else {
                                await onAddBlockedSite(patterns[0] ?? blockPattern, blockReason, undefined, sharedOptions);
                              }
                              setBlockPattern("");
                              setBlockReason("");
                              setBlockImportContent("");
                              setBlockImportName("");
                            },
                            "Filter rule saved.",
                            "add-blocked-site",
                          )
                        }
                      >
                        Add rule
                      </Button>
                      <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border bg-card/50 px-3 py-3 text-xs text-muted-foreground">
                        <Upload className="h-4 w-4" />
                        <span>{blockImportName || "Upload a newline-separated domain list"}</span>
                        <input
                          type="file"
                          className="hidden"
                          accept=".txt,.csv"
                          onChange={async (event) => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            setBlockImportName(file.name);
                            setBlockImportContent(await file.text());
                            if (!blockListName.trim()) {
                              setBlockListName(file.name.replace(/\.[^.]+$/, ""));
                            }
                          }}
                        />
                      </label>
                      <Button
                        variant="secondary"
                        className="w-full"
                        disabled={busyAction === "import-blocked-sites" || !blockImportContent}
                        onClick={() =>
                          void runAction(
                            async () => {
                              await onImportBlockedSites(blockReason || "Imported filter rule", blockImportContent, undefined, {
                                listName: blockListName || blockImportName || undefined,
                                mode: blockMode,
                                notifyOnMatch: blockNotifyOnMatch,
                                isEnabled: true,
                              });
                              setBlockImportContent("");
                              setBlockImportName("");
                            },
                            "Filter list imported.",
                            "import-blocked-sites",
                          )
                        }
                      >
                        Import list
                      </Button>
                    </div>
                  </PanelCard>

                  <PanelCard title="Filter Lists" icon={Globe}>
                    <div className="max-h-[34rem] space-y-3 overflow-y-auto pr-1">
                      {groupedBlockedSites.length === 0 ? (
                        <EmptyText text="No filters yet." />
                      ) : (
                        groupedBlockedSites.map((group) => (
                          <div key={group.key} className="rounded-2xl border border-border bg-background/60 px-4 py-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="font-medium">{group.label}</div>
                                  <StatusPill tone={(group.entries[0]?.mode ?? "block") === "block" ? "danger" : "warning"}>
                                    {(group.entries[0]?.mode ?? "block") === "block" ? "Block" : "Flag"}
                                  </StatusPill>
                                  {group.entries.some((entry) => !entry.is_enabled) ? <StatusPill tone="default">Has disabled rules</StatusPill> : null}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {group.entries.length} domain{group.entries.length === 1 ? "" : "s"} • notifications{" "}
                                  {(group.entries[0]?.notify_on_match ?? 1) ? "on" : "off"}
                                </div>
                                <div className="mt-3 max-h-28 overflow-y-auto rounded-xl border border-border/70 bg-background/50 p-3 font-mono text-[11px] text-foreground/80">
                                  {group.entries.map((entry) => (
                                    <div key={entry.id} className="truncate">
                                      {entry.pattern}
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button variant="secondary" size="sm" onClick={() => openBlockedSiteEditor(group.entries[0], group.entries)}>
                                  Edit
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() =>
                                    void runAction(
                                      async () => {
                                        await Promise.all(
                                          group.entries.map((entry) =>
                                            onUpdateBlockedSite(entry.id, { isEnabled: !group.entries.every((item) => Boolean(item.is_enabled)) }),
                                          ),
                                        );
                                      },
                                      group.entries.every((entry) => Boolean(entry.is_enabled)) ? "List disabled." : "List enabled.",
                                      `toggle-block-${group.key}`,
                                    )
                                  }
                                >
                                  {group.entries.every((entry) => Boolean(entry.is_enabled)) ? "Disable" : "Enable"}
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() =>
                                    void runAction(
                                      async () => {
                                        await Promise.all(
                                          group.entries.map((entry) =>
                                            onUpdateBlockedSite(entry.id, { notifyOnMatch: !group.entries.every((item) => Boolean(item.notify_on_match ?? 1)) }),
                                          ),
                                        );
                                      },
                                      group.entries.every((entry) => Boolean(entry.notify_on_match ?? 1))
                                        ? "List notifications disabled."
                                        : "List notifications enabled.",
                                      `toggle-notify-${group.key}`,
                                    )
                                  }
                                >
                                  Notify {group.entries.every((entry) => Boolean(entry.notify_on_match ?? 1)) ? "Off" : "On"}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setRemoveFilterTarget({ label: group.label, entries: group.entries })}
                                >
                                  Remove
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </PanelCard>
                </div>
              </div>
            )}

            {section === "tickets" && (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <MetricCard icon={LifeBuoy} label="Open Tickets" value={tickets.filter((ticket) => ticket.status === "open").length} detail="User support threads" />
                  <MetricCard icon={MessageSquare} label="Unread Threads" value={tickets.filter((ticket) => ticket.unread_for_admin).length} detail="Needs admin attention" />
                  <MetricCard icon={Users} label="Total Threads" value={tickets.length} detail="All support tickets" />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <FilterChip label="Open" active={ticketFilter === "open"} onClick={() => setTicketFilter("open")} />
                  <FilterChip label="Closed" active={ticketFilter === "closed"} onClick={() => setTicketFilter("closed")} />
                  <FilterChip label="Unread" active={ticketFilter === "unread"} onClick={() => setTicketFilter("unread")} />
                  <FilterChip label="Read" active={ticketFilter === "read"} onClick={() => setTicketFilter("read")} />
                  <FilterChip label="Support" active={ticketFilter === "support"} onClick={() => setTicketFilter("support")} />
                  <FilterChip label="All" active={ticketFilter === "all"} onClick={() => setTicketFilter("all")} />
                </div>
                <div className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
                  <div className="space-y-3">
                    {pagedTickets.items.map((ticket) => (
                      <button
                        key={ticket.id}
                        type="button"
                        onClick={() => setSelectedTicketId(ticket.id)}
                        className={`w-full rounded-3xl border px-4 py-4 text-left transition-colors ${selectedTicket?.id === ticket.id ? "border-primary bg-primary/10" : "border-border bg-background/60 hover:border-primary/40"}`}
                      >
                        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                          <span>{ticket.subject}</span>
                          <StatusPill tone="default">Support</StatusPill>
                          {ticket.unread_for_admin ? <StatusPill tone="info">Unread</StatusPill> : null}
                          <StatusPill tone={ticket.status === "open" ? "success" : "default"}>{ticket.status}</StatusPill>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {ticket.owner_username} • updated {formatRelativeTime(ticket.updated_at)}
                        </div>
                      </button>
                    ))}
                    <PaginationBar page={pagedTickets.currentPage} totalPages={pagedTickets.totalPages} onChange={setTicketsPage} />
                  </div>

                  <div className="rounded-3xl border border-border bg-background/60 p-5">
                    {selectedTicket ? (
                      <>
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <div className="flex flex-wrap items-center gap-2 text-base font-semibold">
                              <span>{selectedTicket.subject}</span>
                              <StatusPill tone="default">Support</StatusPill>
                              {selectedTicket.unread_for_admin ? <StatusPill tone="info">Unread</StatusPill> : null}
                              <StatusPill tone={selectedTicket.status === "open" ? "success" : "default"}>{selectedTicket.status}</StatusPill>
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {selectedTicket.owner_username} • updated {formatRelativeTime(selectedTicket.updated_at)}
                            </div>
                            {selectedTicket.related_url ? (
                              <div className="mt-1 break-all text-[11px] text-muted-foreground">
                                URL: {selectedTicket.related_url}
                              </div>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedTicketId(null)}
                            >
                              Close view
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() =>
                                void runAction(
                                  () => onMarkTicketRead(selectedTicket.id),
                                  "Ticket marked read.",
                                  `ticket-read-${selectedTicket.id}`,
                                )
                              }
                            >
                              Mark read
                            </Button>
                            {selectedTicket.status === "open" ? (
                              <Button variant="secondary" size="sm" onClick={() => setCloseTicketTarget(selectedTicket)}>
                                Close ticket
                              </Button>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-4 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
                          {selectedTicket.messages.map((entry) => (
                            <div key={entry.id} className={`rounded-2xl px-4 py-3 text-sm ${entry.author_role === "user" ? "border border-border bg-card/40" : "border border-primary/25 bg-primary/10"}`}>
                              <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium text-muted-foreground">
                                <StatusPill tone={entry.author_role === "user" ? "default" : "info"}>
                                  {entry.author_role === "user" ? "User" : "Staff"}
                                </StatusPill>
                                <span>
                                  {entry.author_username ?? (entry.author_role === "user" ? selectedTicket.owner_username : "Admin")} • {new Date(entry.created_at).toLocaleString()}
                                </span>
                              </div>
                              <div className="mt-2 whitespace-pre-wrap text-foreground/90">{entry.body}</div>
                              {entry.attachments && entry.attachments.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {entry.attachments.map((a) => (
                                    <a
                                      key={a.id}
                                      href={a.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-[11px] text-primary underline"
                                    >
                                      {a.original_name}
                                    </a>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                          <textarea
                            value={ticketReplies[selectedTicket.id] ?? ""}
                            onChange={(event) => setTicketReplies((current) => ({ ...current, [selectedTicket.id]: event.target.value }))}
                            placeholder="Reply to this ticket"
                            className="min-h-24 w-full rounded-lg border border-border bg-secondary px-3 py-2.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-primary/50"
                          />
                          <input
                            type="file"
                            multiple
                            className="block w-full text-[11px] text-muted-foreground file:mr-2 file:rounded file:border-0 file:bg-primary/15 file:px-2 file:py-1 file:text-xs"
                            onChange={(event) =>
                              setTicketReplyFiles((current) => ({
                                ...current,
                                [selectedTicket.id]: event.target.files ? Array.from(event.target.files) : [],
                              }))
                            }
                          />
                          <Button
                            className="self-start"
                            disabled={busyAction === `reply-ticket-${selectedTicket.id}`}
                            onClick={() =>
                              void runAction(
                                async () => {
                                  const files = ticketReplyFiles[selectedTicket.id];
                                  await onReplyTicket(
                                    selectedTicket.id,
                                    ticketReplies[selectedTicket.id] ?? "",
                                    files && files.length > 0 ? files : undefined,
                                  );
                                  setTicketReplies((current) => ({ ...current, [selectedTicket.id]: "" }));
                                  setTicketReplyFiles((current) => ({ ...current, [selectedTicket.id]: [] }));
                                },
                                "Ticket reply sent.",
                                `reply-ticket-${selectedTicket.id}`,
                              )
                            }
                          >
                            Reply
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="flex min-h-[20rem] items-center justify-center rounded-2xl border border-dashed border-border bg-card/20 px-6 text-center">
                        <div>
                          <div className="text-sm font-medium">Select a ticket</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Choose a thread from the list before opening messages or replying.
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={globalAlertDialogOpen} onOpenChange={setGlobalAlertDialogOpen}>
        <DialogContent className="max-w-lg rounded-3xl border-border">
          <DialogHeader>
            <DialogTitle>Send Global Alert</DialogTitle>
            <DialogDescription>Send to everyone.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Alert title" value={alertTitle} onChange={(event) => setAlertTitle(event.target.value)} />
            <textarea
              value={alertMessage}
              onChange={(event) => setAlertMessage(event.target.value)}
              placeholder="Alert message"
              className="h-28 w-full rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/50"
            />
            <select
              value={alertColor}
              onChange={(event) => setAlertColor(event.target.value as BrowserAlert["color"])}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none"
            >
              {["cyan", "purple", "green", "orange", "red"].map((color) => (
                <option key={color} value={color}>{color}</option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGlobalAlertDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={busyAction === "send-global-alert"}
              onClick={() =>
                void runAction(
                  async () => {
                    await onSendAlert(alertTitle, alertMessage, alertColor);
                    setGlobalAlertDialogOpen(false);
                    setAlertTitle("");
                    setAlertMessage("");
                  },
                  "Global alert sent.",
                  "send-global-alert",
                )
              }
            >
              Send Global Alert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(targetedAlertTarget)} onOpenChange={(open) => !open && setTargetedAlertTarget(null)}>
        <DialogContent className="max-w-lg rounded-3xl border-border">
          <DialogHeader>
            <DialogTitle>Send User Alert</DialogTitle>
            <DialogDescription>{targetedAlertTarget ? `Send to ${targetedAlertTarget.username}.` : "Send to one user."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Alert title" value={alertTitle} onChange={(event) => setAlertTitle(event.target.value)} />
            <textarea
              value={alertMessage}
              onChange={(event) => setAlertMessage(event.target.value)}
              placeholder="Alert message"
              className="h-28 w-full rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/50"
            />
            <select
              value={alertColor}
              onChange={(event) => setAlertColor(event.target.value as BrowserAlert["color"])}
              className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none"
            >
              {["cyan", "purple", "green", "orange", "red"].map((color) => (
                <option key={color} value={color}>{color}</option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTargetedAlertTarget(null)}>Cancel</Button>
            <Button
              disabled={busyAction === `send-user-alert-${targetedAlertTarget?.id ?? ""}`}
              onClick={() =>
                targetedAlertTarget
                  ? void runAction(
                      async () => {
                        await onSendAlert(alertTitle, alertMessage, alertColor, targetedAlertTarget.id);
                        setTargetedAlertTarget(null);
                        setAlertTitle("");
                        setAlertMessage("");
                      },
                      "User alert sent.",
                      `send-user-alert-${targetedAlertTarget.id}`,
                    )
                  : undefined
              }
            >
              Send User Alert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(renameTarget)} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="max-w-md rounded-3xl border-border">
          <DialogHeader>
            <DialogTitle>Rename User</DialogTitle>
            <DialogDescription>{renameTarget ? renameTarget.username : "Update username."}</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="New username"
            value={renameTarget ? (usernameEditValues[renameTarget.id] ?? "") : ""}
            onChange={(event) =>
              renameTarget
                ? setUsernameEditValues((current) => ({ ...current, [renameTarget.id]: event.target.value }))
                : undefined
            }
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>Cancel</Button>
            <Button
              onClick={() =>
                renameTarget
                  ? void runAction(
                      async () => {
                        await onChangeUsername(renameTarget.id, usernameEditValues[renameTarget.id] ?? "");
                        setRenameTarget(null);
                      },
                      "Username updated.",
                      `rename-user-${renameTarget.id}`,
                    )
                  : undefined
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(resetPasswordTarget)} onOpenChange={(open) => !open && setResetPasswordTarget(null)}>
        <DialogContent className="max-w-md rounded-3xl border-border">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>{resetPasswordTarget ? resetPasswordTarget.username : "Set a new password."}</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="New password"
            value={resetPasswordTarget ? (passwordResetValues[resetPasswordTarget.id] ?? "") : ""}
            onChange={(event) =>
              resetPasswordTarget
                ? setPasswordResetValues((current) => ({ ...current, [resetPasswordTarget.id]: event.target.value }))
                : undefined
            }
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetPasswordTarget(null)}>Cancel</Button>
            <Button
              onClick={() =>
                resetPasswordTarget
                  ? void runAction(
                      async () => {
                        await onResetPassword(resetPasswordTarget.id, passwordResetValues[resetPasswordTarget.id] ?? "");
                        setResetPasswordTarget(null);
                      },
                      "Password reset.",
                      `reset-password-${resetPasswordTarget.id}`,
                    )
                  : undefined
              }
            >
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(banUserTarget)} onOpenChange={(open) => !open && setBanUserTarget(null)}>
        <DialogContent className="max-w-lg rounded-3xl border-border">
          <DialogHeader>
            <DialogTitle>Ban User</DialogTitle>
            <DialogDescription>{banUserTarget ? banUserTarget.username : "Create a user ban."}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-[1fr_10rem]">
            <Input
              placeholder="Ban reason"
              value={banUserTarget ? (banReasonsByUser[banUserTarget.id] ?? "") : ""}
              onChange={(event) =>
                banUserTarget
                  ? setBanReasonsByUser((current) => ({ ...current, [banUserTarget.id]: event.target.value }))
                  : undefined
              }
            />
            <Input
              placeholder="Minutes or blank"
              value={banUserTarget ? (banMinutesByUser[banUserTarget.id] ?? "") : ""}
              onChange={(event) =>
                banUserTarget
                  ? setBanMinutesByUser((current) => ({ ...current, [banUserTarget.id]: event.target.value }))
                  : undefined
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBanUserTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() =>
                banUserTarget
                  ? void runAction(
                      async () => {
                        await onBanUser(
                          banUserTarget.id,
                          banReasonsByUser[banUserTarget.id] ?? "",
                          (banMinutesByUser[banUserTarget.id] ?? "") ? Number(banMinutesByUser[banUserTarget.id]) : null,
                          banUserTarget.latest_session_id,
                        );
                        setBanUserTarget(null);
                      },
                      "User banned.",
                      `ban-user-${banUserTarget.id}`,
                    )
                  : undefined
              }
            >
              Ban User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(banSessionTarget)} onOpenChange={(open) => !open && setBanSessionTarget(null)}>
        <DialogContent className="max-w-lg rounded-3xl border-border">
          <DialogHeader>
            <DialogTitle>Ban Session</DialogTitle>
            <DialogDescription>{banSessionTarget ? (banSessionTarget.username ?? "Guest session") : "Create a session ban."}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-[1fr_10rem]">
            <Input
              placeholder="Ban reason"
              value={banSessionTarget ? (banReasonsBySession[banSessionTarget.session_id] ?? "") : ""}
              onChange={(event) =>
                banSessionTarget
                  ? setBanReasonsBySession((current) => ({ ...current, [banSessionTarget.session_id]: event.target.value }))
                  : undefined
              }
            />
            <Input
              placeholder="Minutes or blank"
              value={banSessionTarget ? (banMinutesBySession[banSessionTarget.session_id] ?? "") : ""}
              onChange={(event) =>
                banSessionTarget
                  ? setBanMinutesBySession((current) => ({ ...current, [banSessionTarget.session_id]: event.target.value }))
                  : undefined
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBanSessionTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() =>
                banSessionTarget
                  ? void runAction(
                      async () => {
                        await onBanSession(
                          banReasonsBySession[banSessionTarget.session_id] ?? "",
                          (banMinutesBySession[banSessionTarget.session_id] ?? "") ? Number(banMinutesBySession[banSessionTarget.session_id]) : null,
                          banSessionTarget.session_id,
                        );
                        setBanSessionTarget(null);
                      },
                      "Session banned.",
                      `ban-session-${banSessionTarget.session_id}`,
                    )
                  : undefined
              }
            >
              Ban Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editBlockedSiteTarget)} onOpenChange={(open) => !open && setEditBlockedSiteTarget(null)}>
        <DialogContent className="max-w-lg rounded-3xl border-border">
          <DialogHeader>
            <DialogTitle>Edit Filter List</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="List name"
              value={editBlockedSiteListName}
              onChange={(event) => setEditBlockedSiteListName(event.target.value)}
            />
            <div className="space-y-2">
              <textarea
                placeholder="Enter one domain per line, e.g.&#10;example.com&#10;example.org"
                value={editBlockedSitePattern}
                onChange={(event) => setEditBlockedSitePattern(event.target.value)}
                className="min-h-36 w-full rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/50"
              />
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span>Upload a newline-separated domain list to append more entries.</span>
                <input
                  type="file"
                  accept=".txt,.csv"
                  multiple
                  className="block w-full text-[11px] text-muted-foreground file:mr-2 file:rounded file:border-0 file:bg-primary/15 file:px-2 file:py-1 file:text-xs"
                  onChange={(event) => {
                    void appendBlockedSiteEditImport(event.target.files);
                    event.target.value = "";
                  }}
                />
              </div>
            </div>
            <Input
              placeholder="Reason shown to users/admins"
              value={editBlockedSiteReason}
              onChange={(event) => setEditBlockedSiteReason(event.target.value)}
            />
            <div className="grid gap-3 md:grid-cols-2">
              <select
                value={editBlockedSiteMode}
                onChange={(event) => setEditBlockedSiteMode(event.target.value as "flag" | "block")}
                className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground outline-none"
              >
                <option value="block">Block visit</option>
                <option value="flag">Flag only</option>
              </select>
              <label className="flex items-center justify-between rounded-lg border border-border bg-background/60 px-3 py-2 text-xs">
                <span>Admin notifications</span>
                <input
                  type="checkbox"
                  checked={editBlockedSiteNotify}
                  onChange={(event) => setEditBlockedSiteNotify(event.target.checked)}
                />
              </label>
            </div>
            <label className="flex items-center justify-between rounded-lg border border-border bg-background/60 px-3 py-2 text-xs">
              <span>Rule enabled</span>
              <input
                type="checkbox"
                checked={editBlockedSiteEnabled}
                onChange={(event) => setEditBlockedSiteEnabled(event.target.checked)}
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditBlockedSiteTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={!editBlockedSiteTarget}
              onClick={() =>
                editBlockedSiteTarget
                  ? void runAction(
                      async () => {
                        const nextPatterns = Array.from(
                          new Set(
                            editBlockedSitePattern
                              .split(/\r?\n/)
                              .map((entry) => entry.trim())
                              .filter(Boolean),
                          ),
                        );
                        if (nextPatterns.length === 0) {
                          throw new Error("Add at least one domain.");
                        }
                        const existingEntries =
                          editBlockedSiteEntries.length > 0
                            ? editBlockedSiteEntries
                            : editBlockedSiteTarget
                              ? [editBlockedSiteTarget]
                              : [];
                        if (existingEntries.length === 0) {
                          throw new Error("Filter list not found.");
                        }
                        const sharedPatch = {
                          reason: editBlockedSiteReason,
                          listName: editBlockedSiteListName || undefined,
                          mode: editBlockedSiteMode,
                          notifyOnMatch: editBlockedSiteNotify,
                          isEnabled: editBlockedSiteEnabled,
                        } as const;
                        const commonCount = Math.min(existingEntries.length, nextPatterns.length);
                        for (let index = 0; index < commonCount; index += 1) {
                          await onUpdateBlockedSite(existingEntries[index].id, {
                            ...sharedPatch,
                            pattern: nextPatterns[index],
                          });
                        }
                        for (let index = commonCount; index < existingEntries.length; index += 1) {
                          await onRemoveBlockedSite(existingEntries[index].id);
                        }
                        for (let index = commonCount; index < nextPatterns.length; index += 1) {
                          await onAddBlockedSite(nextPatterns[index], editBlockedSiteReason, undefined, sharedPatch);
                        }
                        setEditBlockedSiteTarget(null);
                        setEditBlockedSiteEntries([]);
                      },
                      "Filter list updated.",
                      `edit-filter-${editBlockedSiteTarget.id}`,
                    )
                  : undefined
              }
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(rolledTotpSecret)} onOpenChange={(open) => !open && setRolledTotpSecret(null)}>
        <DialogContent className="max-w-md rounded-3xl border-border">
          <DialogHeader>
            <DialogTitle>New TOTP Secret</DialogTitle>
            <DialogDescription>
              {rolledTotpSecret ? `Share this with ${rolledTotpSecret.username}.` : "New TOTP secret"}
            </DialogDescription>
          </DialogHeader>
          {rolledTotpSecret ? (
            <div className="space-y-3">
              <img
                src={rolledTotpSecret.qrCodeDataUrl}
                alt="TOTP QR code"
                className="h-40 w-40 rounded-lg border border-border bg-white p-2"
              />
              <div className="rounded-xl border border-border bg-secondary/30 px-3 py-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Secret</div>
                <div className="mt-1 break-all text-xs text-foreground">{rolledTotpSecret.base32}</div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => void copyRolledTotpSecret()}>
                  Copy Secret
                </Button>
                <Button type="button" onClick={() => setRolledTotpSecret(null)}>
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(roleChangeTarget)} onOpenChange={(open) => !open && setRoleChangeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{roleChangeTarget?.nextRole === "admin" ? "Promote user?" : "Demote user?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {roleChangeTarget
                ? `${roleChangeTarget.nextRole === "admin" ? "Promote" : "Demote"} ${roleChangeTarget.user.username}.`
                : "Confirm role change."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                roleChangeTarget
                  ? void runAction(
                      async () => {
                        await onPromoteOrDemote(roleChangeTarget.user.id, roleChangeTarget.nextRole);
                        setRoleChangeTarget(null);
                      },
                      roleChangeTarget.nextRole === "admin" ? "User promoted." : "User demoted.",
                      `role-${roleChangeTarget.user.id}`,
                    )
                  : undefined
              }
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(resetTotpTarget)} onOpenChange={(open) => !open && setResetTotpTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset TOTP?</AlertDialogTitle>
            <AlertDialogDescription>
              {resetTotpTarget
                ? resetTotpTarget.role === "admin"
                  ? `Roll a new TOTP secret for ${resetTotpTarget.username}.`
                  : `Disable TOTP for ${resetTotpTarget.username}.`
                : "Confirm TOTP reset."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                resetTotpTarget
                  ? void runAction(
                      async () => {
                        const payload = await onResetTotp(resetTotpTarget.id);
                        if (payload.base32 && payload.qrCodeDataUrl) {
                          setRolledTotpSecret({
                            username: resetTotpTarget.username,
                            base32: payload.base32,
                            qrCodeDataUrl: payload.qrCodeDataUrl,
                          });
                        }
                        setResetTotpTarget(null);
                      },
                      resetTotpTarget.role === "admin" ? "New TOTP secret generated." : "TOTP reset.",
                      `reset-totp-${resetTotpTarget.id}`,
                    )
                  : undefined
              }
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(revokeBanTarget)} onOpenChange={(open) => !open && setRevokeBanTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke ban?</AlertDialogTitle>
            <AlertDialogDescription>
              {revokeBanTarget
                ? `Remove the active ban for ${revokeBanTarget.target_username ?? "this target"}.`
                : "Confirm ban revoke."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                revokeBanTarget
                  ? void runAction(
                      async () => {
                        await onRevokeBan(revokeBanTarget.id);
                        setRevokeBanTarget(null);
                      },
                      "Ban revoked.",
                      `revoke-ban-${revokeBanTarget.id}`,
                    )
                  : undefined
              }
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(removeFilterTarget)} onOpenChange={(open) => !open && setRemoveFilterTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove filter list?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeFilterTarget
                ? `Remove ${removeFilterTarget.label} and ${removeFilterTarget.entries.length} rule${removeFilterTarget.entries.length === 1 ? "" : "s"}.`
                : "Confirm filter removal."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                removeFilterTarget
                  ? void runAction(
                      async () => {
                        await Promise.all(removeFilterTarget.entries.map((entry) => onRemoveBlockedSite(entry.id)));
                        setRemoveFilterTarget(null);
                      },
                      removeFilterTarget.entries.length > 1 ? "List removed." : "Rule removed.",
                      `remove-filter-${removeFilterTarget.label}`,
                    )
                  : undefined
              }
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(closeTicketTarget)} onOpenChange={(open) => !open && setCloseTicketTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close ticket?</AlertDialogTitle>
            <AlertDialogDescription>
              {closeTicketTarget ? `Close "${closeTicketTarget.subject}".` : "Confirm ticket close."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                closeTicketTarget
                  ? void runAction(
                      async () => {
                        await onCloseTicket(closeTicketTarget.id);
                        setCloseTicketTarget(null);
                      },
                      "Ticket closed.",
                      `close-ticket-${closeTicketTarget.id}`,
                    )
                  : undefined
              }
            >
              Close ticket
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `Delete ${deleteTarget.username} and user-owned data.`
                : "This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteTarget
                  ? void runAction(
                      async () => {
                        await onDeleteUser(deleteTarget.id);
                        setDeleteTarget(null);
                      },
                      "User deleted.",
                      `delete-user-${deleteTarget.id}`,
                    )
                  : undefined
              }
            >
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};

const SectionTab: React.FC<{
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ icon: Icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors ${active ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card/40 text-muted-foreground"}`}
  >
    <Icon className="h-4 w-4" />
    {label}
  </button>
);

const PanelCard: React.FC<{
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}> = ({ title, icon: Icon, children }) => (
  <div className="rounded-3xl border border-border bg-background/50 p-5">
    <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
      <Icon className="h-4 w-4 text-primary" />
      {title}
    </div>
    {children}
  </div>
);

const MetricCard: React.FC<{
  icon: React.ElementType;
  label: string;
  value: number;
  detail?: string;
}> = ({ icon: Icon, label, value, detail }) => (
  <div className="rounded-3xl border border-border bg-card px-4 py-4">
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-semibold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
        {detail && <div className="mt-1 text-[11px] text-muted-foreground">{detail}</div>}
      </div>
    </div>
  </div>
);

const FilterChip: React.FC<{
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${active ? "border-primary bg-primary/10 text-foreground" : "border-border bg-card/40 text-muted-foreground"}`}
  >
    {label}
  </button>
);

const StatusPill: React.FC<{
  children: React.ReactNode;
  tone: "default" | "info" | "success" | "warning" | "danger";
}> = ({ children, tone }) => (
  <span
    className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
      tone === "info"
        ? "bg-primary/15 text-primary"
        : tone === "success"
          ? "bg-emerald-500/15 text-emerald-300"
          : tone === "warning"
            ? "bg-orange-500/15 text-orange-300"
            : tone === "danger"
              ? "bg-red-500/15 text-red-300"
              : "bg-muted text-muted-foreground"
    }`}
  >
    {children}
  </span>
);

const PaginationBar: React.FC<{
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}> = ({ page, totalPages, onChange }) => (
  <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card/40 px-4 py-3 text-sm">
    <div className="text-xs text-muted-foreground">
      Page {page} of {totalPages}
    </div>
    <div className="flex gap-2">
      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </Button>
      <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next
      </Button>
    </div>
  </div>
);

const ActivityChart: React.FC<{
  points: AdminStats["activitySeries"];
}> = ({ points }) => {
  const maxValue = Math.max(
    1,
    ...points.map((point) =>
      Math.max(point.logs, point.flaggedLogs, point.tickets, point.alerts),
    ),
  );

  if (points.length === 0) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-[11px] text-muted-foreground md:grid-cols-4">
          <LegendSwatch label="Logs" color="bg-cyan-400/40" />
          <LegendSwatch label="Flagged" color="bg-orange-400/40" />
          <LegendSwatch label="Tickets" color="bg-violet-400/40" />
          <LegendSwatch label="Alerts" color="bg-emerald-400/40" />
        </div>
        <div className="grid grid-cols-4 gap-3 md:grid-cols-8">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="rounded-2xl border border-border bg-card/40 px-2 py-3">
              <div className="flex h-28 items-end justify-center gap-1">
                <div className="h-4 w-2 rounded-full bg-cyan-400/25" />
                <div className="h-4 w-2 rounded-full bg-orange-400/25" />
                <div className="h-4 w-2 rounded-full bg-violet-400/25" />
                <div className="h-4 w-2 rounded-full bg-emerald-400/25" />
              </div>
              <div className="mt-3 text-center text-[10px] text-muted-foreground">-</div>
            </div>
          ))}
        </div>
        <div className="text-center text-xs text-muted-foreground">No recent activity yet.</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 text-[11px] text-muted-foreground md:grid-cols-4">
        <LegendSwatch label="Logs" color="bg-cyan-400" />
        <LegendSwatch label="Flagged" color="bg-orange-400" />
        <LegendSwatch label="Tickets" color="bg-violet-400" />
        <LegendSwatch label="Alerts" color="bg-emerald-400" />
      </div>
      <div className="grid grid-cols-4 gap-3 md:grid-cols-8">
        {points.map((point) => (
          <div key={point.label} className="rounded-2xl border border-border bg-card/40 px-2 py-3">
            <div className="flex h-28 items-end justify-center gap-1">
              <div className="w-2 rounded-full bg-cyan-400" style={{ height: `${(point.logs / maxValue) * 100}%` }} />
              <div className="w-2 rounded-full bg-orange-400" style={{ height: `${(point.flaggedLogs / maxValue) * 100}%` }} />
              <div className="w-2 rounded-full bg-violet-400" style={{ height: `${(point.tickets / maxValue) * 100}%` }} />
              <div className="w-2 rounded-full bg-emerald-400" style={{ height: `${(point.alerts / maxValue) * 100}%` }} />
            </div>
            <div className="mt-3 text-center text-[10px] text-muted-foreground">{point.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

const LegendSwatch: React.FC<{
  label: string;
  color: string;
}> = ({ label, color }) => (
  <div className="flex items-center gap-2">
    <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
    <span>{label}</span>
  </div>
);

const LogCard: React.FC<{ entry: AdminLogEntry }> = ({ entry }) => (
  <div className={`rounded-2xl border p-4 ${entry.flagged ? "border-orange-500/40 bg-orange-500/10" : "border-border bg-background/60"}`}>
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="font-medium">{entry.hostname}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {entry.username ?? "Guest"} • {entry.blocked ? "blocked" : entry.flagged ? "flagged" : "regular"} •{" "}
          {new Date(entry.created_at).toLocaleString()}
        </div>
        <div className="mt-2 truncate text-xs text-muted-foreground">{entry.url}</div>
      </div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {entry.blocked ? "Blocked" : entry.flagged ? "Flagged" : "Regular"}
      </div>
    </div>
  </div>
);

const BanCard: React.FC<{
  ban: AdminBanRecord;
  showRevoked?: boolean;
  onRevoke?: () => void;
  revokeBusy?: boolean;
}> = ({ ban, showRevoked, onRevoke, revokeBusy }) => (
  <div className="rounded-2xl border border-border bg-card/40 px-4 py-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">
          {ban.target_username ?? (ban.target_type === "session" ? "Guest session" : "Unknown user")}
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          {ban.target_type}
          {ban.target_session_id ? ` • ${ban.target_session_id.slice(0, 8)}…` : ""} • {ban.reason} • by{" "}
          {ban.issued_by_username ?? "admin"}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="text-[11px] text-muted-foreground">
          {showRevoked
            ? `Revoked ${ban.revoked_at ? formatRelativeTime(ban.revoked_at) : "recently"}`
            : ban.expires_at
              ? `Ends ${new Date(ban.expires_at).toLocaleDateString()}`
              : "Indefinite"}
        </div>
        {!showRevoked && onRevoke ? (
          <Button variant="secondary" size="sm" disabled={revokeBusy} onClick={onRevoke}>
            Unban
          </Button>
        ) : null}
      </div>
    </div>
  </div>
);

const SessionRow: React.FC<{
  entry: AdminSession;
  onlineCutoff: number;
  selected?: boolean;
  onSelect?: () => void;
}> = ({ entry, onlineCutoff, selected, onSelect }) => {
  const row = (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-sm font-medium">{entry.username ?? "Guest session"}</div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          {entry.user_id ? "Signed in" : "Guest"} •{" "}
          {entry.last_seen_at >= onlineCutoff ? "online now" : formatRelativeTime(entry.last_seen_at)}
        </div>
      </div>
      <div className="text-[11px] text-muted-foreground">{entry.flagged_count} flagged</div>
    </div>
  );
  if (onSelect) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
          selected ? "border-primary bg-primary/10" : "border-border bg-card/40 hover:border-primary/40"
        }`}
      >
        {row}
      </button>
    );
  }
  return <div className="rounded-2xl border border-border bg-card/40 px-4 py-3">{row}</div>;
};

const EmptyText: React.FC<{ text: string }> = ({ text }) => (
  <div className="rounded-2xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
    {text}
  </div>
);

function formatRelativeTime(timestamp: number) {
  const delta = Date.now() - timestamp;
  const minutes = Math.max(1, Math.floor(delta / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
