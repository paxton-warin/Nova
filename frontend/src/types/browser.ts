export interface BrowserTab {
  id: string;
  title: string;
  url: string;
  favicon: string;
  isLoading: boolean;
  isActive: boolean;
  keepLoaded: boolean;
  closing?: boolean;
  history?: string[];
  historyIndex?: number;
  canGoBack?: boolean;
  canGoForward?: boolean;
  reloadToken?: number;
  lastActiveAt?: number;
  isMuted?: boolean;
}

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  favicon: string;
}

export interface HistoryEntry {
  id: string;
  title: string;
  url: string;
  favicon: string;
  timestamp: number;
  category?: string;
  flagged?: boolean;
}

export interface Shortcut {
  id: string;
  title: string;
  url: string;
  favicon: string;
  color: string;
}

export interface GameApp {
  id: string;
  title: string;
  url: string;
  /** Square icon area, usually a favicon URL or data URL. */
  icon: string;
  /** Wide image for library cards (URL or data URL) */
  banner?: string;
  description: string;
  category: "game" | "app";
  isCustom?: boolean;
}

export interface KeyboardShortcut {
  id: string;
  action: string;
  label: string;
  keys: string;
  isDefault?: boolean;
}

export interface ThemePreset {
  id: string;
  name: string;
  accentColor: string;
  backgroundUrl: string;
}

export interface BrowserSettings {
  tabBehavior: "keep-loaded" | "unload-idle" | "unload-over-limit";
  defaultSearchEngine: "google" | "bing" | "duckduckgo" | "yahoo";
  searchSuggestions: boolean;
  showBookmarksBar: boolean;
  safeBrowsing: boolean;
  doNotTrack: boolean;
  pushNotifications: boolean;
  notificationSound: boolean;
  restoreTabs: boolean;
  erudaEnabled: boolean;
  passwordManagerEnabled: boolean;
  showTips: boolean;
  askWhereToSave: boolean;
  downloadLocation: string;
  extensions: {
    adShield: boolean;
    darkReader: boolean;
    passwordVault: boolean;
    devtools: boolean;
  };
  theme: {
    mode: "light" | "dark" | "midnight";
    accentColor: string;
    density: "compact" | "default" | "spacious";
    tabOrientation: "horizontal" | "vertical";
    backgroundUrl: string;
    customFavicon: string;
    customTitle: string;
    faviconPreset: "default" | "google" | "schoology" | "canvas" | "custom";
    titlePreset: "default" | "google" | "schoology" | "canvas" | "custom";
    themePresetId: string;
  };
  /** Exit region for outbound proxy pool (see nova.proxies.json). */
  proxyLocation: string;
  showExitLocationBadge: boolean;
  shortcuts: KeyboardShortcut[];
}

/** Public metadata for the exit region selector (no proxy secrets). */
export interface ProxyLocationOption {
  id: string;
  label: string;
  emoji: string;
}

export interface BrowserUser {
  id: string;
  username: string;
  role: "user" | "admin" | "master_admin";
  isAdmin: boolean;
  totpEnabled: boolean;
}

export interface BrowserAlert {
  id: string;
  title: string;
  message: string;
  color: "cyan" | "purple" | "green" | "orange" | "red";
  target_user_id?: string | null;
  created_by_username?: string | null;
  created_at: number;
  deliver_until_at?: number | null;
}

export interface InboxNotification extends BrowserAlert {
  is_read: boolean;
}

export interface TicketAttachment {
  id: string;
  url: string;
  original_name: string;
  mime_type: string;
  size: number;
  created_at: number;
}

export interface SupportTicketMessage {
  id: string;
  ticket_id: string;
  author_user_id: string | null;
  author_role: "user" | "admin" | "master_admin";
  author_username: string | null;
  body: string;
  created_at: number;
  attachments?: TicketAttachment[];
}

export interface SupportTicket {
  id: string;
  owner_user_id: string;
  owner_username: string;
  subject: string;
  status: "open" | "closed";
  kind?: string;
  related_url?: string | null;
  created_at: number;
  updated_at: number;
  unread: boolean;
  messages: SupportTicketMessage[];
}

export interface WebsiteMessage {
  id: string;
  tab_id: string;
  tab_title: string;
  tab_url: string;
  kind: "notification" | "alert";
  title: string;
  message: string;
  created_at: number;
  is_read: boolean;
}

export interface BrowserBan {
  reason: string;
  expiresAt: number | null;
  issuedByUsername: string;
}

export interface SavedPasswordRecord {
  id: string;
  origin: string;
  site_username: string;
  created_at: number;
  updated_at: number;
}

export interface BrowserExtras {
  bookmarks: Bookmark[];
  history: HistoryEntry[];
  shortcutTiles: Shortcut[];
  customAppsGames: GameApp[];
  tutorialDismissed: boolean;
}

export interface TransportConfig {
  scramjet: {
    wasm: string;
    all: string;
    sync: string;
  };
  baremuxWorker: string;
  baremuxScript: string;
  transportPath: string;
  wispUrl: string;
  /** Assigned outbound proxy for this session (http, https, socks5h, socks4a). */
  proxyUrl?: string | null;
  /** Effective location id after server-side fallback handling. */
  proxyLocationId?: string;
  /** Warning shown when Nova had to fall back from the requested proxy location. */
  proxyWarning?: string | null;
}

export interface BootstrapPayload {
  sessionId: string;
  user: BrowserUser | null;
  banned: BrowserBan | null;
  browserState: {
    settings: unknown;
    tabs: unknown;
    shortcuts: unknown;
  };
  defaults: {
    settings: unknown;
    shortcuts: unknown;
    tabs: unknown;
    catalog?: {
      appsGames?: GameApp[];
    };
    helpTips: string[];
    themes: Array<{
      id: string;
      name: string;
      accent?: string;
      accentColor?: string;
      preview?: string;
      backgroundImage?: string;
      backgroundUrl?: string;
    }>;
    proxyLocations?: ProxyLocationOption[];
  };
  alerts: BrowserAlert[];
  transport: TransportConfig;
}

export interface AdminUser {
  id: string;
  username: string;
  role: "user" | "admin" | "master_admin";
  totp_enabled: number;
  created_at: number;
  latest_session_id: string | null;
  latest_session_last_seen_at: number | null;
  flagged_count: number;
  active_ban_id: string | null;
  active_ban_reason: string | null;
  active_ban_expires_at: number | null;
}

export interface AdminLogEntry {
  id: string;
  username?: string | null;
  url: string;
  hostname: string;
  category: string;
  flagged: number;
  blocked: number;
  filter_list_name?: string | null;
  filter_mode?: "flag" | "block" | null;
  notify_admin?: number;
  created_at: number;
  session_id: string;
}

export interface AdminStatsPoint {
  label: string;
  logs: number;
  flaggedLogs: number;
  tickets: number;
  alerts: number;
}

export interface AdminStats {
  totalUsers: number;
  adminUsers: number;
  onlineUsers: number;
  activeSessions: number;
  loggedInSessions: number;
  guestSessions: number;
  dailyActiveUsers: number;
  dailyActiveGuests: number;
  activeBans: number;
  blockedSites: number;
  flaggedLogs24h: number;
  totalLogs24h: number;
  alerts24h: number;
  timeframe: "24h" | "7d" | "30d";
  activitySeries: AdminStatsPoint[];
}

export interface AdminSession {
  session_id: string;
  user_id: string | null;
  username: string | null;
  role: "user" | "admin" | "master_admin" | null;
  last_seen_at: number;
  created_at: number;
  flagged_count: number;
  active_ban_id: string | null;
  active_ban_reason: string | null;
}

export interface AdminSupportTicket extends SupportTicket {
  unread_for_admin: boolean;
}

export interface AdminBanRecord {
  id: string;
  target_type: "user" | "session";
  target_user_id: string | null;
  target_session_id: string | null;
  target_username: string | null;
  reason: string;
  issued_by_username: string | null;
  created_at: number;
  expires_at: number | null;
  revoked_at: number | null;
}

export interface BlockedSiteRecord {
  id: string;
  pattern: string;
  reason: string;
  list_name?: string | null;
  mode?: "flag" | "block";
  notify_on_match?: number;
  is_enabled?: number;
  user_id: string | null;
  username?: string | null;
  created_at: number;
  created_by_username?: string | null;
}

export interface AdminNotification {
  id: string;
  kind: "ticket-opened" | "ticket-replied" | "flagged-site" | "blocked-site";
  title: string;
  message: string;
  created_at: number;
  unread: boolean;
  ticket_id?: string;
  log_id?: string;
  session_id?: string;
  username?: string | null;
}

export type PanelType =
  | "none"
  | "messages"
  | "notifications"
  | "tickets"
  | "admin-notifications"
  | "settings"
  | "keybinds"
  | "history"
  | "bookmarks"
  | "account"
  | "admin";
