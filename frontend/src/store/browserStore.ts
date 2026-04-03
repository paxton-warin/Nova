import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api, ApiError, resolveApiUrl } from "@/lib/api";
import { buildDefaultKeyboardShortcuts } from "@/lib/shortcuts";
import type {
  AdminBanRecord,
  AdminNotification,
  AdminSession,
  AdminSupportTicket,
  AdminLogEntry,
  AdminStatsPoint,
  AdminStats,
  AdminUser,
  BlockedSiteRecord,
  Bookmark,
  BootstrapPayload,
  BrowserAlert,
  BrowserBan,
  BrowserExtras,
  BrowserSettings,
  BrowserTab,
  BrowserUser,
  GameApp,
  HistoryEntry,
  InboxNotification,
  KeyboardShortcut,
  PanelType,
  SavedPasswordRecord,
  Shortcut,
  SupportTicket,
  ThemePreset,
  TransportConfig,
  ProxyLocationOption,
  WebsiteMessage,
} from "@/types/browser";

const LOCAL_STATE_KEY = "nova.browser.local-state";
const MAX_TABS = 100;
const MAX_SHORTCUT_TILES = 10;

function faviconForUrl(url: string) {
  if (url === "newtab") return "";
  try {
    return resolveApiUrl(`/api/favicon?url=${encodeURIComponent(url)}`);
  } catch {
    return "";
  }
}

function isImageLikeSource(value: string | undefined) {
  return Boolean(value && /^(https?:|data:|\/)/i.test(value));
}

function hexToHslTriplet(hex: string) {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return hex;

  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;

  let hue = 0;
  if (delta !== 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
  }

  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;

  const saturation =
    delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  return `${hue} ${Math.round(saturation * 100)}% ${Math.round(
    lightness * 100,
  )}%`;
}

function normalizeAccentColor(value: string) {
  if (value.startsWith("#")) return hexToHslTriplet(value);
  return value;
}

function normalizeLikelyExternalUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  if (
    /^[a-zA-Z][a-zA-Z\d+\-.]*:/i.test(trimmed) ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("//")
  ) {
    return trimmed;
  }
  if (trimmed.includes(".") && !/\s/.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function makeDataIcon(label: string, background = "#1f2937") {
  const letter = (label[0] ?? "?").toUpperCase();
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${background}"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-size="28" fill="white">${letter}</text></svg>`,
  )}`;
}

const DEFAULT_KEYBOARD_SHORTCUTS: KeyboardShortcut[] = buildDefaultKeyboardShortcuts();

const DEFAULT_SHORTCUT_TILES: Shortcut[] = [
  { id: "1", title: "DuckDuckGo", url: "https://duckduckgo.com", favicon: makeDataIcon("DuckDuckGo", "#de5833"), color: "#de5833" },
  { id: "8", title: "ChatGPT", url: "https://chatgpt.com", favicon: makeDataIcon("ChatGPT", "#10a37f"), color: "#10a37f" },
  { id: "2", title: "YouTube", url: "https://youtube.com", favicon: makeDataIcon("YouTube", "#FF0000"), color: "#FF0000" },
  { id: "3", title: "GitHub", url: "https://github.com", favicon: makeDataIcon("GitHub", "#24292f"), color: "#333" },
  { id: "4", title: "Reddit", url: "https://reddit.com", favicon: makeDataIcon("Reddit", "#FF4500"), color: "#FF4500" },
  { id: "5", title: "X", url: "https://x.com", favicon: makeDataIcon("X", "#111827"), color: "#1DA1F2" },
  { id: "6", title: "Wikipedia", url: "https://wikipedia.org", favicon: makeDataIcon("Wikipedia", "#636363"), color: "#636363" },
  { id: "7", title: "Amazon", url: "https://amazon.com", favicon: makeDataIcon("Amazon", "#FF9900"), color: "#FF9900" },
];
const LEGACY_DEFAULT_SHORTCUT_URLS = [
  "https://duckduckgo.com",
  "https://youtube.com",
  "https://github.com",
  "https://reddit.com",
  "https://x.com",
  "https://wikipedia.org",
  "https://amazon.com",
  "https://chatgpt.com",
];

const DEFAULT_GAMES: GameApp[] = [
  { id: "1", title: "2048", url: "https://play2048.co", icon: "", description: "Classic number puzzle", category: "game" },
  { id: "2", title: "Tetris", url: "https://tetris.com/play-tetris", icon: "", description: "Block stacking classic", category: "game" },
  { id: "3", title: "Snake", url: "https://playsnake.org", icon: "", description: "Classic snake game", category: "game" },
  { id: "4", title: "Chess", url: "https://chess.com", icon: "", description: "Play chess online", category: "game" },
  { id: "5", title: "Calculator", url: "https://web2.0calc.com", icon: "", description: "Scientific calculator", category: "app" },
  { id: "6", title: "Notepad", url: "https://notepad.pw", icon: "", description: "Quick online notepad", category: "app" },
  { id: "7", title: "Draw", url: "https://excalidraw.com", icon: "", description: "Drawing whiteboard", category: "app" },
  { id: "8", title: "Timer", url: "https://timer.guru", icon: "", description: "Online timer", category: "app" },
];

const DEFAULT_THEME_PRESETS: ThemePreset[] = [
  {
    id: "nebula",
    name: "Aurora Shell",
    accentColor: "172 66% 50%",
    backgroundUrl: `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#020617"/><stop offset="0.5" stop-color="#1d4ed8"/><stop offset="1" stop-color="#06b6d4"/></linearGradient></defs><rect width="1600" height="900" fill="url(#g)"/><g fill="white" fill-opacity="0.12"><rect x="72" y="64" width="1456" height="52" rx="16"/><rect x="92" y="80" width="120" height="22" rx="6"/><rect x="220" y="80" width="720" height="22" rx="6" fill-opacity="0.18"/><rect x="92" y="124" width="1416" height="34" rx="8" fill-opacity="0.08"/></g><rect x="120" y="200" width="1360" height="640" rx="16" fill="white" fill-opacity="0.04" stroke="white" stroke-opacity="0.07"/></svg>`,
    )}`,
  },
  {
    id: "violet-drift",
    name: "Violet Browser",
    accentColor: "280 70% 60%",
    backgroundUrl: `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#12051f"/><stop offset="0.5" stop-color="#5b21b6"/><stop offset="1" stop-color="#c084fc"/></linearGradient></defs><rect width="1600" height="900" fill="url(#g)"/><g fill="white" fill-opacity="0.12"><rect x="72" y="64" width="1456" height="52" rx="16"/><rect x="92" y="80" width="120" height="22" rx="6"/><rect x="220" y="80" width="720" height="22" rx="6" fill-opacity="0.18"/><rect x="92" y="124" width="1416" height="34" rx="8" fill-opacity="0.08"/></g><rect x="160" y="220" width="1280" height="600" rx="14" fill="white" fill-opacity="0.03"/><rect x="200" y="260" width="1200" height="520" rx="12" fill="white" fill-opacity="0.04"/></svg>`,
    )}`,
  },
  {
    id: "forest-grid",
    name: "Matrix Tabs",
    accentColor: "142 71% 45%",
    backgroundUrl: `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#03140f"/><stop offset="0.5" stop-color="#166534"/><stop offset="1" stop-color="#86efac"/></linearGradient></defs><rect width="1600" height="900" fill="url(#g)"/><g fill="white" fill-opacity="0.12"><rect x="72" y="64" width="1456" height="52" rx="16"/><rect x="92" y="80" width="120" height="22" rx="6"/><rect x="220" y="80" width="720" height="22" rx="6" fill-opacity="0.18"/><rect x="92" y="124" width="1416" height="34" rx="8" fill-opacity="0.08"/></g><g stroke="white" stroke-opacity="0.14" fill="none"><rect x="140" y="220" width="620" height="300" rx="12"/><rect x="800" y="220" width="620" height="300" rx="12"/><rect x="140" y="540" width="620" height="300" rx="12"/><rect x="800" y="540" width="620" height="300" rx="12"/></g></svg>`,
    )}`,
  },
  {
    id: "ember-night",
    name: "Ember Window",
    accentColor: "25 95% 53%",
    backgroundUrl: `data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#1c0904"/><stop offset="0.5" stop-color="#9a3412"/><stop offset="1" stop-color="#fdba74"/></linearGradient></defs><rect width="1600" height="900" fill="url(#g)"/><g fill="white" fill-opacity="0.12"><rect x="72" y="64" width="1456" height="52" rx="16"/><rect x="92" y="80" width="120" height="22" rx="6"/><rect x="220" y="80" width="720" height="22" rx="6" fill-opacity="0.18"/><rect x="92" y="124" width="1416" height="34" rx="8" fill-opacity="0.08"/></g><circle cx="800" cy="480" r="140" fill="none" stroke="white" stroke-opacity="0.14" stroke-width="10"/><rect x="240" y="320" width="1120" height="380" rx="18" fill="white" fill-opacity="0.04"/></svg>`,
    )}`,
  },
];

const DEFAULT_SETTINGS: BrowserSettings = {
  tabBehavior: "keep-loaded",
  defaultSearchEngine: "duckduckgo",
  searchSuggestions: true,
  showBookmarksBar: true,
  safeBrowsing: true,
  doNotTrack: false,
  pushNotifications: true,
  notificationSound: false,
  restoreTabs: true,
  erudaEnabled: false,
  passwordManagerEnabled: true,
  showTips: true,
  askWhereToSave: false,
  downloadLocation: "~/Downloads",
  extensions: {
    adShield: true,
    darkReader: false,
    passwordVault: true,
    devtools: false,
  },
  theme: {
    mode: "dark",
    accentColor: DEFAULT_THEME_PRESETS[0].accentColor,
    density: "default",
    tabOrientation: "horizontal",
    backgroundUrl: DEFAULT_THEME_PRESETS[0].backgroundUrl,
    customFavicon: "",
    customTitle: "",
    faviconPreset: "default",
    titlePreset: "default",
    themePresetId: DEFAULT_THEME_PRESETS[0].id,
  },
  shortcuts: DEFAULT_KEYBOARD_SHORTCUTS,
  proxyLocation: "us",
};

const DEFAULT_EXTRAS: BrowserExtras = {
  bookmarks: [],
  history: [],
  shortcutTiles: DEFAULT_SHORTCUT_TILES,
  customAppsGames: [],
  tutorialDismissed: false,
};

let tabIdCounter = 0;
const genId = () => `tab-${++tabIdCounter}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function titleFromUrl(url: string) {
  if (url === "newtab") return "New Tab";
  if (url === "nova://games") return "Games";
  if (url === "nova://apps") return "Apps";
  if (url.startsWith("nova://blocked")) return "Blocked";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function blockedPageUrl(reason: string, targetUrl: string, adminBypassAllowed = false) {
  const q = new URLSearchParams({
    reason,
    target: targetUrl,
  });
  if (adminBypassAllowed) {
    q.set("adminBypassAllowed", "1");
  }
  return `nova://blocked?${q.toString()}`;
}

function normalizeAdminBypassHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function normalizeShortcutMatchUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    const path = u.pathname.replace(/\/$/, "") || "";
    return `${u.protocol}//${u.hostname.toLowerCase()}${path}`;
  } catch {
    return url;
  }
}

/** Compare frame URL to tab history without churn from hash, trailing slash, or host case. */
function normalizeUrlForTabSync(raw: string): string {
  if (!raw || raw === "newtab" || raw.startsWith("nova://")) return raw;
  try {
    const u = new URL(raw);
    u.hash = "";
    const host = u.hostname.toLowerCase();
    let path = u.pathname;
    if (path.length > 1 && path.endsWith("/")) {
      path = path.slice(0, -1);
    }
    return `${u.protocol}//${host}${path}${u.search}`;
  } catch {
    return raw.trim();
  }
}

function faviconBannerForPageUrl(url: string): string {
  try {
    return resolveApiUrl(`/api/favicon?url=${encodeURIComponent(url)}`);
  } catch {
    return "";
  }
}

function isInternalNovaUrl(url: string) {
  return url.startsWith("nova://");
}

function normalizeSearchEngine(value: unknown): BrowserSettings["defaultSearchEngine"] {
  if (typeof value !== "string") return "google";
  const normalized = value.toLowerCase();
  if (normalized === "bing" || normalized === "duckduckgo" || normalized === "yahoo") {
    return normalized;
  }
  return "google";
}

function createTab(url = "newtab", title = "New Tab"): BrowserTab {
  return {
    id: genId(),
    title,
    url,
    favicon: faviconForUrl(url),
    isLoading: false,
    isActive: true,
    keepLoaded: true,
    history: [url],
    historyIndex: 0,
    canGoBack: false,
    canGoForward: false,
    lastActiveAt: Date.now(),
    isMuted: false,
  };
}

function normalizeShortcutTile(entry: Shortcut): Shortcut {
  const title = entry.title?.trim() || "Shortcut";
  const url = normalizeLikelyExternalUrl(entry.url?.trim() || "https://duckduckgo.com");
  return {
    id: entry.id,
    title,
    url,
    favicon: entry.favicon || faviconForUrl(url),
    color: entry.color || "#6366f1",
  };
}

function reorderShortcutsByUrlOrder(shortcutTiles: Shortcut[], urlOrder: string[]) {
  const shortcutMap = new Map(
    shortcutTiles.map((entry) => [normalizeShortcutMatchUrl(entry.url), entry]),
  );
  return urlOrder
    .map((url) => shortcutMap.get(normalizeShortcutMatchUrl(url)))
    .filter((entry): entry is Shortcut => Boolean(entry));
}

function matchesUrlSet(shortcutTiles: Shortcut[], expectedUrls: string[]) {
  if (shortcutTiles.length !== expectedUrls.length) return false;
  const current = shortcutTiles
    .map((entry) => normalizeShortcutMatchUrl(entry.url))
    .sort()
    .join("|");
  const expected = expectedUrls
    .map((entry) => normalizeShortcutMatchUrl(entry))
    .sort()
    .join("|");
  return current === expected;
}

function coerceGameApps(value: unknown): GameApp[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is GameApp =>
        isRecord(item) &&
        typeof item.id === "string" &&
        typeof item.title === "string" &&
        typeof item.url === "string" &&
        typeof item.icon === "string" &&
        typeof item.description === "string" &&
        (item.category === "app" || item.category === "game") &&
        (item.banner === undefined || typeof item.banner === "string"),
    )
    .map((item) => normalizeGameAppEntry({
      ...item,
      isCustom: Boolean(item.isCustom),
      banner: typeof item.banner === "string" ? item.banner : undefined,
    }));
}

function normalizeGameAppEntry(entry: GameApp): GameApp {
  const url = normalizeLikelyExternalUrl(entry.url);
  const icon = isImageLikeSource(normalizeLikelyExternalUrl(entry.icon)) ? normalizeLikelyExternalUrl(entry.icon) : faviconForUrl(url);
  const banner = normalizeLikelyExternalUrl(entry.banner ?? "");
  return {
    ...entry,
    url,
    icon,
    banner: isImageLikeSource(banner) ? banner : undefined,
  };
}

function coerceSettings(value: unknown): BrowserSettings {
  if (!isRecord(value)) return DEFAULT_SETTINGS;
  const theme = isRecord(value.theme) ? value.theme : {};
  const themePresetId =
    typeof theme.themePresetId === "string"
      ? theme.themePresetId
      : DEFAULT_THEME_PRESETS[0].id;
  const preset =
    DEFAULT_THEME_PRESETS.find((item) => item.id === themePresetId) ??
    DEFAULT_THEME_PRESETS[0];
  const themeMode =
    theme.mode === "light" || theme.mode === "midnight"
      ? theme.mode
      : "dark";
  const providedShortcuts = Array.isArray(value.shortcuts)
    ? (value.shortcuts as KeyboardShortcut[])
    : [];
  const freshDefaults = buildDefaultKeyboardShortcuts();
  const shortcutMap = new Map(providedShortcuts.map((item) => [item.id, item]));
  const staleReload = shortcutMap.get("3");
  if (staleReload && /Shift\+T/i.test(staleReload.keys)) {
    shortcutMap.delete("3");
  }
  const shortcuts = freshDefaults.map((shortcut) => {
    const match = shortcutMap.get(shortcut.id);
    if (!match) return shortcut;
    const legacyDefaultKeys: Record<string, string> = {
      "1": "Ctrl+T",
      "2": "Ctrl+W",
      "3": "Ctrl+R",
      "4": "Alt+.",
      "5": "Ctrl+H",
      "6": "Alt+Home",
      "7": "Ctrl+B",
      "8": "Ctrl+Shift+I",
      "10": "Alt+ArrowLeft",
      "11": "Alt+ArrowRight",
      "12": "Ctrl+Shift+T",
    };
    if (shortcut.id === "4" && match.keys === "Ctrl+,") {
      return { ...shortcut, ...match, keys: "Alt+." };
    }
    if (match.isDefault && match.keys === legacyDefaultKeys[shortcut.id]) {
      return { ...shortcut, ...match, keys: shortcut.keys };
    }
    return { ...shortcut, ...match };
  });

  return {
    ...DEFAULT_SETTINGS,
    ...value,
    tabBehavior:
      value.tabBehavior === "unload-inactive"
        ? "unload-idle"
        : value.tabBehavior === "unload-over-limit" || value.tabBehavior === "unload-idle"
          ? value.tabBehavior
          : DEFAULT_SETTINGS.tabBehavior,
    defaultSearchEngine: normalizeSearchEngine(value.defaultSearchEngine),
    showBookmarksBar:
      typeof value.showBookmarksBar === "boolean"
        ? value.showBookmarksBar
        : DEFAULT_SETTINGS.showBookmarksBar,
    showTips:
      typeof value.showTips === "boolean"
        ? value.showTips
        : typeof value.tipFrequencyMinutes === "number"
          ? value.tipFrequencyMinutes > 0
          : DEFAULT_SETTINGS.showTips,
    extensions: {
      ...DEFAULT_SETTINGS.extensions,
      ...(isRecord(value.extensions) ? value.extensions : {}),
    },
    shortcuts,
    theme: {
      ...DEFAULT_SETTINGS.theme,
      ...theme,
      accentColor:
        typeof theme.accentColor === "string"
          ? normalizeAccentColor(theme.accentColor)
          : normalizeAccentColor(preset.accentColor),
      backgroundUrl:
        typeof theme.backgroundUrl === "string" && theme.backgroundUrl.length > 0
          ? theme.backgroundUrl
          : preset.backgroundUrl,
      mode: themeMode,
      themePresetId: preset.id,
    },
    proxyLocation:
      typeof value.proxyLocation === "string" && value.proxyLocation.length > 0
        ? value.proxyLocation
        : DEFAULT_SETTINGS.proxyLocation,
  };
}

function coerceTabs(value: unknown, restoreTabs: boolean): BrowserTab[] {
  if (!restoreTabs || !Array.isArray(value) || value.length === 0) {
    return [createTab()];
  }

  const hasExplicitActive = value.some(
    (entry) => isRecord(entry) && entry.isActive === true,
  );
  return value.map((entry, index) => {
    const row = isRecord(entry) ? entry : {};
    const url = typeof row.url === "string" ? row.url : "newtab";
    const history = Array.isArray(row.history)
      ? row.history.filter((item): item is string => typeof item === "string")
      : [url];
    const historyIndex =
      typeof row.historyIndex === "number"
        ? row.historyIndex
        : Math.max(history.length - 1, 0);
    return {
      id: typeof row.id === "string" ? row.id : genId(),
      title: typeof row.title === "string" ? row.title : titleFromUrl(url),
      url,
      favicon:
        typeof row.favicon === "string" && row.favicon.length > 0
          ? row.favicon
          : faviconForUrl(url),
      isLoading: Boolean(row.isLoading),
      isActive:
        typeof row.isActive === "boolean"
          ? row.isActive
          : !hasExplicitActive && index === 0,
      keepLoaded: row.keepLoaded !== false,
      closing: Boolean(row.closing),
      history,
      historyIndex,
      canGoBack: historyIndex > 0,
      canGoForward: historyIndex < history.length - 1,
      lastActiveAt:
        typeof row.lastActiveAt === "number" ? row.lastActiveAt : Date.now(),
      reloadToken:
        typeof row.reloadToken === "number" ? row.reloadToken : undefined,
      isMuted: Boolean(row.isMuted),
    };
  });
}

function simpleUrlHash(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i += 1) {
    h = (Math.imul(31, h) + url.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function ensureHistoryEntryIds(entries: HistoryEntry[]): HistoryEntry[] {
  return entries.map((entry, index) =>
    entry.id && String(entry.id).length > 0
      ? entry
      : {
          ...entry,
          id: `h-${entry.timestamp}-${simpleUrlHash(entry.url)}-${index}`,
        },
  );
}

/** Union session history from localStorage with live in-memory history (debounced LS can miss recent visits). */
function mergeLocalHistoryForSync(
  fromStorage: HistoryEntry[],
  liveSession: HistoryEntry[],
): HistoryEntry[] {
  const storageNorm = ensureHistoryEntryIds(fromStorage);
  const liveNorm = ensureHistoryEntryIds(liveSession);
  const map = new Map<string, HistoryEntry>();
  for (const e of storageNorm) {
    map.set(`${e.timestamp}|${e.url}`, e);
  }
  for (const e of liveNorm) {
    const key = `${e.timestamp}|${e.url}`;
    if (!map.has(key)) map.set(key, e);
  }
  return Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
}

function coerceExtras(value: unknown): BrowserExtras {
  if (!isRecord(value)) return DEFAULT_EXTRAS;
  const bookmarks = Array.isArray(value.bookmarks)
    ? (value.bookmarks as Bookmark[])
    : DEFAULT_EXTRAS.bookmarks;
  const shortcutTiles = Array.isArray(value.shortcutTiles)
    ? (value.shortcutTiles as Shortcut[]).slice(0, MAX_SHORTCUT_TILES).map(normalizeShortcutTile)
    : DEFAULT_EXTRAS.shortcutTiles;
  const migratedBookmarks =
    bookmarks.length === 1 &&
    bookmarks[0]?.id === "1" &&
    bookmarks[0]?.title === "Google" &&
    bookmarks[0]?.url === "https://google.com"
      ? []
      : bookmarks;
  const migratedShortcutTiles = shortcutTiles.map((entry) =>
    entry.id === "1" &&
    entry.title === "Google" &&
    entry.url === "https://google.com"
      ? {
          ...entry,
          title: "DuckDuckGo",
          url: "https://duckduckgo.com",
          favicon: makeDataIcon("DuckDuckGo", "#de5833"),
          color: "#de5833",
        }
      : entry,
  );
  const withChatGptShortcut = migratedShortcutTiles.map((entry) =>
    entry.id === "8" &&
    entry.title === "Netflix" &&
    entry.url === "https://netflix.com"
      ? DEFAULT_SHORTCUT_TILES[1]!
      : entry,
  );
  const reorderedDefaultShortcuts = matchesUrlSet(
    withChatGptShortcut,
    LEGACY_DEFAULT_SHORTCUT_URLS,
  )
    ? reorderShortcutsByUrlOrder(
        withChatGptShortcut,
        DEFAULT_SHORTCUT_TILES.map((entry) => entry.url),
      )
    : withChatGptShortcut;
  return {
    bookmarks: migratedBookmarks,
    history: Array.isArray(value.history)
      ? ensureHistoryEntryIds(value.history as HistoryEntry[])
      : DEFAULT_EXTRAS.history,
    shortcutTiles: reorderedDefaultShortcuts,
    customAppsGames: coerceGameApps(value.customAppsGames),
    tutorialDismissed: Boolean(value.tutorialDismissed),
  };
}

function getLocalState() {
  const raw = localStorage.getItem(LOCAL_STATE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as {
      sessionId?: string;
      settings: BrowserSettings;
      tabs: BrowserTab[];
      extras: BrowserExtras;
    };
  } catch {
    return null;
  }
}

function applyDocumentTheme(settings: BrowserSettings) {
  document.documentElement.dataset.themeMode = settings.theme.mode;
  document.documentElement.style.setProperty(
    "--primary",
    normalizeAccentColor(settings.theme.accentColor),
  );
  document.documentElement.style.setProperty(
    "--accent",
    normalizeAccentColor(settings.theme.accentColor),
  );
  document.documentElement.style.setProperty(
    "--ring",
    normalizeAccentColor(settings.theme.accentColor),
  );
  document.title = settings.theme.customTitle || "Nova Browser";
  const icon = document.querySelector(
    "link[rel~='icon']",
  ) as HTMLLinkElement | null;
  if (icon && settings.theme.customFavicon) {
    icon.href = settings.theme.customFavicon;
  }
}

export function useBrowserStore() {
  const [isReady, setIsReady] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [user, setUser] = useState<BrowserUser | null>(null);
  const [banned, setBanned] = useState<BrowserBan | null>(null);
  const [transportConfig, setTransportConfig] =
    useState<TransportConfig | null>(null);
  const [themePresets, setThemePresets] =
    useState<ThemePreset[]>(DEFAULT_THEME_PRESETS);
  const [helpTips, setHelpTips] = useState<string[]>([]);
  const [alerts, setAlerts] = useState<BrowserAlert[]>([]);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const [proxyLocationError, setProxyLocationError] = useState<string | null>(null);
  const [scramjetError, setScramjetError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [syncPromptOpen, setSyncPromptOpen] = useState(false);
  const [pendingServerState, setPendingServerState] = useState<{
    settings: BrowserSettings;
    tabs: BrowserTab[];
    extras: BrowserExtras;
  } | null>(null);
  const [pendingLocalState, setPendingLocalState] = useState<{
    settings: BrowserSettings;
    tabs: BrowserTab[];
    extras: BrowserExtras;
  } | null>(null);
  const [tabs, setTabs] = useState<BrowserTab[]>([createTab()]);
  const [bookmarks, setBookmarks] =
    useState<Bookmark[]>(DEFAULT_EXTRAS.bookmarks);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const historyRef = useRef<HistoryEntry[]>([]);
  historyRef.current = history;
  const [shortcuts, setShortcuts] =
    useState<Shortcut[]>(DEFAULT_SHORTCUT_TILES);
  const [preloadedGamesApps, setPreloadedGamesApps] =
    useState<GameApp[]>(DEFAULT_GAMES);
  const [proxyLocations, setProxyLocations] = useState<ProxyLocationOption[]>([]);
  const [customGamesApps, setCustomGamesApps] = useState<GameApp[]>([]);
  const [settings, setSettings] =
    useState<BrowserSettings>(DEFAULT_SETTINGS);
  const [activePanelState, setActivePanelState] = useState<PanelType>("none");
  const activePanelRef = useRef<PanelType>("none");
  const [panelHistory, setPanelHistory] = useState<PanelType[]>([]);
  const panelHistoryRef = useRef<PanelType[]>([]);
  const [showTutorial, setShowTutorial] = useState(true);
  const [inspectRequestToken, setInspectRequestToken] = useState(0);
  const [passwordRecords, setPasswordRecords] = useState<
    SavedPasswordRecord[]
  >([]);
  const [syncSessionPasswords, setSyncSessionPasswords] = useState<SavedPasswordRecord[]>([]);
  const [syncAccountPasswords, setSyncAccountPasswords] = useState<SavedPasswordRecord[]>([]);
  const [inboxNotifications, setInboxNotifications] = useState<InboxNotification[]>([]);
  const [websiteMessages, setWebsiteMessages] = useState<WebsiteMessage[]>([]);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [notificationCenterTab, setNotificationCenterTab] = useState<"all" | "alerts" | "nova" | "websites" | "tickets">("all");
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminSessions, setAdminSessions] = useState<AdminSession[]>([]);
  const [adminLogs, setAdminLogs] = useState<AdminLogEntry[]>([]);
  const [blockedSites, setBlockedSites] = useState<BlockedSiteRecord[]>([]);
  const [adminAlerts, setAdminAlerts] = useState<BrowserAlert[]>([]);
  const [adminTickets, setAdminTickets] = useState<AdminSupportTicket[]>([]);
  const [adminNotifications, setAdminNotifications] = useState<AdminNotification[]>([]);
  const [adminActiveBans, setAdminActiveBans] = useState<AdminBanRecord[]>([]);
  const [adminRecentUnbans, setAdminRecentUnbans] = useState<AdminBanRecord[]>([]);
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null);
  const [selectedSupportTicketId, setSelectedSupportTicketId] = useState<string | null>(null);
  const [selectedAdminTicketId, setSelectedAdminTicketId] = useState<string | null>(null);
  const [adminSection, setAdminSection] = useState<"overview" | "logs" | "people" | "sessions" | "tickets" | "filters">("overview");
  const [adminSearchQuery, setAdminSearchQuery] = useState("");
  const ticketReadOverridesRef = useRef<Record<string, number>>({});
  const lastProxyBayMessageRef = useRef<string | null>(null);
  const lastScramjetBayMessageRef = useRef<string | null>(null);
  const [screenSharePrompt, setScreenSharePrompt] = useState<{
    id: string;
    adminUsername: string;
  } | null>(null);
  const [screenShareCaptureId, setScreenShareCaptureId] = useState<string | null>(null);
  const [inspectNotice, setInspectNotice] = useState<string | null>(null);
  const [setupAwaitingLogin, setSetupAwaitingLogin] = useState(false);
  const setupAwaitingLoginRef = useRef(false);
  const [tutorialJumpToReview, setTutorialJumpToReview] = useState(false);
  const closedTabsRef = useRef<Array<{ url: string; title: string; favicon: string }>>([]);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.isActive) ?? tabs[0],
    [tabs],
  );
  const gamesApps = useMemo(
    () => [...preloadedGamesApps, ...customGamesApps],
    [customGamesApps, preloadedGamesApps],
  );

  const inboxFeed = useMemo(
    () => [...inboxNotifications].sort((a, b) => b.created_at - a.created_at),
    [inboxNotifications],
  );

  const activePanel = activePanelState;
  const canGoBackPanel = panelHistory.length > 0;

  function replacePanelHistory(nextHistory: PanelType[]) {
    panelHistoryRef.current = nextHistory;
    setPanelHistory(nextHistory);
  }

  function setActivePanel(nextPanel: PanelType) {
    const currentPanel = activePanelRef.current;
    if (currentPanel === nextPanel) return;
    if (nextPanel === "none") {
      activePanelRef.current = "none";
      replacePanelHistory([]);
      setActivePanelState("none");
      return;
    }
    if (currentPanel !== "none") {
      const nextHistory = [...panelHistoryRef.current];
      if (nextHistory[nextHistory.length - 1] !== currentPanel) {
        nextHistory.push(currentPanel);
      }
      replacePanelHistory(nextHistory);
    }
    activePanelRef.current = nextPanel;
    setActivePanelState(nextPanel);
  }

  function goBackPanel() {
    const nextHistory = [...panelHistoryRef.current];
    const previousPanel = nextHistory.pop();
    if (!previousPanel) {
      setActivePanel("none");
      return;
    }
    replacePanelHistory(nextHistory);
    activePanelRef.current = previousPanel;
    setActivePanelState(previousPanel);
  }

  function applySupportTicketReadOverrides(items: SupportTicket[]) {
    return items.map((ticket) => {
      const overrideAt = ticketReadOverridesRef.current[ticket.id];
      if (!overrideAt) {
        return ticket;
      }
      if (ticket.updated_at <= overrideAt) {
        return { ...ticket, unread: false };
      }
      delete ticketReadOverridesRef.current[ticket.id];
      return ticket;
    });
  }

  function applyAdminTicketReadOverrides(items: AdminSupportTicket[]) {
    return items.map((ticket) => {
      const overrideAt = ticketReadOverridesRef.current[ticket.id];
      if (!overrideAt) {
        return ticket;
      }
      if (ticket.updated_at <= overrideAt) {
        return { ...ticket, unread: false, unread_for_admin: false };
      }
      delete ticketReadOverridesRef.current[ticket.id];
      return ticket;
    });
  }

  function openNotificationsPanel(tab?: "all" | "alerts" | "nova" | "websites" | "tickets") {
    if (tab) {
      setNotificationCenterTab(tab);
    }
    setActivePanel("notifications");
  }

  function openTicketsPanel(ticketId?: string | null) {
    setSelectedSupportTicketId(ticketId ?? null);
    setActivePanel("tickets");
  }

  function openAdminPanel(
    section: "overview" | "logs" | "people" | "sessions" | "tickets" | "filters" = "overview",
    options?: { ticketId?: string | null; searchQuery?: string },
  ) {
    setAdminSection(section);
    if (options?.ticketId !== undefined) {
      setSelectedAdminTicketId(options.ticketId);
    } else if (section === "tickets") {
      setSelectedAdminTicketId(null);
    }
    if (options?.searchQuery !== undefined) {
      setAdminSearchQuery(options.searchQuery);
    }
    setActivePanel("admin");
  }

  useEffect(() => {
    void loadBootstrap();
  }, []);

  useEffect(() => {
    if (!isReady) return;
    applyDocumentTheme(settings);
  }, [isReady, settings]);

  useEffect(() => {
    if (!isReady) return;
    const interval = window.setInterval(() => {
      void api<{ alerts: BrowserAlert[] }>("/api/alerts")
        .then((payload) => setAlerts(payload.alerts))
        .catch(() => {});
    }, 15000);
    return () => window.clearInterval(interval);
  }, [isReady]);

  useEffect(() => {
    if (!isReady) return;
    void refreshInbox();
    const interval = window.setInterval(() => {
      void refreshInbox();
    }, 12000);
    return () => window.clearInterval(interval);
  }, [isReady, user?.id]);

  useEffect(() => {
    if (!isReady) return;
    const interval = window.setInterval(() => {
      void (async () => {
        try {
          const payload = await api<{
            request: {
              id: string;
              status: string;
              adminUsername: string;
            } | null;
          }>("/api/session/screen-share");
          const request = payload.request;
          if (!request) {
            setScreenSharePrompt(null);
            setScreenShareCaptureId(null);
            return;
          }
          if (request.status === "pending") {
            setScreenSharePrompt({
              id: request.id,
              adminUsername: request.adminUsername,
            });
            setScreenShareCaptureId((current) =>
              current === request.id ? current : null,
            );
          } else if (request.status === "streaming") {
            setScreenSharePrompt(null);
            setScreenShareCaptureId(request.id);
          }
        } catch {
          // ignore
        }
      })();
    }, 2000);
    return () => window.clearInterval(interval);
  }, [isReady]);

  useEffect(() => {
    if (!isReady) return;
    const poll = () => {
      void api<{ banned: BrowserBan | null }>("/api/session/status")
        .then((payload) => {
          setBanned(payload.banned);
        })
        .catch(() => {});
    };
    const handleVisibilityRefresh = () => {
      if (document.visibilityState === "visible") {
        poll();
      }
    };
    poll();
    const interval = window.setInterval(poll, 2_000);
    window.addEventListener("focus", poll);
    document.addEventListener("visibilitychange", handleVisibilityRefresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", poll);
      document.removeEventListener("visibilitychange", handleVisibilityRefresh);
    };
  }, [isReady]);

  useEffect(() => {
    if (!isReady) return;
    const timer = window.setTimeout(() => {
      const extras: BrowserExtras = {
        bookmarks,
        history,
        shortcutTiles: shortcuts,
        customAppsGames: customGamesApps,
        tutorialDismissed: !showTutorial,
      };
      if (!user) {
        localStorage.setItem(
          LOCAL_STATE_KEY,
          JSON.stringify({ sessionId, settings, tabs, extras }),
        );
      }
      void api("/api/state/settings", {
        method: "POST",
        body: JSON.stringify({ settings }),
      }).catch(() => {});
      void api("/api/state/tabs", {
        method: "POST",
        body: JSON.stringify({ tabs }),
      }).catch(() => {});
      void api("/api/state/shortcuts", {
        method: "POST",
        body: JSON.stringify({ shortcuts: extras }),
      }).catch(() => {});
    }, 250);

    return () => window.clearTimeout(timer);
  }, [bookmarks, customGamesApps, history, isReady, settings, shortcuts, showTutorial, tabs, user]);

  useEffect(() => {
    if (!syncPromptOpen) return;
    if (!pendingServerState || !pendingLocalState) {
      setSyncPromptOpen(false);
    }
  }, [pendingLocalState, pendingServerState, syncPromptOpen]);

  useEffect(() => {
    if (!syncPromptOpen || !user) return;
    void refreshSyncPreview();
  }, [syncPromptOpen, user?.id]);

  async function loadBootstrap() {
    const payload = await api<BootstrapPayload>("/api/bootstrap");
    const serverSettings = coerceSettings(payload.browserState.settings);
    const serverTabs = coerceTabs(
      payload.browserState.tabs,
      serverSettings.restoreTabs,
    );
    const serverExtras = coerceExtras(payload.browserState.shortcuts);
    const localState = getLocalState();
    const historyLiveSnapshot = historyRef.current.slice();

    setSessionId(payload.sessionId);
    setUser(payload.user);
    setBanned(payload.banned);
    setTransportConfig(payload.transport);
    setProxyLocationError(payload.transport.proxyWarning ?? null);
    setAlerts(payload.alerts);
    setHelpTips(payload.defaults.helpTips ?? []);
    setThemePresets(
      payload.defaults.themes?.length
        ? payload.defaults.themes.map((theme) => ({
            id: theme.id,
            name: theme.name,
            accentColor:
              normalizeAccentColor(
                theme.accentColor ??
                  theme.accent ??
                  DEFAULT_THEME_PRESETS[0].accentColor,
              ),
            backgroundUrl:
              theme.backgroundUrl ??
              theme.backgroundImage ??
              DEFAULT_THEME_PRESETS[0].backgroundUrl,
          }))
        : DEFAULT_THEME_PRESETS,
    );
    setPreloadedGamesApps(
      coerceGameApps(payload.defaults.catalog?.appsGames).length > 0
        ? coerceGameApps(payload.defaults.catalog?.appsGames)
        : DEFAULT_GAMES,
    );
    setProxyLocations(
      Array.isArray(payload.defaults.proxyLocations) &&
        payload.defaults.proxyLocations.length > 0
        ? payload.defaults.proxyLocations
        : [],
    );

    if (!payload.user && localState?.sessionId === payload.sessionId) {
      const localSettings = coerceSettings(localState.settings);
      const localTabs = coerceTabs(localState.tabs, localSettings.restoreTabs);
      const guestExtras = coerceExtras(localState.extras);
      setSettings(
        payload.transport.proxyLocationId
          ? { ...localSettings, proxyLocation: payload.transport.proxyLocationId }
          : localSettings,
      );
      setTabs(localTabs);
      setBookmarks(guestExtras.bookmarks);
      setHistory(guestExtras.history);
      setShortcuts(guestExtras.shortcutTiles);
      setCustomGamesApps(guestExtras.customAppsGames);
      setShowTutorial(!guestExtras.tutorialDismissed);
      setIsReady(true);
      return;
    }

    if (!payload.user && localState && localState.sessionId !== payload.sessionId) {
      localStorage.removeItem(LOCAL_STATE_KEY);
    }

    setSettings(
      payload.transport.proxyLocationId
        ? { ...serverSettings, proxyLocation: payload.transport.proxyLocationId }
        : serverSettings,
    );
    setTabs(serverTabs);
    setBookmarks(serverExtras.bookmarks);
    setHistory(serverExtras.history);
    setShortcuts(serverExtras.shortcutTiles);
    setCustomGamesApps(serverExtras.customAppsGames);
    setShowTutorial(!serverExtras.tutorialDismissed);

    if (payload.user && localState) {
      const localSettings = coerceSettings(localState.settings);
      const localTabs = coerceTabs(localState.tabs, localSettings.restoreTabs);
      const localExtras = coerceExtras(localState.extras);
      const localExtrasForSync: BrowserExtras = {
        ...localExtras,
        history: mergeLocalHistoryForSync(localExtras.history, historyLiveSnapshot),
      };
      if (
        JSON.stringify({
          settings: localSettings,
          tabs: localTabs,
          extras: localExtrasForSync,
        }) !==
        JSON.stringify({
          settings: serverSettings,
          tabs: serverTabs,
          extras: serverExtras,
        })
      ) {
        setPendingServerState({
          settings: serverSettings,
          tabs: serverTabs,
          extras: serverExtras,
        });
        setPendingLocalState({
          settings: localSettings,
          tabs: localTabs,
          extras: localExtrasForSync,
        });
        setSyncPromptOpen(true);
      }
    }

    if (payload.user && setupAwaitingLoginRef.current) {
      setupAwaitingLoginRef.current = false;
      setSetupAwaitingLogin(false);
      setTutorialJumpToReview(true);
      setActivePanel("none");
    }

    setIsReady(true);
  }

  function withActiveTab(updater: (tab: BrowserTab) => BrowserTab) {
    setTabs((current) =>
      current.map((tab) => (tab.isActive ? updater(tab) : tab)),
    );
  }

  function addTab(url = "newtab", title = "New Tab") {
    const tab = createTab(url, title);
    tab.isLoading = url !== "newtab";
    setTabs((current) => {
      if (current.length >= MAX_TABS) {
        setNavigationError("Nova limits the browser to 100 open tabs.");
        return current;
      }
      return [
        ...current.map((item) => ({ ...item, isActive: false })),
        tab,
      ];
    });
  }

  function closeTab(tabId: string) {
    const closing = tabs.find((tab) => tab.id === tabId);
    if (
      closing &&
      closing.url !== "newtab" &&
      !closing.url.startsWith("nova://") &&
      !closing.url.startsWith("about:")
    ) {
      closedTabsRef.current = [
        {
          url: closing.url,
          title: closing.title,
          favicon: closing.favicon || faviconForUrl(closing.url),
        },
        ...closedTabsRef.current,
      ].slice(0, 20);
    }
    setTabs((current) => {
      const index = current.findIndex((tab) => tab.id === tabId);
      const remaining = current.filter((tab) => tab.id !== tabId);
      if (remaining.length === 0) {
        return [createTab()];
      }
      if (!remaining.some((tab) => tab.isActive)) {
        remaining[Math.max(0, index - 1)].isActive = true;
      }
      return remaining;
    });
  }

  function restoreLastClosedTab() {
    const entry = closedTabsRef.current[0];
    if (!entry) return;
    closedTabsRef.current = closedTabsRef.current.slice(1);
    addTab(entry.url, entry.title);
  }

  function setActiveTab(tabId: string) {
    const now = Date.now();
    setTabs((current) =>
      current.map((tab) => ({
        ...tab,
        isActive: tab.id === tabId,
        lastActiveAt: tab.id === tabId ? now : tab.lastActiveAt ?? now,
      })),
    );
  }

  function markTabLoading(tabId: string, isLoading: boolean) {
    setTabs((current) =>
      current.map((tab) => (tab.id === tabId ? { ...tab, isLoading } : tab)),
    );
  }

  function toggleTabMuted(tabId: string) {
    setTabs((current) =>
      current.map((tab) =>
        tab.id === tabId ? { ...tab, isMuted: !tab.isMuted } : tab,
      ),
    );
  }

  function syncTabFromFrame(tabId: string, url: string, title?: string) {
    if (!url || url === "about:blank") return;
    const nextTitle = title?.trim() || titleFromUrl(url);
    const nextFav = faviconForUrl(url);

    setTabs((current) =>
      current.map((tab) => {
        if (tab.id !== tabId) return tab;
        const history = tab.history ?? [tab.url];
        const historyIndex = tab.historyIndex ?? history.length - 1;
        const currentUrl = history[historyIndex];
        const sameLocation =
          normalizeUrlForTabSync(currentUrl) === normalizeUrlForTabSync(url);

        if (sameLocation) {
          const nextHistory = [...history];
          const urlForTab =
            normalizeUrlForTabSync(url) === normalizeUrlForTabSync(tab.url)
              ? tab.url
              : url;
          nextHistory[historyIndex] = urlForTab;
          return {
            ...tab,
            url: urlForTab,
            title: nextTitle,
            favicon: nextFav,
            history: nextHistory,
          };
        }

        const nextHistory = [...history.slice(0, historyIndex + 1), url];
        const nextIndex = nextHistory.length - 1;
        setHistory((entries) => {
          if (
            entries[0] &&
            normalizeUrlForTabSync(entries[0].url) === normalizeUrlForTabSync(url)
          ) {
            return entries;
          }
          return [
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              title: nextTitle,
              url,
              favicon: nextFav,
              timestamp: Date.now(),
              category: "redirect",
              flagged: false,
            },
            ...entries,
          ];
        });
        return {
          ...tab,
          url,
          title: nextTitle,
          favicon: nextFav,
          history: nextHistory,
          historyIndex: nextIndex,
          canGoBack: nextIndex > 0,
          canGoForward: false,
        };
      }),
    );

    if (/^https?:/i.test(url)) {
      const norm = normalizeShortcutMatchUrl(url);
      setShortcuts((current) => {
        const idx = current.findIndex((s) => normalizeShortcutMatchUrl(s.url) === norm);
        if (idx < 0) return current;
        const next = [...current];
        next[idx] = {
          ...next[idx],
          favicon: nextFav || next[idx].favicon,
        };
        return next;
      });
      setBookmarks((current) =>
        current.map((bookmark) =>
          normalizeShortcutMatchUrl(bookmark.url) === norm
            ? {
                ...bookmark,
                favicon: nextFav || bookmark.favicon,
                title: nextTitle || bookmark.title,
              }
            : bookmark,
        ),
      );
    }
  }

  function pushWebsiteMessage(
    entry: Omit<WebsiteMessage, "id" | "created_at" | "is_read">,
  ) {
    setWebsiteMessages((current) => [
      {
        ...entry,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        created_at: Date.now(),
        is_read: false,
      },
      ...current,
    ].slice(0, 100));
  }

  function pushSystemBayNotice(title: string, message: string) {
    pushWebsiteMessage({
      tab_id: "system",
      tab_title: "Nova",
      tab_url: "",
      kind: "notification",
      title,
      message,
    });
  }

  const pushSystemBayNoticeRef = useRef(pushSystemBayNotice);
  pushSystemBayNoticeRef.current = pushSystemBayNotice;

  const helpTipsSignature = helpTips.join("\0");
  useEffect(() => {
    if (!isReady || !settings.showTips || helpTips.length === 0) {
      return;
    }
    const tips = helpTips;
    const interval = window.setInterval(() => {
      const tip = tips[Math.floor(Math.random() * tips.length)];
      pushSystemBayNoticeRef.current("Nova tip", tip);
    }, 5 * 60_000);
    return () => window.clearInterval(interval);
  }, [helpTipsSignature, helpTips.length, isReady, settings.showTips]);

  useEffect(() => {
    if (!proxyLocationError) {
      lastProxyBayMessageRef.current = null;
      return;
    }
    if (lastProxyBayMessageRef.current === proxyLocationError) return;
    lastProxyBayMessageRef.current = proxyLocationError;
    pushSystemBayNotice("Proxy issue", proxyLocationError);
  }, [proxyLocationError]);

  useEffect(() => {
    if (!scramjetError) {
      lastScramjetBayMessageRef.current = null;
      return;
    }
    if (lastScramjetBayMessageRef.current === scramjetError) return;
    lastScramjetBayMessageRef.current = scramjetError;
    pushSystemBayNotice("Proxy issue", scramjetError);
  }, [scramjetError]);

  function setWebsiteMessageRead(id: string, read: boolean) {
    setWebsiteMessages((current) =>
      current.map((message) =>
        message.id === id ? { ...message, is_read: read } : message,
      ),
    );
  }

  function applyBlockedNavigationToActiveTab(reason: string, targetUrl: string, adminBypassAllowed = false) {
    const internalUrl = blockedPageUrl(reason, targetUrl, adminBypassAllowed);
    setNavigationError(null);
    withActiveTab((tab) => {
      const priorHistory = tab.history ?? [tab.url];
      const currentIndex = tab.historyIndex ?? priorHistory.length - 1;
      const nextHistory = [...priorHistory.slice(0, currentIndex + 1), internalUrl];
      const nextIndex = nextHistory.length - 1;
      return {
        ...tab,
        title: "Blocked",
        url: internalUrl,
        favicon: "",
        isLoading: false,
        history: nextHistory,
        historyIndex: nextIndex,
        canGoBack: nextIndex > 0,
        canGoForward: false,
      };
    });
  }

  function applyBlockedNavigationToTab(
    tabId: string,
    reason: string,
    targetUrl: string,
    adminBypassAllowed = false,
  ) {
    const internalUrl = blockedPageUrl(reason, targetUrl, adminBypassAllowed);
    setNavigationError(null);
    setTabs((current) =>
      current.map((tab) => {
        if (tab.id !== tabId) return tab;
        const priorHistory = tab.history ?? [tab.url];
        const currentIndex = tab.historyIndex ?? priorHistory.length - 1;
        const nextHistory = [...priorHistory.slice(0, currentIndex + 1), internalUrl];
        const nextIndex = nextHistory.length - 1;
        return {
          ...tab,
          title: "Blocked",
          url: internalUrl,
          favicon: "",
          isLoading: false,
          history: nextHistory,
          historyIndex: nextIndex,
          canGoBack: nextIndex > 0,
          canGoForward: false,
        };
      }),
    );
  }

  async function requestNavigationResolve(
    rawUrl: string,
    titleHint: string,
    options?: { allowAdminBypass?: boolean },
  ) {
    try {
      const result = await api<{
        blocked?: boolean;
        url: string;
        category: string;
        flagged: boolean;
      }>("/api/navigation/resolve", {
        method: "POST",
        body: JSON.stringify({ url: rawUrl, title: titleHint, allowAdminBypass: options?.allowAdminBypass }),
      });
      return {
        ok: true as const,
        resolvedUrl: result.url,
        title: titleFromUrl(result.url),
        category: result.category,
        flagged: result.flagged,
      };
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        const payload = error.payload;
        if (
          payload &&
          typeof payload === "object" &&
          "blocked" in payload &&
          (payload as { blocked?: boolean }).blocked === true
        ) {
          const p = payload as { reason?: string; url?: string; adminBypassAllowed?: boolean };
          return {
            ok: false as const,
            blocked: true as const,
            reason: p.reason ?? "This website is blocked.",
            targetUrl: p.url ?? rawUrl,
            adminBypassAllowed: Boolean(p.adminBypassAllowed),
          };
        }
      }
      throw error;
    }
  }

  async function resolveNavigationTarget(rawUrl: string, titleHint: string) {
    const outcome = await requestNavigationResolve(rawUrl, titleHint);
    if (!outcome.ok) {
      applyBlockedNavigationToActiveTab(outcome.reason, outcome.targetUrl, outcome.adminBypassAllowed);
      return null;
    }
    setHistory((current) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: outcome.title,
        url: outcome.resolvedUrl,
        favicon: "",
        timestamp: Date.now(),
        category: outcome.category,
        flagged: outcome.flagged,
      },
      ...current,
    ]);
    setNavigationError(null);
    return { resolvedUrl: outcome.resolvedUrl, title: outcome.title };
  }

  async function handleFrameNavigation(tabId: string, url: string, title?: string) {
    if (!url || url === "about:blank") return;
    if (!/^https?:/i.test(url)) {
      syncTabFromFrame(tabId, url, title);
      return;
    }

    try {
      const tab = tabs.find((entry) => entry.id === tabId);
      const allowAdminBypass =
        Boolean(tab) &&
        /^https?:/i.test(tab?.url ?? "") &&
        normalizeAdminBypassHost(tab?.url ?? "") !== "" &&
        normalizeAdminBypassHost(tab?.url ?? "") === normalizeAdminBypassHost(url);
      const outcome = await requestNavigationResolve(
        url,
        title?.trim() || titleFromUrl(url),
        allowAdminBypass ? { allowAdminBypass: true } : undefined,
      );
      if (!outcome.ok) {
        applyBlockedNavigationToTab(tabId, outcome.reason, outcome.targetUrl, outcome.adminBypassAllowed);
        return;
      }
      syncTabFromFrame(tabId, outcome.resolvedUrl, title ?? outcome.title);
    } catch {
      syncTabFromFrame(tabId, url, title);
    }
  }

  async function navigateTo(rawUrl: string, options?: { allowAdminBypass?: boolean }) {
    if (!activeTab) return;

    if (rawUrl === "newtab" || isInternalNovaUrl(rawUrl)) {
      withActiveTab((tab) => {
        const priorHistory = tab.history ?? [tab.url];
        const currentIndex = tab.historyIndex ?? priorHistory.length - 1;
        const nextHistory = [...priorHistory.slice(0, currentIndex + 1), rawUrl];
        const nextIndex = nextHistory.length - 1;
        return {
          ...tab,
          title: titleFromUrl(rawUrl),
          url: rawUrl,
          favicon: "",
          isLoading: false,
          history: nextHistory,
          historyIndex: nextIndex,
          canGoBack: nextIndex > 0,
          canGoForward: false,
        };
      });
      setNavigationError(null);
      return;
    }

    try {
      const outcome = await requestNavigationResolve(rawUrl, activeTab.title, options);
      if (!outcome.ok) {
        applyBlockedNavigationToActiveTab(outcome.reason, outcome.targetUrl, outcome.adminBypassAllowed);
        return;
      }
      const resolved = {
        resolvedUrl: outcome.resolvedUrl,
        title: outcome.title,
        category: outcome.category,
        flagged: outcome.flagged,
      };
      const { resolvedUrl, title } = resolved;
      setHistory((current) => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          title,
          url: resolvedUrl,
          favicon: "",
          timestamp: Date.now(),
          category: resolved.category,
          flagged: resolved.flagged,
        },
        ...current,
      ]);
      setNavigationError(null);

      withActiveTab((tab) => {
        const priorHistory = tab.history ?? [tab.url];
        const currentIndex = tab.historyIndex ?? priorHistory.length - 1;
        const nextHistory = [
          ...priorHistory.slice(0, currentIndex + 1),
          resolvedUrl,
        ];
        const nextIndex = nextHistory.length - 1;
        return {
          ...tab,
          title,
          url: resolvedUrl,
          favicon: faviconForUrl(resolvedUrl),
          isLoading: true,
          history: nextHistory,
          historyIndex: nextIndex,
          canGoBack: nextIndex > 0,
          canGoForward: false,
        };
      });
    } catch (error) {
      if (error instanceof ApiError) {
        setNavigationError(error.message);
        return;
      }
      setNavigationError("Unable to navigate to that page.");
    }
  }

  async function openInNewTab(rawUrl: string, titleHint = "New Tab", options?: { allowAdminBypass?: boolean }) {
    if (isInternalNovaUrl(rawUrl)) {
      addTab(rawUrl, titleFromUrl(rawUrl));
      return;
    }
    try {
      const outcome = await requestNavigationResolve(rawUrl, titleHint, options);
      if (!outcome.ok) {
        addTab(blockedPageUrl(outcome.reason, outcome.targetUrl, outcome.adminBypassAllowed), "Blocked");
        return;
      }
      setHistory((current) => [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          title: outcome.title,
          url: outcome.resolvedUrl,
          favicon: "",
          timestamp: Date.now(),
          category: outcome.category,
          flagged: outcome.flagged,
        },
        ...current,
      ]);
      setNavigationError(null);
      addTab(outcome.resolvedUrl, outcome.title);
    } catch (error) {
      if (error instanceof ApiError) {
        setNavigationError(error.message);
        return;
      }
      setNavigationError("Unable to open that page in a new tab.");
    }
  }

  function goBack() {
    if (!activeTab?.history || (activeTab.historyIndex ?? 0) <= 0) return;
    const nextIndex = (activeTab.historyIndex ?? 0) - 1;
    const url = activeTab.history[nextIndex];
    withActiveTab((tab) => ({
      ...tab,
      url,
      title: titleFromUrl(url),
      favicon: faviconForUrl(url),
      isLoading: url !== "newtab" && !isInternalNovaUrl(url),
      historyIndex: nextIndex,
      canGoBack: nextIndex > 0,
      canGoForward: nextIndex < (tab.history?.length ?? 0) - 1,
    }));
  }

  function goForward() {
    if (!activeTab?.history) return;
    const nextIndex = (activeTab.historyIndex ?? 0) + 1;
    if (nextIndex >= activeTab.history.length) return;
    const url = activeTab.history[nextIndex];
    withActiveTab((tab) => ({
      ...tab,
      url,
      title: titleFromUrl(url),
      favicon: faviconForUrl(url),
      isLoading: url !== "newtab" && !isInternalNovaUrl(url),
      historyIndex: nextIndex,
      canGoBack: nextIndex > 0,
      canGoForward: nextIndex < (tab.history?.length ?? 0) - 1,
    }));
  }

  function regenTab() {
    if (!activeTab) return;
    if (activeTab.url === "newtab") {
      withActiveTab((tab) => ({
        ...tab,
        title: "New Tab",
        isLoading: false,
      }));
      return;
    }
    if (activeTab.url.startsWith("nova://")) {
      withActiveTab((tab) => ({
        ...tab,
        isLoading: false,
        reloadToken: Date.now(),
      }));
      return;
    }
    withActiveTab((tab) => ({
      ...tab,
      isLoading: true,
      reloadToken: Date.now(),
    }));
  }

  function addBookmark(bookmark: Omit<Bookmark, "id">) {
    setBookmarks((current) => [...current, { ...bookmark, id: `${Date.now()}` }]);
  }

  function removeBookmark(id: string) {
    setBookmarks((current) => current.filter((bookmark) => bookmark.id !== id));
  }

  function setShortcutTiles(value: Shortcut[]) {
    setShortcuts(value.slice(0, MAX_SHORTCUT_TILES).map(normalizeShortcutTile));
  }

  function addShortcutTile(shortcut: Omit<Shortcut, "id" | "favicon"> & { favicon?: string }) {
    setShortcuts((current) => {
      if (current.length >= MAX_SHORTCUT_TILES) {
        return current;
      }
      const nextShortcut = normalizeShortcutTile({
        id: `${Date.now()}`,
        title: shortcut.title,
        url: shortcut.url,
        favicon: shortcut.favicon ?? faviconForUrl(shortcut.url),
        color: shortcut.color,
      });
      const withoutDuplicate = current.filter((entry) => entry.url !== nextShortcut.url);
      return [...withoutDuplicate, nextShortcut].slice(0, MAX_SHORTCUT_TILES);
    });
  }

  function updateShortcutTile(id: string, patch: Partial<Shortcut>) {
    setShortcuts((current) =>
      current.map((entry) =>
        entry.id === id
          ? normalizeShortcutTile({
              ...entry,
              ...patch,
              favicon:
                patch.favicon ??
                (patch.url && patch.url !== entry.url
                  ? faviconForUrl(patch.url)
                  : entry.favicon),
            })
          : entry,
      ),
    );
  }

  function moveShortcutTile(id: string, targetIndex: number) {
    setShortcuts((current) => {
      const index = current.findIndex((entry) => entry.id === id);
      if (index < 0) return current;
      if (targetIndex < 0 || targetIndex >= current.length || targetIndex === index) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  function removeShortcutTile(id: string) {
    setShortcuts((current) => current.filter((entry) => entry.id !== id));
  }

  function addCustomGameApp(entry: Omit<GameApp, "id" | "isCustom">) {
    setCustomGamesApps((current) => [
      ...current,
      normalizeGameAppEntry({
        ...entry,
        id: `${entry.category}-${Date.now()}`,
        isCustom: true,
      }),
    ]);
  }

  function removeCustomGameApp(id: string) {
    setCustomGamesApps((current) => current.filter((entry) => entry.id !== id));
  }

  function moveTab(fromIndex: number, toIndex: number) {
    setTabs((current) => {
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function failTabLoad(tabId: string, targetUrl: string) {
    const timeoutUrl = `nova://scramjet-error?message=${encodeURIComponent("This page took too long to load. You can try again, open it in a fresh tab, or check your connection.")}&title=${encodeURIComponent("Page load timed out")}&target=${encodeURIComponent(targetUrl)}`;
    setTabs((current) =>
      current.map((tab) => {
        if (tab.id !== tabId || !tab.isLoading) {
          return tab;
        }
        const priorHistory = tab.history ?? [tab.url];
        const currentIndex = tab.historyIndex ?? priorHistory.length - 1;
        const nextHistory = [...priorHistory.slice(0, currentIndex + 1), timeoutUrl];
        const nextIndex = nextHistory.length - 1;
        return {
          ...tab,
          title: "Page load timed out",
          url: timeoutUrl,
          favicon: "",
          isLoading: false,
          history: nextHistory,
          historyIndex: nextIndex,
          canGoBack: nextIndex > 0,
          canGoForward: false,
        };
      }),
    );
  }

  function updateSettings(partial: Partial<BrowserSettings>) {
    setSettings((current) => ({ ...current, ...partial }));
  }

  async function updateProxyLocation(locationId: string) {
    const merged = { ...settings, proxyLocation: locationId };
    setSettings(merged);
    try {
      await api("/api/state/settings", {
        method: "POST",
        body: JSON.stringify({ settings: merged }),
      });
      const payload = await api<{ transport: TransportConfig }>("/api/session/transport");
      setTransportConfig(payload.transport);
      setProxyLocationError(payload.transport.proxyWarning ?? null);
      if (payload.transport.proxyLocationId && payload.transport.proxyLocationId !== merged.proxyLocation) {
        const fallbackSettings = { ...merged, proxyLocation: payload.transport.proxyLocationId };
        setSettings(fallbackSettings);
        await api("/api/state/settings", {
          method: "POST",
          body: JSON.stringify({ settings: fallbackSettings }),
        });
      }
    } catch {
      // Ignore network errors; debounced persistence will retry settings.
    }
  }

  function updateTheme(partial: Partial<BrowserSettings["theme"]>) {
    setSettings((current) => ({
      ...current,
      theme: { ...current.theme, ...partial },
    }));
  }

  function dismissTutorial() {
    setShowTutorial(false);
    try {
      const localState = getLocalState();
      localStorage.setItem(
        LOCAL_STATE_KEY,
        JSON.stringify({
          sessionId,
          settings: localState?.settings ?? settings,
          tabs: localState?.tabs ?? tabs,
          extras: {
            bookmarks: localState?.extras.bookmarks ?? bookmarks,
            history: localState?.extras.history ?? history,
            shortcutTiles: localState?.extras.shortcutTiles ?? shortcuts,
            customAppsGames: localState?.extras.customAppsGames ?? customGamesApps,
            tutorialDismissed: true,
          },
        }),
      );
    } catch {
      // Ignore storage errors and let the normal persistence effect retry.
    }
  }

  function clearHistory() {
    setHistory([]);
  }

  function removeHistoryEntry(id: string) {
    setHistory((current) => current.filter((entry) => entry.id !== id));
  }

  function markAllWebsiteMessagesRead() {
    setWebsiteMessages((current) =>
      current.map((message) => ({ ...message, is_read: true })),
    );
  }

  function requestInspect() {
    const tab = tabs.find((t) => t.isActive);
    if (
      !tab ||
      tab.url === "newtab" ||
      tab.url.startsWith("nova://") ||
      tab.url.startsWith("about:")
    ) {
      const msg =
        "Inspect can't run here: the New Tab page and other Nova built-in screens aren't a real site iframe, so Eruda has nothing to attach to. Open any website in this tab, then try Inspect again.";
      setInspectNotice(msg);
      pushSystemBayNotice("Inspect unavailable", msg);
      return;
    }
    setInspectNotice(null);
    setInspectRequestToken((current) => current + 1);
  }

  function clearInspectNotice() {
    setInspectNotice(null);
  }

  function notifyInspectFailure(message: string) {
    setInspectNotice(message);
    pushSystemBayNotice("Inspect", message);
  }

  function clearTutorialJumpToReview() {
    setTutorialJumpToReview(false);
  }

  function beginSetupLogin() {
    setupAwaitingLoginRef.current = true;
    setSetupAwaitingLogin(true);
  }

  async function login(username: string, password: string, totpToken?: string) {
    try {
      setAuthError(null);
      await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password, totpToken }),
      });
      await loadBootstrap();
      void refreshPasswords();
      return true;
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Sign in failed.");
      return false;
    }
  }

  async function loginFromSetupWizard(username: string, password: string, totpToken?: string) {
    beginSetupLogin();
    return login(username, password, totpToken);
  }

  async function register(username: string, password: string) {
    try {
      setAuthError(null);
      await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      await loadBootstrap();
      return true;
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Account creation failed.",
      );
      return false;
    }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
    setSyncSessionPasswords([]);
    setSyncAccountPasswords([]);
    localStorage.removeItem(LOCAL_STATE_KEY);
    await loadBootstrap();
  }

  async function syncLocalStateToAccount() {
    const localSnapshot = pendingLocalState ?? {
      settings,
      tabs,
      extras: {
        bookmarks,
        history,
        shortcutTiles: shortcuts,
        customAppsGames: customGamesApps,
        tutorialDismissed: !showTutorial,
      },
    };
    await api("/api/state/sync-local", {
      method: "POST",
      body: JSON.stringify({
        settings: localSnapshot.settings,
        tabs: localSnapshot.tabs,
        shortcuts: localSnapshot.extras,
      }),
    });
    setSettings(localSnapshot.settings);
    setTabs(localSnapshot.tabs);
    setBookmarks(localSnapshot.extras.bookmarks);
    setHistory(localSnapshot.extras.history);
    setShortcuts(localSnapshot.extras.shortcutTiles);
    setCustomGamesApps(localSnapshot.extras.customAppsGames);
    setShowTutorial(!localSnapshot.extras.tutorialDismissed);
    setSyncPromptOpen(false);
    setPendingServerState(null);
    setPendingLocalState(null);
    setSyncSessionPasswords([]);
    setSyncAccountPasswords([]);
    localStorage.removeItem(LOCAL_STATE_KEY);
  }

  function useServerState() {
    if (!pendingServerState) {
      setSyncPromptOpen(false);
      setPendingLocalState(null);
      localStorage.removeItem(LOCAL_STATE_KEY);
      return;
    }
    setSettings(pendingServerState.settings);
    setTabs(pendingServerState.tabs);
    setBookmarks(pendingServerState.extras.bookmarks);
    setHistory(pendingServerState.extras.history);
    setShortcuts(pendingServerState.extras.shortcutTiles);
    setCustomGamesApps(pendingServerState.extras.customAppsGames);
    setShowTutorial(!pendingServerState.extras.tutorialDismissed);
    setSyncPromptOpen(false);
    setPendingServerState(null);
    setPendingLocalState(null);
    setSyncSessionPasswords([]);
    setSyncAccountPasswords([]);
    localStorage.removeItem(LOCAL_STATE_KEY);
  }

  async function startTotpSetup() {
    return api<{
      base32: string;
      qrCodeDataUrl: string;
      otpauthUrl: string;
    }>("/api/auth/totp/setup", { method: "POST" });
  }

  async function verifyTotp(token: string) {
    await api("/api/auth/totp/verify", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
    await loadBootstrap();
  }

  async function disableTotp() {
    await api("/api/auth/totp", { method: "DELETE" });
    await loadBootstrap();
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    await api("/api/auth/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  async function refreshPasswords() {
    try {
      const payload = await api<{ passwords: SavedPasswordRecord[] }>(
        "/api/passwords",
      );
      setPasswordRecords(payload.passwords);
    } catch {
      setPasswordRecords([]);
    }
  }

  async function refreshSyncPreview() {
    if (!user) {
      setSyncSessionPasswords([]);
      setSyncAccountPasswords([]);
      return;
    }
    try {
      const payload = await api<{
        sessionPasswords: SavedPasswordRecord[];
        accountPasswords: SavedPasswordRecord[];
      }>("/api/state/sync-preview");
      setSyncSessionPasswords(payload.sessionPasswords);
      setSyncAccountPasswords(payload.accountPasswords);
    } catch {
      setSyncSessionPasswords([]);
      setSyncAccountPasswords([]);
    }
  }

  async function applyMergedSyncState(
    mergedState: {
      settings: BrowserSettings;
      tabs: BrowserTab[];
      extras: BrowserExtras;
    },
    importPasswordIds: string[],
  ) {
    await api("/api/state/sync-local", {
      method: "POST",
      body: JSON.stringify({
        settings: mergedState.settings,
        tabs: mergedState.tabs,
        shortcuts: mergedState.extras,
      }),
    });

    if (importPasswordIds.length > 0) {
      await api("/api/passwords/import-session", {
        method: "POST",
        body: JSON.stringify({ ids: importPasswordIds }),
      });
    }

    setSettings(mergedState.settings);
    setTabs(mergedState.tabs);
    setBookmarks(mergedState.extras.bookmarks);
    setHistory(mergedState.extras.history);
    setShortcuts(mergedState.extras.shortcutTiles);
    setCustomGamesApps(mergedState.extras.customAppsGames);
    setShowTutorial(!mergedState.extras.tutorialDismissed);
    setSyncPromptOpen(false);
    setPendingServerState(null);
    setPendingLocalState(null);
    setSyncSessionPasswords([]);
    setSyncAccountPasswords([]);
    localStorage.removeItem(LOCAL_STATE_KEY);
    await refreshPasswords();
  }

  async function savePassword(
    origin: string,
    username: string,
    password: string,
  ) {
    await api("/api/passwords", {
      method: "POST",
      body: JSON.stringify({ origin, username, password }),
    });
    await refreshPasswords();
  }

  async function deletePassword(id: string) {
    await api(`/api/passwords/${id}`, { method: "DELETE" });
    await refreshPasswords();
  }

  async function refreshInbox() {
    try {
      const payload = await api<{
        notifications: InboxNotification[];
        tickets: SupportTicket[];
      }>("/api/messages/inbox");
      setInboxNotifications(payload.notifications);
      setSupportTickets(applySupportTicketReadOverrides(payload.tickets));
    } catch {
      setInboxNotifications([]);
      setSupportTickets([]);
    }
  }

  async function setNotificationRead(id: string, read: boolean) {
    await api(`/api/messages/notifications/${id}/state`, {
      method: "POST",
      body: JSON.stringify({ read }),
    });
    setInboxNotifications((current) =>
      current.map((notification) =>
        notification.id === id
          ? { ...notification, is_read: read }
          : notification,
      ),
    );
  }

  async function setAdminNotificationRead(id: string, read: boolean) {
    await api(`/api/admin/notifications/${encodeURIComponent(id)}/read`, {
      method: "POST",
      body: JSON.stringify({ read }),
    });
    setAdminNotifications((current) =>
      current.map((notification) =>
        notification.id === id ? { ...notification, unread: read ? false : true } : notification,
      ),
    );
  }

  async function createSupportTicket(
    subject: string,
    body: string,
    files?: File[],
    options?: { kind?: "support"; relatedUrl?: string },
  ) {
    if (files && files.length > 0) {
      const form = new FormData();
      form.append("subject", subject);
      form.append("body", body);
      if (options?.kind) {
        form.append("kind", options.kind);
      }
      if (options?.relatedUrl) {
        form.append("relatedUrl", options.relatedUrl);
      }
      for (const file of files) {
        form.append("files", file);
      }
      const response = await fetch(resolveApiUrl("/api/messages/tickets"), {
        method: "POST",
        credentials: "include",
        body: form,
      });
      const text = await response.text();
      if (!response.ok) {
        let message = `Request failed (${response.status})`;
        try {
          const parsed = JSON.parse(text) as { error?: string };
          if (parsed.error) message = parsed.error;
        } catch {
          // ignore
        }
        throw new Error(message);
      }
    } else {
      await api("/api/messages/tickets", {
        method: "POST",
        body: JSON.stringify({
          subject,
          body,
          kind: options?.kind,
          relatedUrl: options?.relatedUrl,
        }),
      });
    }
    await refreshInbox();
  }

  async function closeSupportTicket(ticketId: string) {
    await api(`/api/messages/tickets/${ticketId}/close`, { method: "POST" });
    await refreshInbox();
    if (user?.isAdmin) {
      await refreshAdminData();
    }
  }

  async function markAllInboxNotificationsRead() {
    await api("/api/messages/inbox/mark-all-read", { method: "POST" });
    setInboxNotifications((current) =>
      current.map((n) => ({ ...n, is_read: true })),
    );
    await refreshInbox();
  }

  async function replySupportTicket(ticketId: string, body: string, files?: File[]) {
    if (files && files.length > 0) {
      const form = new FormData();
      form.append("body", body);
      for (const file of files) {
        form.append("files", file);
      }
      const response = await fetch(
        resolveApiUrl(`/api/messages/tickets/${ticketId}/messages`),
        {
          method: "POST",
          credentials: "include",
          body: form,
        },
      );
      const text = await response.text();
      if (!response.ok) {
        let message = `Request failed (${response.status})`;
        try {
          const parsed = JSON.parse(text) as { error?: string };
          if (parsed.error) message = parsed.error;
        } catch {
          // ignore
        }
        throw new Error(message);
      }
    } else {
      await api(`/api/messages/tickets/${ticketId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
    }
    await refreshInbox();
    if (user?.isAdmin) {
      await refreshAdminData();
    }
  }

  async function respondScreenShare(accept: boolean) {
    if (!screenSharePrompt) return;
    const id = screenSharePrompt.id;
    await api(`/api/session/screen-share/${id}/respond`, {
      method: "POST",
      body: JSON.stringify({ accept }),
    });
    if (accept) {
      setScreenShareCaptureId(id);
    }
    setScreenSharePrompt(null);
  }

  async function postScreenShareFrame(requestId: string, image: string) {
    await api(`/api/session/screen-share/${requestId}/frame`, {
      method: "POST",
      body: JSON.stringify({ image }),
    });
  }

  async function markSupportTicketRead(ticketId: string) {
    await api(`/api/messages/tickets/${ticketId}/read`, { method: "POST" });
    const readAt = Date.now();
    ticketReadOverridesRef.current[ticketId] = readAt;
    setSupportTickets((current) =>
      current.map((ticket) =>
        ticket.id === ticketId ? { ...ticket, unread: false } : ticket,
      ),
    );
    setAdminTickets((current) =>
      current.map((ticket) =>
        ticket.id === ticketId
          ? { ...ticket, unread: false, unread_for_admin: false }
          : ticket,
      ),
    );
    setAdminNotifications((current) =>
      current.map((notification) =>
        notification.ticket_id === ticketId ? { ...notification, unread: false } : notification,
      ),
    );
  }

  const refreshAdminData = useCallback(
    async (
      options: string | { filter?: string; timeframe?: "24h" | "7d" | "30d" } = "all",
    ) => {
      const filter = typeof options === "string" ? options : options.filter ?? "all";
      const timeframe =
        typeof options === "string" ? "24h" : options.timeframe ?? "24h";
      const results = await Promise.allSettled([
        api<{ users: AdminUser[] }>("/api/admin/users"),
        api<{ sessions: AdminSession[] }>("/api/admin/sessions"),
        api<{ logs: AdminLogEntry[] }>(
          `/api/admin/logs?filter=${encodeURIComponent(filter)}`,
        ),
        api<{ blockedSites: BlockedSiteRecord[] }>("/api/admin/blocked-sites"),
        api<{ alerts: BrowserAlert[] }>("/api/admin/alerts"),
        api<{ tickets: AdminSupportTicket[] }>("/api/admin/tickets"),
        api<{ notifications: AdminNotification[] }>("/api/admin/notifications"),
        api<{ activeBans: AdminBanRecord[]; recentUnbans: AdminBanRecord[] }>(
          `/api/admin/bans?timeframe=${encodeURIComponent(timeframe)}`,
        ),
        api<{ stats: AdminStats }>(`/api/admin/stats?timeframe=${encodeURIComponent(timeframe)}`),
      ]);

      const get = <T>(index: number, fallback: T): T => {
        const entry = results[index];
        if (entry && entry.status === "fulfilled") {
          return entry.value as T;
        }
        return fallback;
      };

      setAdminUsers(get(0, { users: [] }).users);
      setAdminSessions(get(1, { sessions: [] }).sessions);
      setAdminLogs(get(2, { logs: [] }).logs);
      setBlockedSites(get(3, { blockedSites: [] }).blockedSites);
      setAdminAlerts(get(4, { alerts: [] }).alerts);
      setAdminTickets(applyAdminTicketReadOverrides(get(5, { tickets: [] }).tickets));
      setAdminNotifications(get(6, { notifications: [] }).notifications);
      const bans = get(7, { activeBans: [], recentUnbans: [] });
      setAdminActiveBans(bans.activeBans);
      setAdminRecentUnbans(bans.recentUnbans);
      setAdminStats(get(8, null as AdminStats | null));
    },
    [],
  );

  async function sendAlert(
    title: string,
    message: string,
    color: BrowserAlert["color"],
    targetUserId?: string,
  ) {
    await api("/api/admin/alerts", {
      method: "POST",
      body: JSON.stringify({ title, message, color, targetUserId }),
    });
    await refreshAdminData();
  }

  async function removeAlert(id: string) {
    await api(`/api/admin/alerts/${id}`, { method: "DELETE" });
    await refreshAdminData();
  }

  async function addBlockedSite(
    pattern: string,
    reason: string,
    userId?: string,
    options?: {
      listName?: string;
      mode?: "flag" | "block";
      notifyOnMatch?: boolean;
      isEnabled?: boolean;
    },
  ) {
    await api("/api/admin/blocked-sites", {
      method: "POST",
      body: JSON.stringify({ pattern, reason, userId, ...options }),
    });
    await refreshAdminData();
  }

  async function removeBlockedSite(id: string) {
    await api(`/api/admin/blocked-sites/${id}`, { method: "DELETE" });
    await refreshAdminData();
  }

  async function importBlockedSites(
    reason: string,
    content: string,
    userId?: string,
    options?: {
      listName?: string;
      mode?: "flag" | "block";
      notifyOnMatch?: boolean;
      isEnabled?: boolean;
    },
  ) {
    await api("/api/admin/blocked-sites/import", {
      method: "POST",
      body: JSON.stringify({ reason, content, userId, ...options }),
    });
    await refreshAdminData();
  }

  async function updateBlockedSite(
    id: string,
    patch: {
      pattern?: string;
      reason?: string;
      listName?: string;
      mode?: "flag" | "block";
      notifyOnMatch?: boolean;
      isEnabled?: boolean;
    },
  ) {
    await api(`/api/admin/blocked-sites/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    await refreshAdminData();
  }

  async function banUser(
    userId: string,
    reason: string,
    durationMinutes: number | null,
    targetSessionId?: string | null,
  ) {
    await api(`/api/admin/users/${userId}/ban`, {
      method: "POST",
      body: JSON.stringify({
        reason,
        durationMinutes,
        targetSessionId: targetSessionId ?? undefined,
      }),
    });
    await refreshAdminData();
  }

  async function banSession(
    reason: string,
    durationMinutes: number | null,
    targetSessionId = sessionId,
  ) {
    await api(`/api/admin/sessions/${targetSessionId}/ban`, {
      method: "POST",
      body: JSON.stringify({ reason, durationMinutes }),
    });
    await refreshAdminData();
  }

  async function revokeBan(banId: string) {
    await api(`/api/admin/bans/${encodeURIComponent(banId)}/revoke`, {
      method: "POST",
    });
    await refreshAdminData();
  }

  async function deleteUser(userId: string) {
    await api(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
    await refreshAdminData();
  }

  async function updateUserRole(userId: string, role: "user" | "admin") {
    await api(`/api/admin/users/${userId}/role`, {
      method: "POST",
      body: JSON.stringify({ role }),
    });
    await refreshAdminData();
  }

  async function resetUserPassword(userId: string, newPassword: string) {
    await api(`/api/admin/users/${userId}/reset-password`, {
      method: "POST",
      body: JSON.stringify({ newPassword }),
    });
    await refreshAdminData();
  }

  async function resetUserTotp(userId: string) {
    const payload = await api<{
      ok: true;
      base32?: string;
      qrCodeDataUrl?: string;
      otpauthUrl?: string;
      requiresVerification?: boolean;
    }>(`/api/admin/users/${userId}/reset-totp`, { method: "POST" });
    await refreshAdminData();
    return payload;
  }

  async function changeUsername(userId: string, username: string) {
    await api(`/api/admin/users/${userId}/username`, {
      method: "POST",
      body: JSON.stringify({ username }),
    });
    await refreshAdminData();
  }

  return {
    isReady,
    sessionId,
    user,
    banned,
    transportConfig,
    themePresets,
    helpTips,
    alerts,
    navigationError,
    setNavigationError,
    proxyLocationError,
    setProxyLocationError,
    scramjetError,
    setScramjetError,
    authError,
    setAuthError,
    syncPromptOpen,
    pendingServerState,
    pendingLocalState,
    showTutorial,
    tabs,
    activeTab,
    bookmarks,
    history,
    shortcuts,
    gamesApps,
    proxyLocations,
    settings,
    activePanel,
    canGoBackPanel,
    inspectRequestToken,
    passwordRecords,
    syncSessionPasswords,
    syncAccountPasswords,
    inboxNotifications,
    inboxFeed,
    websiteMessages,
    supportTickets,
    adminUsers,
    adminSessions,
    adminLogs,
    blockedSites,
    adminAlerts,
    adminTickets,
    adminNotifications,
    adminActiveBans,
    adminRecentUnbans,
    adminStats,
    selectedSupportTicketId,
    selectedAdminTicketId,
    adminSection,
    adminSearchQuery,
    screenSharePrompt,
    screenShareCaptureId,
    inspectNotice,
    clearInspectNotice,
    notifyInspectFailure,
    tutorialJumpToReview,
    clearTutorialJumpToReview,
    beginSetupLogin,
    respondScreenShare,
    postScreenShareFrame,
    addTab,
    closeTab,
    restoreLastClosedTab,
    setActiveTab,
    navigateTo,
    openInNewTab,
    regenTab,
    toggleTabMuted,
    goBack,
    goForward,
    addBookmark,
    removeBookmark,
    moveTab,
    updateSettings,
    updateProxyLocation,
    updateTheme,
    setActivePanel,
    goBackPanel,
    openNotificationsPanel,
    openTicketsPanel,
    openAdminPanel,
    notificationCenterTab,
    setNotificationCenterTab,
    setSelectedSupportTicketId,
    setSelectedAdminTicketId,
    setAdminSection,
    setAdminSearchQuery,
    dismissTutorial,
    clearHistory,
    removeHistoryEntry,
    setShortcutTiles,
    addShortcutTile,
    updateShortcutTile,
    moveShortcutTile,
    removeShortcutTile,
    addCustomGameApp,
    removeCustomGameApp,
    markTabLoading,
    failTabLoad,
    pushWebsiteMessage,
    setWebsiteMessageRead,
    syncTabFromFrame,
    handleFrameNavigation,
    requestInspect,
    login,
    loginFromSetupWizard,
    register,
    logout,
    syncLocalStateToAccount,
    useServerState,
    applyMergedSyncState,
    startTotpSetup,
    verifyTotp,
    disableTotp,
    changePassword,
    refreshPasswords,
    refreshSyncPreview,
    savePassword,
    deletePassword,
    refreshInbox,
    setNotificationRead,
    setAdminNotificationRead,
    markAllInboxNotificationsRead,
    markAllWebsiteMessagesRead,
    createSupportTicket,
    replySupportTicket,
    markSupportTicketRead,
    closeSupportTicket,
    refreshAdminData,
    sendAlert,
    removeAlert,
    addBlockedSite,
    importBlockedSites,
    updateBlockedSite,
    removeBlockedSite,
    banUser,
    banSession,
    revokeBan,
    deleteUser,
    updateUserRole,
    resetUserPassword,
    resetUserTotp,
    changeUsername,
  };
}
