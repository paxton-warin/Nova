import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { logging, server as wisp } from "@mercuryworkshop/wisp-js/server";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import SqliteStoreFactory from "better-sqlite3-session-store";
import dotenv from "dotenv";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import session from "express-session";
import { HttpsProxyAgent } from "https-proxy-agent";
import multer from "multer";

type MulterFile = Express.Multer.File;
import { SocksProxyAgent } from "socks-proxy-agent";
import { nanoid } from "nanoid";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { z } from "zod";

import { env } from "./env.js";

dotenv.config();

declare module "express-session" {
  interface SessionData {
    userId?: string;
    totpVerified?: boolean;
    pendingTotpSecret?: string;
  }
}

type Role = "user" | "admin" | "master_admin";

type ThemePreset = {
  id: string;
  name: string;
  accent: string;
  preview: string;
  backgroundImage: string;
};

type CatalogConfig = {
  appsGames: Array<{
    id: string;
    title: string;
    url: string;
    icon: string;
    /** Optional wide banner (URL or data URL) shown on library cards */
    banner?: string;
    description: string;
    category: "game" | "app";
  }>;
};

type BrowserSettings = Record<string, unknown>;
type ShortcutMap = Record<string, unknown>;
type BrowserTab = Record<string, unknown>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const frontendDir = path.join(rootDir, "frontend");
const frontendDistDir = path.join(frontendDir, "dist");
const frontendPublicDir = path.join(frontendDir, "public");
const referenceScramjetAppDir = path.resolve(rootDir, "..", "scramjet-app");
const dbPath = path.resolve(rootDir, env.DATABASE_PATH);
const scramjetStaticDir = resolvePreferredStaticDir(
  path.join(referenceScramjetAppDir, "node_modules", "@mercuryworkshop", "scramjet", "dist"),
  path.join(rootDir, "node_modules", "@mercuryworkshop", "scramjet", "dist"),
);
const libcurlStaticDir = resolvePreferredStaticDir(
  path.join(referenceScramjetAppDir, "node_modules", "@mercuryworkshop", "libcurl-transport", "dist"),
  path.join(rootDir, "node_modules", "@mercuryworkshop", "libcurl-transport", "dist"),
);
const baremuxStaticDir = resolvePreferredStaticDir(
  path.join(referenceScramjetAppDir, "node_modules", "@mercuryworkshop", "bare-mux", "dist"),
  baremuxPath,
);
const FORCED_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const FORCED_ACCEPT_LANGUAGE = "en-US,en;q=0.9";
const catalogConfigPath = path.join(rootDir, "nova.catalog.json");
const proxyConfigPath = path.join(rootDir, "nova.proxies.json");
type AnalyticsTimeframe = "24h" | "7d" | "30d";

function resolvePreferredStaticDir(preferredPath: string, fallbackPath: string) {
  return fs.existsSync(preferredPath) ? preferredPath : fallbackPath;
}

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const SqliteStore = SqliteStoreFactory(session);

const app = express();
if (env.TRUST_PROXY > 0) {
  app.set("trust proxy", env.TRUST_PROXY);
}

if (env.CORS_ALLOW_ORIGINS.length > 0) {
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowed =
      typeof origin === "string" && env.CORS_ALLOW_ORIGINS.includes(origin);
    if (allowed) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      const acrh = req.headers["access-control-request-headers"];
      res.setHeader(
        "Access-Control-Allow-Headers",
        typeof acrh === "string" ? acrh : "Content-Type, Authorization",
      );
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      );
    }
    if (req.method === "OPTIONS") {
      res.status(allowed ? 204 : 403).end();
      return;
    }
    next();
  });
}

const server = http.createServer(app);
const uploadsRoot = path.join(rootDir, "data", "uploads");
fs.mkdirSync(uploadsRoot, { recursive: true });

const ticketUpload = multer({
  storage: multer.diskStorage({
    destination: (_req: Request, _file: MulterFile, cb: (error: Error | null, path: string) => void) => {
      cb(null, uploadsRoot);
    },
    filename: (_req: Request, file: MulterFile, cb: (error: Error | null, name: string) => void) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]+/g, "_");
      cb(null, `${nanoid()}${path.extname(safe) || ""}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 5 },
});

const screenShareFrames = new Map<string, { dataUrl: string; updatedAt: number }>();
const screenShareLastFrameAt = new Map<string, number>();
const SCREEN_SHARE_MAX_MS = 10 * 60 * 1000;
const PROXY_LATENCY_TTL_MS = 10 * 60 * 1000;
const proxyLatencyCache = new Map<string, { ms: number | null; at: number; ok: boolean }>();

const faviconCache = new Map<
  string,
  { contentType: string; body: Buffer; expiresAt: number }
>();

logging.set_level(logging.NONE);
Object.assign(wisp.options, {
  allow_udp_streams: false,
  hostname_blacklist: [/example\.com/i],
  dns_servers: ["1.1.1.3", "1.0.0.3"],
});

const settingsSchema = z.record(z.string(), z.unknown());
const shortcutsSchema = z.record(z.string(), z.unknown());
const tabsSchema = z.array(z.record(z.string(), z.unknown()));

const registerSchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(8).max(128),
});

const loginSchema = registerSchema.extend({
  totpToken: z.string().optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8).max(128),
});

const updateSettingsSchema = z.object({
  settings: settingsSchema,
});

const updateTabsSchema = z.object({
  tabs: tabsSchema,
});

const updateShortcutsSchema = z.object({
  shortcuts: shortcutsSchema,
});

const savePasswordSchema = z.object({
  origin: z.string().url(),
  username: z.string().max(128),
  password: z.string().min(1).max(512),
});

const importSessionPasswordsSchema = z.object({
  ids: z.array(z.string()).max(500),
});

const resolveNavigationSchema = z.object({
  url: z.string().min(1),
  title: z.string().optional(),
  allowAdminBypass: z.boolean().optional(),
});

const alertSchema = z.object({
  title: z.string().min(1).max(120),
  message: z.string().min(1).max(2000),
  color: z.enum(["cyan", "purple", "green", "orange", "red"]),
  targetUserId: z.string().optional(),
});

const blockSiteSchema = z.object({
  pattern: z.string().min(1).max(255),
  reason: z.string().min(3).max(500),
  listName: z.string().min(1).max(120).optional(),
  mode: z.enum(["flag", "block"]).optional(),
  notifyOnMatch: z.boolean().optional(),
  isEnabled: z.boolean().optional(),
  userId: z.string().optional(),
});

const importBlockedSitesSchema = z.object({
  reason: z.string().min(3).max(500),
  listName: z.string().min(1).max(120).optional(),
  mode: z.enum(["flag", "block"]).optional(),
  notifyOnMatch: z.boolean().optional(),
  isEnabled: z.boolean().optional(),
  content: z.string().min(1),
  userId: z.string().optional(),
});

const updateBlockedSiteSchema = z.object({
  pattern: z.string().min(1).max(255).optional(),
  reason: z.string().min(3).max(500).optional(),
  listName: z.string().min(1).max(120).optional(),
  mode: z.enum(["flag", "block"]).optional(),
  notifyOnMatch: z.boolean().optional(),
  isEnabled: z.boolean().optional(),
});

const notificationStateSchema = z.object({
  read: z.boolean(),
});

const createTicketSchema = z.object({
  subject: z.string().min(3).max(120),
  body: z.string().min(1).max(4000),
  kind: z.enum(["support"]).optional(),
  relatedUrl: z.string().max(2000).optional(),
});

const createTicketMessageSchema = z.object({
  body: z.string().min(1).max(4000),
});

const screenShareRespondSchema = z.object({
  accept: z.boolean(),
});

const screenShareFrameSchema = z.object({
  image: z.string().min(1).max(2_500_000),
});

const GLOBAL_ALERT_WINDOW_MS = 24 * 60 * 60 * 1000;
const ONLINE_WINDOW_MS = 5 * 60 * 1000;
const ANALYTICS_WINDOW_MS = 24 * 60 * 60 * 1000;
const ADMIN_TIMEFRAME_WINDOWS: Record<AnalyticsTimeframe, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

const banSchema = z.object({
  reason: z.string().min(3).max(500),
  durationMinutes: z.number().int().positive().nullable(),
  targetSessionId: z.string().optional(),
});
const readStateSchema = z.object({
  read: z.boolean(),
});

const updateRoleSchema = z.object({
  role: z.enum(["user", "admin"]),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8).max(128),
});

const updateUsernameSchema = z.object({
  username: z.string().min(3).max(32),
});

const totpVerifySchema = z.object({
  token: z.string().min(6).max(12),
});

const themes: ThemePreset[] = [
  makeTheme("nebula", "Aurora Shell", "#22d3ee", ["#020617", "#1d4ed8", "#06b6d4"], "browser-tabs"),
  makeTheme("violet-drift", "Violet Browser", "#a855f7", ["#12051f", "#5b21b6", "#c084fc"], "browser-stack"),
  makeTheme("forest-grid", "Matrix Tabs", "#22c55e", ["#03140f", "#166534", "#86efac"], "browser-grid"),
  makeTheme("ember-night", "Ember Window", "#f97316", ["#1c0904", "#9a3412", "#fdba74"], "browser-shield"),
];

const helpTips = [
  "Mute a noisy tab from the right-click menu so audio stops without closing the page.",
  "Change your exit location from Settings when you want browsing traffic to leave from a different region.",
  "Reopen something you lost from the History panel, then bookmark it if you want it pinned for later.",
  "Use the search box in Settings to jump straight to options like proxy, Dark Reader, or shortcuts.",
  "Enable Inspect in Settings to inject Eruda into proxied pages when you need quick devtools.",
  "Turn on Restore Tabs if you want Nova to bring your previous session back on launch.",
];

const defaultCatalog: CatalogConfig = {
  appsGames: [
    { id: "2048", title: "2048", url: "https://play2048.co", icon: "🎮", description: "Classic number puzzle", category: "game" },
    { id: "tetris", title: "Tetris", url: "https://tetris.com/play-tetris", icon: "🧱", description: "Block stacking classic", category: "game" },
    { id: "snake", title: "Snake", url: "https://playsnake.org", icon: "🐍", description: "Classic snake game", category: "game" },
    { id: "chess", title: "Chess", url: "https://chess.com", icon: "♟️", description: "Play chess online", category: "game" },
    { id: "calculator", title: "Calculator", url: "https://web2.0calc.com", icon: "🧮", description: "Scientific calculator", category: "app" },
    { id: "notepad", title: "Notepad", url: "https://notepad.pw", icon: "📝", description: "Quick online notepad", category: "app" },
    { id: "draw", title: "Draw", url: "https://excalidraw.com", icon: "🎨", description: "Drawing whiteboard", category: "app" },
    { id: "timer", title: "Timer", url: "https://timer.guru", icon: "⏱️", description: "Online timer", category: "app" },
  ],
};

function loadCatalogConfig(): CatalogConfig {
  try {
    const raw = fs.readFileSync(catalogConfigPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<CatalogConfig>;
    if (!Array.isArray(parsed.appsGames)) {
      return defaultCatalog;
    }
    return {
      appsGames: parsed.appsGames.filter((entry) =>
        entry &&
        typeof entry.id === "string" &&
        typeof entry.title === "string" &&
        typeof entry.url === "string" &&
        typeof entry.icon === "string" &&
        typeof entry.description === "string" &&
        (entry.category === "app" || entry.category === "game") &&
        (entry.banner === undefined || typeof entry.banner === "string"),
      ) as CatalogConfig["appsGames"],
    };
  } catch {
    return defaultCatalog;
  }
}

type ProxyPoolEntry = { url: string; priority?: number };
type ProxyLocationRow = {
  id: string;
  label: string;
  emoji: string;
  proxies: ProxyPoolEntry[];
};

type ProxyCatalog = { locations: ProxyLocationRow[] };
type ResolvedSessionProxy = {
  requestedLocationId: string;
  effectiveLocationId: string;
  proxyUrl: string | null;
  warning: string | null;
};

const defaultProxyCatalog: ProxyCatalog = {
  locations: [
    { id: "us", label: "United States", emoji: "🇺🇸", proxies: [] },
    { id: "de", label: "Germany", emoji: "🇩🇪", proxies: [] },
    { id: "fr", label: "France", emoji: "🇫🇷", proxies: [] },
    { id: "uk", label: "United Kingdom", emoji: "🇬🇧", proxies: [] },
    { id: "ca", label: "Canada", emoji: "🇨🇦", proxies: [] },
    { id: "jp", label: "Japan", emoji: "🇯🇵", proxies: [] },
    { id: "au", label: "Australia", emoji: "🇦🇺", proxies: [] },
    { id: "se", label: "Sweden", emoji: "🇸🇪", proxies: [] },
  ],
};

function validateProxyUrlString(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ["http:", "https:", "socks5h:", "socks4a:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function loadProxyCatalog(): ProxyCatalog {
  try {
    const raw = fs.readFileSync(proxyConfigPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<ProxyCatalog>;
    if (!Array.isArray(parsed.locations)) {
      return defaultProxyCatalog;
    }
    return {
      locations: parsed.locations
        .map((loc) => {
          const id = loc && typeof loc.id === "string" ? loc.id : "";
          const label = loc && typeof loc.label === "string" ? loc.label : "";
          const emoji = loc && typeof loc.emoji === "string" ? loc.emoji : "🌐";
          const proxies: ProxyPoolEntry[] = [];
          if (Array.isArray(loc?.proxies)) {
            for (const entry of loc.proxies) {
              const url =
                typeof entry === "string"
                  ? entry
                  : entry &&
                      typeof entry === "object" &&
                      typeof (entry as { url?: string }).url === "string"
                    ? (entry as { url: string }).url
                    : "";
              if (url && validateProxyUrlString(url)) {
                const priority =
                  entry &&
                  typeof entry === "object" &&
                  typeof (entry as { priority?: unknown }).priority === "number"
                    ? (entry as { priority: number }).priority
                    : undefined;
                proxies.push(priority !== undefined ? { url, priority } : { url });
              }
            }
          }
          return { id, label, emoji, proxies };
        })
        .filter((loc) => loc.id.length > 0 && loc.label.length > 0),
    };
  } catch {
    return defaultProxyCatalog;
  }
}

const ACTIVE_PROXY_ASSIGNMENT_WINDOW_MS = 30 * 60 * 1000;

function proxyEntryUrl(entry: ProxyPoolEntry): string {
  return entry.url;
}

const PROXY_LATENCY_PROBE_URLS = [
  "https://www.google.com/generate_204",
  "https://connectivitycheck.gstatic.com/generate_204",
  "https://example.com/",
];

function measureProxyLatency(proxyUrl: string): Promise<number | null> {
  return new Promise((resolveOuter) => {
    try {
      const parsed = new URL(proxyUrl);
      const agent =
        parsed.protocol === "http:" || parsed.protocol === "https:"
          ? new HttpsProxyAgent(proxyUrl)
          : parsed.protocol === "socks5h:" || parsed.protocol === "socks4a:"
            ? new SocksProxyAgent(proxyUrl)
            : null;
      if (!agent) {
        resolveOuter(null);
        return;
      }

      let index = 0;
      const tryNext = () => {
        if (index >= PROXY_LATENCY_PROBE_URLS.length) {
          resolveOuter(null);
          return;
        }
        const probeUrl = PROXY_LATENCY_PROBE_URLS[index]!;
        index += 1;
        const start = Date.now();
        const req = https.request(
          probeUrl,
          { method: "HEAD", agent, timeout: 10_000 },
          (r) => {
            r.resume();
            resolveOuter(Date.now() - start);
          },
        );
        req.on("error", () => tryNext());
        req.on("timeout", () => {
          req.destroy();
          tryNext();
        });
        req.end();
      };
      tryNext();
    } catch {
      resolveOuter(null);
    }
  });
}

async function refreshAllProxyLatencies() {
  const catalog = loadProxyCatalog();
  const seen = new Set<string>();
  for (const loc of catalog.locations) {
    for (const p of loc.proxies) {
      const u = proxyEntryUrl(p);
      if (seen.has(u)) continue;
      seen.add(u);
      const ms = await measureProxyLatency(u);
      proxyLatencyCache.set(u, { ms, at: Date.now(), ok: ms !== null });
    }
  }
}

function getProxyAssignmentCounts(locationId: string, candidateUrls: string[]) {
  const counts = new Map<string, number>();
  for (const url of candidateUrls) {
    counts.set(url, 0);
  }
  if (candidateUrls.length === 0) {
    return counts;
  }
  const placeholders = candidateUrls.map(() => "?").join(", ");
  const rows = db.prepare(
    `
      SELECT assigned_proxy_url, COUNT(*) AS count
      FROM session_state
      WHERE proxy_location_id = ?
        AND assigned_proxy_url IN (${placeholders})
        AND last_seen_at >= ?
      GROUP BY assigned_proxy_url
    `,
  ).all(
    locationId,
    ...candidateUrls,
    Date.now() - ACTIVE_PROXY_ASSIGNMENT_WINDOW_MS,
  ) as Array<{ assigned_proxy_url: string; count: number }>;
  for (const row of rows) {
    counts.set(row.assigned_proxy_url, row.count);
  }
  return counts;
}

function pickNextProxyUrl(locationId: string): string | null {
  const catalog = loadProxyCatalog();
  const loc = catalog.locations.find((entry) => entry.id === locationId);
  if (!loc || loc.proxies.length === 0) {
    return null;
  }
  const knownStates = loc.proxies
    .map((entry) => proxyLatencyCache.get(proxyEntryUrl(entry)))
    .filter((entry): entry is { ms: number | null; at: number; ok: boolean } => Boolean(entry));
  if (knownStates.length > 0 && knownStates.every((entry) => !entry.ok)) {
    return null;
  }
  const healthy = loc.proxies.filter((entry) => proxyLatencyCache.get(proxyEntryUrl(entry))?.ok !== false);
  const pool = healthy.length > 0 ? healthy : loc.proxies;
  const assignmentCounts = getProxyAssignmentCounts(
    locationId,
    pool.map((entry) => proxyEntryUrl(entry)),
  );
  const sorted = [...pool].sort((a, b) => {
    const ua = proxyEntryUrl(a);
    const ub = proxyEntryUrl(b);
    const loadA = assignmentCounts.get(ua) ?? 0;
    const loadB = assignmentCounts.get(ub) ?? 0;
    if (loadA !== loadB) return loadA - loadB;
    const pa = typeof a.priority === "number" ? a.priority : 100;
    const pb = typeof b.priority === "number" ? b.priority : 100;
    if (pa !== pb) return pa - pb;
    const la = proxyLatencyCache.get(ua)?.ms ?? 99_999;
    const lb = proxyLatencyCache.get(ub)?.ms ?? 99_999;
    if (la !== lb) return la - lb;
    return ua.localeCompare(ub);
  });
  return proxyEntryUrl(sorted[0]!);
}

function getProxyLocationRow(locationId: string) {
  return loadProxyCatalog().locations.find((entry) => entry.id === locationId) ?? null;
}

function locationHasConfiguredProxy(locationId: string) {
  const row = getProxyLocationRow(locationId);
  return Boolean(row && row.proxies.length > 0);
}

function locationHasHealthyProxy(locationId: string) {
  const row = getProxyLocationRow(locationId);
  if (!row || row.proxies.length === 0) return false;
  const knownStates = row.proxies
    .map((entry) => proxyLatencyCache.get(proxyEntryUrl(entry)))
    .filter((entry): entry is { ms: number | null; at: number; ok: boolean } => Boolean(entry));
  if (knownStates.length === 0) return true;
  return knownStates.some((entry) => entry.ok);
}

function buildProxyLocationFallbackOrder(requestedLocationId: string, defaultLocationId: string) {
  const ordered = [requestedLocationId];
  if (!ordered.includes(defaultLocationId)) {
    ordered.push(defaultLocationId);
  }
  for (const location of loadProxyCatalog().locations) {
    if (!ordered.includes(location.id)) {
      ordered.push(location.id);
    }
  }
  return ordered;
}

function normalizeProxyLocationId(raw: unknown): string {
  const catalog = loadProxyCatalog();
  const fallback = catalog.locations[0]?.id ?? "us";
  if (typeof raw !== "string" || !raw.length) {
    return fallback;
  }
  if (catalog.locations.some((entry) => entry.id === raw)) {
    return raw;
  }
  return fallback;
}

function listProxyLocationMeta() {
  return loadProxyCatalog().locations.map(({ id, label, emoji }) => ({ id, label, emoji }));
}

function buildTransportPayload(req: Request, resolvedProxy: ResolvedSessionProxy) {
  return {
    scramjet: {
      wasm: "/scram/scramjet.wasm.wasm",
      all: "/scram/scramjet.all.js",
      sync: "/scram/scramjet.sync.js",
    },
    baremuxWorker: "/baremux/worker.js",
    baremuxScript: "/baremux/index.js",
    transportPath: "/libcurl/index.mjs",
    wispUrl: getWispUrl(req),
    proxyUrl: resolvedProxy.proxyUrl,
    proxyLocationId: resolvedProxy.effectiveLocationId,
    proxyWarning: resolvedProxy.warning,
  };
}

function ensureSessionProxy(sessionId: string, userId: string | null, preferredRaw: unknown): ResolvedSessionProxy {
  ensureSessionState(sessionId, userId);
  const requestedLocationId = normalizeProxyLocationId(preferredRaw);
  const defaultLocationId = normalizeProxyLocationId(undefined);
  const row = db
    .prepare(
      "SELECT proxy_location_id, assigned_proxy_url FROM session_state WHERE session_id = ?",
    )
    .get(sessionId) as
    | { proxy_location_id: string | null; assigned_proxy_url: string | null }
    | undefined;

  if (
    row?.proxy_location_id === requestedLocationId &&
    row.assigned_proxy_url &&
    proxyLatencyCache.get(row.assigned_proxy_url)?.ok !== false
  ) {
    return {
      requestedLocationId,
      effectiveLocationId: requestedLocationId,
      proxyUrl: row.assigned_proxy_url,
      warning: null,
    };
  }

  let effectiveLocationId = requestedLocationId;
  let warning: string | null = null;

  let finalUrl: string | null = null;
  const fallbackOrder = buildProxyLocationFallbackOrder(requestedLocationId, defaultLocationId);
  for (const locationId of fallbackOrder) {
    const candidateUrl = pickNextProxyUrl(locationId);
    if (candidateUrl) {
      effectiveLocationId = locationId;
      finalUrl = candidateUrl;
      break;
    }
  }

  if (effectiveLocationId !== requestedLocationId) {
    const requestedLabel = getProxyLocationRow(requestedLocationId)?.label ?? requestedLocationId;
    const effectiveLabel = getProxyLocationRow(effectiveLocationId)?.label ?? effectiveLocationId;
    if (requestedLocationId !== defaultLocationId && effectiveLocationId === defaultLocationId) {
      warning = `No working exit proxies are available for ${requestedLabel}. Switched back to ${effectiveLabel}.`;
    } else if (requestedLocationId === defaultLocationId) {
      warning = `No working US exit proxies are available right now. Switched to ${effectiveLabel}.`;
    } else {
      warning = `No working exit proxies are available for ${requestedLabel}. Switched to ${effectiveLabel}.`;
    }
  }

  if (!finalUrl) {
    if (requestedLocationId === defaultLocationId) {
      warning = "No working exit proxies are currently available, including the default US pool. Nova is using the server connection directly.";
    } else {
      const requestedLabel = getProxyLocationRow(requestedLocationId)?.label ?? requestedLocationId;
      warning = `No working exit proxies are available for ${requestedLabel}, the default US pool, or any fallback region. Nova is using the server connection directly.`;
    }
  }
  db.prepare(
    `UPDATE session_state SET proxy_location_id = ?, assigned_proxy_url = ? WHERE session_id = ?`,
  ).run(effectiveLocationId, finalUrl, sessionId);
  return {
    requestedLocationId,
    effectiveLocationId,
    proxyUrl: finalUrl,
    warning,
  };
}

const defaultShortcuts: ShortcutMap = {
  bookmarks: [],
  history: [],
  shortcutTiles: [],
  customAppsGames: [],
  tutorialDismissed: false,
};

const defaultSettings: BrowserSettings = {
  tabBehavior: "keep-loaded",
  defaultSearchEngine: "duckduckgo",
  searchSuggestions: true,
  showBookmarksBar: true,
  safeBrowsing: true,
  doNotTrack: false,
  pushNotifications: true,
  notificationSound: false,
  restoreTabs: true,
  erudaEnabled: env.ENABLE_ERUDA_BY_DEFAULT,
  passwordManagerEnabled: true,
  showTips: true,
  askWhereToSave: false,
  downloadLocation: "~/Downloads",
  theme: {
    mode: "dark",
    accentColor: themes[0].accent,
    density: "default",
    tabOrientation: "horizontal",
    backgroundUrl: themes[0].backgroundImage,
    customFavicon: "",
    customTitle: "",
    faviconPreset: "default",
    titlePreset: "default",
    themePresetId: themes[0].id,
  },
  shortcuts: [
    { id: "1", action: "new-tab", label: "New Tab", keys: "Ctrl+T", isDefault: true },
    { id: "2", action: "close-tab", label: "Close Tab", keys: "Ctrl+W", isDefault: true },
    { id: "3", action: "reload-tab", label: "Reload Tab", keys: "Ctrl+Shift+T", isDefault: true },
    { id: "4", action: "settings", label: "Settings", keys: "Alt+.", isDefault: true },
    { id: "5", action: "history", label: "History", keys: "Ctrl+H", isDefault: true },
    { id: "6", action: "home", label: "Home", keys: "Alt+Home", isDefault: true },
    { id: "7", action: "bookmarks", label: "Bookmarks", keys: "Ctrl+B", isDefault: true },
    { id: "8", action: "inspect", label: "Inspect", keys: "Ctrl+Shift+I", isDefault: true },
    { id: "10", action: "back", label: "Back", keys: "Alt+ArrowLeft", isDefault: true },
    { id: "11", action: "forward", label: "Forward", keys: "Alt+ArrowRight", isDefault: true },
  ],
  proxyLocation: "us",
  showExitLocationBadge: true,
};

const defaultTabs: BrowserTab[] = [
  {
    id: nanoid(10),
    title: "New Tab",
    url: "newtab",
    favicon: "",
    isLoading: false,
    isActive: true,
    keepLoaded: true,
    history: ["newtab"],
    historyIndex: 0,
  },
];

createSchema();
seedMasterAdmin();

app.use(express.json({ limit: "2mb" }));
app.use(
  session({
    secret: env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    proxy: true,
    cookie: {
      sameSite: env.SESSION_COOKIE_SAMESITE,
      secure: env.SESSION_COOKIE_SECURE,
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 30,
    },
    store: new SqliteStore({
      client: db,
      expired: {
        clear: true,
        intervalMs: 1000 * 60 * 15,
      },
    }) as session.Store,
  }),
);

app.use((req, _res, next) => {
  ensureSessionState(req.sessionID, req.session.userId ?? null);
  next();
});

function sendHealth(res: Response) {
  res.json({ ok: true, service: "nova-browser" });
}

app.get("/health", (_req, res) => {
  sendHealth(res);
});

app.get("/api/health", (_req, res) => {
  sendHealth(res);
});

app.get("/api/favicon", asyncRoute(async (req, res) => {
  const target = typeof req.query.url === "string" ? req.query.url : "";
  if (!target) {
    res.status(400).json({ error: "Missing favicon url." });
    return;
  }

  let hostname = "";
  try {
    hostname = new URL(target).hostname;
  } catch {
    res.status(400).json({ error: "Invalid favicon url." });
    return;
  }

  const cached = faviconCache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader("content-type", cached.contentType);
    res.setHeader("cache-control", "public, max-age=86400");
    res.send(cached.body);
    return;
  }

  const candidates = [
    `https://${hostname}/favicon.ico`,
    `https://icons.duckduckgo.com/ip3/${hostname}.ico`,
  ];

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, {
        redirect: "follow",
        headers: {
          "user-agent": FORCED_BROWSER_USER_AGENT,
          "accept-language": FORCED_ACCEPT_LANGUAGE,
          accept: "image/*,*/*;q=0.8",
        },
      });
      if (!response.ok) continue;

      const contentType = response.headers.get("content-type") || "image/x-icon";
      const arrayBuffer = await response.arrayBuffer();
      const body = Buffer.from(arrayBuffer);
      if (body.length === 0) continue;

      faviconCache.set(hostname, {
        contentType,
        body,
        expiresAt: Date.now() + 86_400_000,
      });
      res.setHeader("content-type", contentType);
      res.setHeader("cache-control", "public, max-age=86400");
      res.send(body);
      return;
    } catch {
      // Try the next favicon source.
    }
  }

  const fallback = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#1f2937"/><text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-size="28" fill="white">${hostname[0]?.toUpperCase() || "?"}</text></svg>`,
  );
  res.setHeader("content-type", "image/svg+xml");
  res.setHeader("cache-control", "public, max-age=86400");
  res.send(fallback);
}));

app.get("/api/session/status", (req, res) => {
  const user = req.session.userId ? getUserById(req.session.userId) : null;
  const isPrivileged =
    user && (user.role === "admin" || user.role === "master_admin");
  const ban = isPrivileged ? null : getActiveBan(req.sessionID, user?.id ?? null);
  res.json({ banned: ban ? formatBan(ban) : null });
});

app.get("/api/bootstrap", (req, res) => {
  const user = req.session.userId ? getUserById(req.session.userId) : null;
  const isPrivileged =
    user && (user.role === "admin" || user.role === "master_admin");
  const ban = isPrivileged ? null : getActiveBan(req.sessionID, user?.id ?? null);

  if (user && ban && ban.target_type === "user") {
    applySessionBanForUser(user.id, req.sessionID, String(ban.reason), ban.expires_at, ban.issued_by_user_id);
  }

  const state = getOwnerState(user?.id ?? null, req.sessionID);
  const settingsRecord = state.settings as Record<string, unknown>;
  const resolvedProxy = ensureSessionProxy(
    req.sessionID,
    user?.id ?? null,
    settingsRecord.proxyLocation,
  );

  res.json({
    sessionId: req.sessionID,
    user: user ? sanitizeUser(user) : null,
    banned: ban ? formatBan(ban) : null,
    browserState: state,
    defaults: {
      settings: defaultSettings,
      shortcuts: defaultShortcuts,
      tabs: defaultTabs,
      catalog: loadCatalogConfig(),
      proxyLocations: listProxyLocationMeta(),
      helpTips,
      themes,
    },
    alerts: getActiveAlerts(user?.id ?? null, req.sessionID),
    transport: buildTransportPayload(req, resolvedProxy),
  });
});

app.get("/api/proxy/locations", (_req, res) => {
  res.json({ locations: listProxyLocationMeta() });
});

app.get("/api/session/transport", (req, res) => {
  const user = req.session.userId ? getUserById(req.session.userId) : null;
  const state = getOwnerState(user?.id ?? null, req.sessionID);
  const settingsRecord = state.settings as Record<string, unknown>;
  const resolvedProxy = ensureSessionProxy(
    req.sessionID,
    user?.id ?? null,
    settingsRecord.proxyLocation,
  );
  res.json({ transport: buildTransportPayload(req, resolvedProxy) });
});

app.post("/api/admin/sessions/:sessionId/screen-share", requireAdmin, (req, res) => {
  const sessionId = req.params.sessionId;
  const exists = db.prepare("SELECT session_id FROM session_state WHERE session_id = ?").get(sessionId);
  if (!exists) {
    res.status(404).json({ error: "Session not found." });
    return;
  }
  const requestId = nanoid();
  const now = Date.now();
  db.prepare(`
    INSERT INTO screen_share_requests (
      id, target_session_id, admin_user_id, status, created_at, expires_at
    ) VALUES (?, ?, ?, 'pending', ?, ?)
  `).run(requestId, sessionId, req.session.userId!, now, now + SCREEN_SHARE_MAX_MS);
  res.json({ requestId, expiresAt: now + SCREEN_SHARE_MAX_MS });
});

app.get("/api/session/screen-share", (req, res) => {
  const now = Date.now();
  const row = db
    .prepare(
      `
    SELECT
      r.id,
      r.status,
      r.created_at,
      r.expires_at,
      r.admin_user_id
    FROM screen_share_requests r
    WHERE r.target_session_id = ?
      AND r.expires_at > ?
      AND r.status IN ('pending', 'streaming')
    ORDER BY r.created_at DESC
    LIMIT 1
  `,
    )
    .get(req.sessionID, now) as
    | {
        id: string;
        status: string;
        created_at: number;
        expires_at: number;
        admin_user_id: string;
      }
    | undefined;
  if (!row) {
    res.json({ request: null });
    return;
  }
  const admin = getUserById(row.admin_user_id);
  res.json({
    request: {
      id: row.id,
      status: row.status,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      adminUsername: admin?.username ?? "Admin",
    },
  });
});

app.post("/api/session/screen-share/:requestId/respond", (req, res) => {
  const parsed = screenShareRespondSchema.parse(req.body);
  const row = db.prepare("SELECT * FROM screen_share_requests WHERE id = ?").get(req.params.requestId) as
    | {
        id: string;
        target_session_id: string;
        status: string;
        expires_at: number;
      }
    | undefined;
  if (!row || row.target_session_id !== req.sessionID) {
    res.status(403).json({ error: "Invalid request." });
    return;
  }
  if (Date.now() > row.expires_at) {
    res.status(410).json({ error: "Request expired." });
    return;
  }
  if (row.status !== "pending") {
    res.json({ ok: true });
    return;
  }
  const now = Date.now();
  if (!parsed.accept) {
    db.prepare(
      `UPDATE screen_share_requests SET status = 'declined', declined_at = ?, ended_at = ? WHERE id = ?`,
    ).run(now, now, row.id);
    screenShareFrames.delete(row.id);
    res.json({ ok: true });
    return;
  }
  db.prepare(`UPDATE screen_share_requests SET status = 'streaming' WHERE id = ?`).run(row.id);
  res.json({ ok: true });
});

app.post("/api/session/screen-share/:requestId/frame", (req, res) => {
  const parsed = screenShareFrameSchema.parse(req.body);
  const row = db.prepare("SELECT * FROM screen_share_requests WHERE id = ?").get(req.params.requestId) as
    | {
        id: string;
        target_session_id: string;
        status: string;
        expires_at: number;
      }
    | undefined;
  if (!row || row.target_session_id !== req.sessionID) {
    res.status(403).json({ error: "Invalid request." });
    return;
  }
  if (Date.now() > row.expires_at) {
    res.status(410).json({ error: "Request expired." });
    return;
  }
  if (row.status !== "streaming") {
    res.status(409).json({ error: "Accept the request before sending frames." });
    return;
  }
  const last = screenShareLastFrameAt.get(row.id) ?? 0;
  if (Date.now() - last < 400) {
    res.status(429).json({ error: "Too many frames." });
    return;
  }
  screenShareLastFrameAt.set(row.id, Date.now());
  screenShareFrames.set(row.id, { dataUrl: parsed.image, updatedAt: Date.now() });
  res.json({ ok: true });
});

app.get("/api/admin/screen-share/:requestId", requireAdmin, (req, res) => {
  const row = db.prepare("SELECT * FROM screen_share_requests WHERE id = ?").get(req.params.requestId) as
    | { id: string; status: string }
    | undefined;
  if (!row) {
    res.status(404).json({ error: "Not found." });
    return;
  }
  const frame = screenShareFrames.get(String(req.params.requestId));
  res.json({
    status: row.status,
    frame: frame ? { dataUrl: frame.dataUrl, updatedAt: frame.updatedAt } : null,
  });
});

app.post("/api/admin/screen-share/:requestId/end", requireAdmin, (req, res) => {
  const row = db.prepare("SELECT id FROM screen_share_requests WHERE id = ?").get(req.params.requestId) as
    | { id: string }
    | undefined;
  if (!row) {
    res.status(404).json({ error: "Not found." });
    return;
  }
  const now = Date.now();
  db.prepare(`UPDATE screen_share_requests SET status = 'ended', ended_at = ? WHERE id = ?`).run(now, row.id);
  screenShareFrames.delete(row.id);
  screenShareLastFrameAt.delete(row.id);
  res.json({ ok: true });
});

app.post("/api/auth/register", asyncRoute(async (req, res) => {
  const parsed = registerSchema.parse(req.body);
  const username = normalizeUsername(parsed.username);

  assertValidUsername(username);

  if (getUserByUsername(username)) {
    res.status(409).json({ error: "That username is already taken." });
    return;
  }

  const id = nanoid();
  const passwordHash = await bcrypt.hash(parsed.password, 12);

  db.prepare(`
    INSERT INTO users (
      id, username, password_hash, role, created_at, updated_at
    ) VALUES (?, ?, ?, 'user', ?, ?)
  `).run(id, username, passwordHash, Date.now(), Date.now());

  req.session.userId = id;
  req.session.totpVerified = false;
  bindSessionToUser(req.sessionID, id);

  res.status(201).json({
    user: sanitizeUser(getUserById(id)!),
    browserState: getOwnerState(id, req.sessionID),
  });
}));

app.post("/api/auth/login", asyncRoute(async (req, res) => {
  const parsed = loginSchema.parse(req.body);
  const username = normalizeUsername(parsed.username);
  const user = getUserByUsername(username);

  if (!user) {
    res.status(401).json({ error: "Invalid username or password." });
    return;
  }

  const passwordOk = await bcrypt.compare(parsed.password, user.password_hash);

  if (!passwordOk) {
    res.status(401).json({ error: "Invalid username or password." });
    return;
  }

  const activeBan = getActiveBan(req.sessionID, user.id);

  if (activeBan && activeBan.target_type === "user") {
    applySessionBanForUser(user.id, req.sessionID, String(activeBan.reason), activeBan.expires_at, activeBan.issued_by_user_id);
    res.status(403).json({ error: "This account is banned.", banned: formatBan(activeBan) });
    return;
  }

  const adminRole = user.role === "admin" || user.role === "master_admin";
  if (adminRole) {
    if (!user.totp_enabled || !user.totp_secret_encrypted) {
      res.status(403).json({ error: "Admin accounts must have TOTP enabled." });
      return;
    }

    const token = parsed.totpToken?.trim();
    if (!token || !verifyTotpToken(user.totp_secret_encrypted, token)) {
      res.status(403).json({ error: "A valid TOTP token is required for admin login." });
      return;
    }
  }

  req.session.userId = user.id;
  req.session.totpVerified = adminRole;
  bindSessionToUser(req.sessionID, user.id);

  res.json({
    user: sanitizeUser(getUserById(user.id)!),
    browserState: getOwnerState(user.id, req.sessionID),
  });
}));

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.post("/api/auth/password", requireAuth, asyncRoute(async (req, res) => {
  const parsed = passwordSchema.parse(req.body);
  const user = getUserById(req.session.userId!);

  if (!user) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  const passwordOk = await bcrypt.compare(parsed.currentPassword, user.password_hash);

  if (!passwordOk) {
    res.status(401).json({ error: "Current password is incorrect." });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.newPassword, 12);
  db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(
    passwordHash,
    Date.now(),
    user.id,
  );

  res.json({ ok: true });
}));

app.post("/api/auth/totp/setup", requireAuth, asyncRoute(async (req, res) => {
  const user = getUserById(req.session.userId!);

  if (!user) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  const secret = new OTPAuth.Secret();
  const totp = new OTPAuth.TOTP({
    issuer: "Nova Browser",
    label: user.username,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });

  req.session.pendingTotpSecret = encryptValue(secret.base32);

  const qr = await QRCode.toDataURL(totp.toString());
  res.json({
    base32: secret.base32,
    qrCodeDataUrl: qr,
    otpauthUrl: totp.toString(),
  });
}));

app.post("/api/auth/totp/verify", requireAuth, (req, res) => {
  const parsed = totpVerifySchema.parse(req.body);
  const pendingSecret = req.session.pendingTotpSecret;
  const token = parsed.token.trim().replace(/\s+/g, "");

  if (!pendingSecret) {
    res.status(400).json({ error: "Start TOTP setup before verifying." });
    return;
  }

  const secret = decryptValue(pendingSecret);
  const totp = new OTPAuth.TOTP({
    issuer: "Nova Browser",
    label: "Nova Browser",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });

  const delta = totp.validate({ token, window: 1 });

  if (delta === null) {
    res.status(400).json({ error: "Invalid TOTP token." });
    return;
  }

  db.prepare(`
    UPDATE users
    SET totp_secret_encrypted = ?, totp_enabled = 1, updated_at = ?
    WHERE id = ?
  `).run(encryptValue(secret), Date.now(), req.session.userId);

  req.session.pendingTotpSecret = undefined;
  res.json({ ok: true });
});

app.delete("/api/auth/totp", requireAuth, (req, res) => {
  const user = getUserById(req.session.userId!);
  if (user && (user.role === "admin" || user.role === "master_admin")) {
    res.status(400).json({ error: "Admin accounts must keep TOTP enabled. Roll a new secret instead." });
    return;
  }

  db.prepare(`
    UPDATE users
    SET totp_secret_encrypted = NULL, totp_enabled = 0, updated_at = ?
    WHERE id = ?
  `).run(Date.now(), req.session.userId);

  res.json({ ok: true });
});

app.post("/api/state/settings", (req, res) => {
  const parsed = updateSettingsSchema.parse(req.body);
  const settings = parsed.settings;
  const owner = getOwnerKey(req.session.userId ?? null, req.sessionID);

  persistOwnerState(owner.type, owner.id, {
    settings,
  });

  res.json({ ok: true, settings });
});

app.post("/api/state/tabs", (req, res) => {
  const parsed = updateTabsSchema.parse(req.body);
  const owner = getOwnerKey(req.session.userId ?? null, req.sessionID);

  persistOwnerState(owner.type, owner.id, {
    tabs: parsed.tabs,
  });

  res.json({ ok: true, tabs: parsed.tabs });
});

app.post("/api/state/shortcuts", (req, res) => {
  const parsed = updateShortcutsSchema.parse(req.body);
  const owner = getOwnerKey(req.session.userId ?? null, req.sessionID);

  persistOwnerState(owner.type, owner.id, {
    shortcuts: parsed.shortcuts,
  });

  res.json({ ok: true, shortcuts: parsed.shortcuts });
});

app.post("/api/state/sync-local", requireAuth, (req, res) => {
  const settings = settingsSchema.parse(req.body.settings);
  const tabs = tabsSchema.parse(req.body.tabs);
  const shortcuts = shortcutsSchema.parse(req.body.shortcuts);

  persistOwnerState("user", req.session.userId!, {
    settings,
    tabs,
    shortcuts,
  });

  res.json({ ok: true, browserState: getOwnerState(req.session.userId!, req.sessionID) });
});

app.get("/api/state/sync-preview", requireAuth, (req, res) => {
  const sessionPasswords = db.prepare(`
    SELECT id, origin, site_username, created_at, updated_at
    FROM saved_passwords
    WHERE owner_type = 'session' AND owner_id = ?
    ORDER BY updated_at DESC
  `).all(req.sessionID);

  const accountPasswords = db.prepare(`
    SELECT id, origin, site_username, created_at, updated_at
    FROM saved_passwords
    WHERE owner_type = 'user' AND owner_id = ?
    ORDER BY updated_at DESC
  `).all(req.session.userId);

  res.json({ sessionPasswords, accountPasswords });
});

app.get("/api/passwords", (req, res) => {
  const owner = getOwnerKey(req.session.userId ?? null, req.sessionID);
  const rows = db.prepare(`
    SELECT id, origin, site_username, created_at, updated_at
    FROM saved_passwords
    WHERE owner_type = ? AND owner_id = ?
    ORDER BY updated_at DESC
  `).all(owner.type, owner.id);

  res.json({ passwords: rows });
});

app.post("/api/passwords", (req, res) => {
  const parsed = savePasswordSchema.parse(req.body);
  const owner = getOwnerKey(req.session.userId ?? null, req.sessionID);
  const now = Date.now();

  db.prepare(`
    INSERT INTO saved_passwords (
      id, owner_type, owner_id, origin, site_username, password_encrypted, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_type, owner_id, origin, site_username) DO UPDATE SET
      password_encrypted = excluded.password_encrypted,
      updated_at = excluded.updated_at
  `).run(
    nanoid(),
    owner.type,
    owner.id,
    parsed.origin,
    parsed.username,
    encryptValue(parsed.password),
    now,
    now,
  );

  res.status(201).json({ ok: true });
});

app.delete("/api/passwords/:id", (req, res) => {
  const owner = getOwnerKey(req.session.userId ?? null, req.sessionID);
  db.prepare("DELETE FROM saved_passwords WHERE id = ? AND owner_type = ? AND owner_id = ?").run(
    req.params.id,
    owner.type,
    owner.id,
  );
  res.json({ ok: true });
});

app.post("/api/passwords/import-session", requireAuth, (req, res) => {
  const parsed = importSessionPasswordsSchema.parse(req.body);
  if (parsed.ids.length === 0) {
    res.json({ ok: true, imported: 0 });
    return;
  }

  const rows = db.prepare(`
    SELECT origin, site_username, password_encrypted, created_at, updated_at
    FROM saved_passwords
    WHERE owner_type = 'session' AND owner_id = ?
      AND id IN (${parsed.ids.map(() => "?").join(",")})
  `).all(req.sessionID, ...parsed.ids) as Array<{
    origin: string;
    site_username: string;
    password_encrypted: string;
    created_at: number;
    updated_at: number;
  }>;

  const insert = db.prepare(`
    INSERT INTO saved_passwords (
      id, owner_type, owner_id, origin, site_username, password_encrypted, created_at, updated_at
    ) VALUES (?, 'user', ?, ?, ?, ?, ?, ?)
    ON CONFLICT(owner_type, owner_id, origin, site_username) DO UPDATE SET
      password_encrypted = excluded.password_encrypted,
      updated_at = excluded.updated_at
  `);

  db.transaction((entries: typeof rows) => {
    for (const entry of entries) {
      insert.run(
        nanoid(),
        req.session.userId,
        entry.origin,
        entry.site_username,
        entry.password_encrypted,
        entry.created_at,
        Date.now(),
      );
    }
  })(rows);

  res.json({ ok: true, imported: rows.length });
});

app.get("/api/alerts", (req, res) => {
  res.json({ alerts: getActiveAlerts(req.session.userId ?? null, req.sessionID) });
});

app.get("/api/messages/inbox", (req, res) => {
  res.json({
    notifications: getInboxNotifications(req.session.userId ?? null, req.sessionID),
    tickets: req.session.userId ? getSupportTicketsForUser(req.session.userId) : [],
  });
});

app.post("/api/messages/notifications/:id/state", (req, res) => {
  const parsed = notificationStateSchema.parse(req.body);
  const ownerKey = getAlertOwnerKey(req.session.userId ?? null, req.sessionID);
  db.prepare(`
    INSERT INTO alert_reads (id, alert_id, owner_key, read_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(alert_id, owner_key) DO UPDATE SET
      read_at = excluded.read_at
  `).run(nanoid(), req.params.id, ownerKey, parsed.read ? Date.now() : null);

  res.json({ ok: true });
});

app.post(
  "/api/messages/tickets",
  (req, res, next) => {
    if (req.headers["content-type"]?.includes("multipart/form-data")) {
      ticketUpload.array("files", 5)(req, res, (err: unknown) => {
        if (err) {
          next(err);
          return;
        }
        next();
      });
    } else {
      next();
    }
  },
  (req, res) => {
    if (!req.session.userId) {
      res.status(401).json({ error: "Sign in before opening a support ticket." });
      return;
    }

    const isMultipart = Boolean(req.headers["content-type"]?.includes("multipart/form-data"));
    let subject: string;
    let bodyText: string;
    let files: MulterFile[] = [];

    const ticketKind = "support";
    let relatedUrl: string | null = null;

    if (isMultipart) {
      subject = String((req.body as { subject?: string }).subject ?? "").trim();
      bodyText = String((req.body as { body?: string }).body ?? "").trim();
      files = ((req as Request & { files?: MulterFile[] }).files ?? []) as MulterFile[];
      const ru = String((req.body as { relatedUrl?: string }).relatedUrl ?? "").trim();
      relatedUrl = ru.length > 0 ? ru.slice(0, 2000) : null;
    } else {
      const parsed = createTicketSchema.parse(req.body);
      subject = parsed.subject.trim();
      bodyText = parsed.body.trim();
      const ru = (parsed.relatedUrl ?? "").trim();
      relatedUrl = ru.length > 0 ? ru.slice(0, 2000) : null;
    }

    if (subject.length < 3 || subject.length > 120) {
      res.status(400).json({ error: "Subject must be between 3 and 120 characters." });
      return;
    }
    if (bodyText.length > 4000) {
      res.status(400).json({ error: "Message is too long." });
      return;
    }
    if (!bodyText && files.length === 0) {
      res.status(400).json({ error: "Message text or at least one file is required." });
      return;
    }

    const now = Date.now();
    const activeCount = (db.prepare(`
    SELECT COUNT(*) AS count
    FROM support_tickets
    WHERE owner_user_id = ? AND status = 'open'
  `).get(req.session.userId) as { count: number }).count;
    if (activeCount >= 10) {
      res.status(429).json({ error: "You already have 10 active tickets." });
      return;
    }

    const latestTicket = db.prepare(`
    SELECT created_at
    FROM support_tickets
    WHERE owner_user_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(req.session.userId) as { created_at: number } | undefined;
    if (latestTicket && now - latestTicket.created_at < 60_000) {
      res.status(429).json({ error: "Please wait one minute before creating another ticket." });
      return;
    }

    const ticketId = nanoid();
    const messageId = nanoid();
    const storedBody = bodyText.length > 0 ? bodyText : files.length > 0 ? "(attachment)" : "";

    db.prepare(`
    INSERT INTO support_tickets (
      id, owner_user_id, subject, status, last_read_by_owner_at, last_read_by_admin_at, created_at, updated_at, kind, related_url
    ) VALUES (?, ?, ?, 'open', ?, NULL, ?, ?, ?, ?)
  `).run(ticketId, req.session.userId, subject, now, now, now, ticketKind, relatedUrl);
    db.prepare(`
    INSERT INTO support_messages (
      id, ticket_id, author_user_id, author_role, body, created_at
    ) VALUES (?, ?, ?, 'user', ?, ?)
  `).run(messageId, ticketId, req.session.userId, storedBody, now);

    const insertAttachment = db.prepare(`
    INSERT INTO support_message_attachments (
      id, message_id, original_name, mime_type, size, stored_name, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
    for (const file of files) {
      insertAttachment.run(
        nanoid(),
        messageId,
        file.originalname,
        file.mimetype || "application/octet-stream",
        file.size,
        file.filename,
        now,
      );
    }

    res.status(201).json({ ok: true });
  },
);

app.post(
  "/api/messages/tickets/:ticketId/messages",
  (req, res, next) => {
    if (req.headers["content-type"]?.includes("multipart/form-data")) {
      ticketUpload.array("files", 5)(req, res, (err: unknown) => {
        if (err) {
          next(err);
          return;
        }
        next();
      });
    } else {
      next();
    }
  },
  (req, res) => {
    if (!req.session.userId) {
      res.status(401).json({ error: "Sign in before replying to tickets." });
      return;
    }

    const isMultipart = Boolean(req.headers["content-type"]?.includes("multipart/form-data"));
    const bodyText = isMultipart
      ? String((req.body as { body?: string }).body ?? "").trim()
      : createTicketMessageSchema.parse(req.body).body.trim();
    const uploaded = isMultipart
      ? ((req as Request & { files?: MulterFile[] }).files ?? [])
      : [];

    const ticket = db.prepare("SELECT * FROM support_tickets WHERE id = ?").get(req.params.ticketId) as
      | { id: string; owner_user_id: string; status: string }
      | undefined;
    if (!ticket) {
      res.status(404).json({ error: "Ticket not found." });
      return;
    }

    if (ticket.status === "closed") {
      res.status(409).json({ error: "This ticket is closed." });
      return;
    }

    const actor = getUserById(req.session.userId);
    const isAdmin = actor?.role === "admin" || actor?.role === "master_admin";
    if (!isAdmin && ticket.owner_user_id !== req.session.userId) {
      res.status(403).json({ error: "You do not have access to that ticket." });
      return;
    }

    const latestMessage = db.prepare(`
    SELECT created_at
    FROM support_messages
    WHERE author_user_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(req.session.userId) as { created_at: number } | undefined;
    const now = Date.now();
    if (latestMessage && now - latestMessage.created_at < 5_000) {
      res.status(429).json({ error: "Please wait five seconds before sending another message." });
      return;
    }

    const files = uploaded ?? [];
    if (!bodyText && files.length === 0) {
      res.status(400).json({ error: "Message text or at least one file is required." });
      return;
    }

    const messageId = nanoid();
    const storedBody = bodyText.length > 0 ? bodyText : files.length > 0 ? "(attachment)" : "";

    db.prepare(`
    INSERT INTO support_messages (
      id, ticket_id, author_user_id, author_role, body, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(messageId, ticket.id, req.session.userId, isAdmin ? actor!.role : "user", storedBody, now);

    const insertAttachment = db.prepare(`
    INSERT INTO support_message_attachments (
      id, message_id, original_name, mime_type, size, stored_name, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
    for (const file of files) {
      insertAttachment.run(
        nanoid(),
        messageId,
        file.originalname,
        file.mimetype || "application/octet-stream",
        file.size,
        file.filename,
        now,
      );
    }

    db.prepare(`
    UPDATE support_tickets
    SET updated_at = ?,
        last_read_by_owner_at = CASE WHEN ? = 0 THEN ? ELSE last_read_by_owner_at END,
        last_read_by_admin_at = CASE WHEN ? = 1 THEN ? ELSE last_read_by_admin_at END
    WHERE id = ?
  `).run(now, isAdmin ? 1 : 0, now, isAdmin ? 1 : 0, now, ticket.id);

    res.json({ ok: true });
  },
);

app.post("/api/messages/tickets/:ticketId/close", (req, res) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Sign in before closing tickets." });
    return;
  }

  const ticket = db.prepare("SELECT * FROM support_tickets WHERE id = ?").get(req.params.ticketId) as
    | { id: string; owner_user_id: string; status: string }
    | undefined;
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found." });
    return;
  }

  const actor = getUserById(req.session.userId);
  const isAdmin = actor?.role === "admin" || actor?.role === "master_admin";
  if (!isAdmin && ticket.owner_user_id !== req.session.userId) {
    res.status(403).json({ error: "You do not have access to that ticket." });
    return;
  }

  if (ticket.status === "closed") {
    res.json({ ok: true });
    return;
  }

  const now = Date.now();
  const closeBody = isAdmin
    ? `An admin closed this ticket.${actor?.username ? ` Closed by ${actor.username}.` : ""}`
    : "This ticket was closed by the user.";
  const closeMessageId = crypto.randomUUID();
  db.transaction(() => {
    db.prepare(`
      UPDATE support_tickets
      SET status = 'closed',
          updated_at = ?,
          last_read_by_admin_at = CASE WHEN ? = 1 THEN ? ELSE last_read_by_admin_at END,
          last_read_by_owner_at = CASE WHEN ? = 1 THEN ? ELSE last_read_by_owner_at END
      WHERE id = ?
    `).run(
      now,
      isAdmin ? 1 : 0,
      now,
      isAdmin ? 0 : 1,
      now,
      ticket.id,
    );
    db.prepare(`
      INSERT INTO support_messages (
        id, ticket_id, author_user_id, author_role, body, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      closeMessageId,
      ticket.id,
      req.session.userId,
      isAdmin ? actor?.role ?? "admin" : "user",
      closeBody,
      now,
    );
  })();
  res.json({ ok: true });
});

app.post("/api/messages/inbox/mark-all-read", (req, res) => {
  const userId = req.session.userId ?? null;
  const ownerKey = getAlertOwnerKey(userId, req.sessionID);
  const now = Date.now();
  const sessionCreatedAt = getSessionCreatedAt(req.sessionID);
  const rows = db
    .prepare(
      `
    SELECT a.id
    FROM alerts a
    WHERE a.active = 1
      AND (
        a.target_user_id = ?
        OR (
          a.target_user_id IS NULL
          AND (a.deliver_until_at IS NULL OR a.deliver_until_at >= ?)
          AND a.created_at >= ?
        )
      )
  `,
    )
    .all(userId, now, sessionCreatedAt) as Array<{ id: string }>;

  const upsert = db.prepare(`
    INSERT INTO alert_reads (id, alert_id, owner_key, read_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(alert_id, owner_key) DO UPDATE SET
      read_at = excluded.read_at
  `);
  for (const row of rows) {
    upsert.run(nanoid(), row.id, ownerKey, now);
  }
  res.json({ ok: true });
});

app.post("/api/messages/tickets/:ticketId/read", (req, res) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Sign in before reading support tickets." });
    return;
  }

  const ticket = db.prepare("SELECT * FROM support_tickets WHERE id = ?").get(req.params.ticketId) as
    | { id: string; owner_user_id: string }
    | undefined;
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found." });
    return;
  }

  const actor = getUserById(req.session.userId);
  const isAdmin = actor?.role === "admin" || actor?.role === "master_admin";
  if (!isAdmin && ticket.owner_user_id !== req.session.userId) {
    res.status(403).json({ error: "You do not have access to that ticket." });
    return;
  }

  db.prepare(`
    UPDATE support_tickets
    SET last_read_by_owner_at = CASE WHEN ? = 0 THEN ? ELSE last_read_by_owner_at END,
        last_read_by_admin_at = CASE WHEN ? = 1 THEN ? ELSE last_read_by_admin_at END
    WHERE id = ?
  `).run(isAdmin ? 1 : 0, Date.now(), isAdmin ? 1 : 0, Date.now(), ticket.id);

  res.json({ ok: true });
});

app.get("/api/messages/attachments/:attachmentId", (req, res) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Sign in required." });
    return;
  }
  const row = db.prepare(`
    SELECT a.stored_name, a.mime_type, t.owner_user_id
    FROM support_message_attachments a
    JOIN support_messages m ON m.id = a.message_id
    JOIN support_tickets t ON t.id = m.ticket_id
    WHERE a.id = ?
  `).get(req.params.attachmentId) as
    | { stored_name: string; mime_type: string; owner_user_id: string }
    | undefined;
  if (!row) {
    res.status(404).end();
    return;
  }
  const actor = getUserById(req.session.userId);
  const isAdmin = actor?.role === "admin" || actor?.role === "master_admin";
  if (!isAdmin && row.owner_user_id !== req.session.userId) {
    res.status(403).end();
    return;
  }
  const filePath = path.join(uploadsRoot, row.stored_name);
  if (!fs.existsSync(filePath)) {
    res.status(404).end();
    return;
  }
  res.setHeader("content-type", row.mime_type || "application/octet-stream");
  res.sendFile(filePath);
});

app.post("/api/navigation/resolve", (req, res) => {
  const parsed = resolveNavigationSchema.parse(req.body);
  const actor = req.session.userId ? getUserById(req.session.userId) : null;
  const actorIsAdmin = Boolean(
    actor && (actor.role === "admin" || actor.role === "master_admin"),
  );
  const ownerSettings = getOwnerState(req.session.userId ?? null, req.sessionID).settings;
  const defaultSearchEngine =
    typeof ownerSettings.defaultSearchEngine === "string"
      ? ownerSettings.defaultSearchEngine
      : "google";
  const normalizedUrl = normalizeUrl(parsed.url, defaultSearchEngine);
  const matchedFilter = getBlockForUrl(normalizedUrl, req.session.userId ?? null);
  const block = matchedFilter && String(matchedFilter.mode ?? "block") === "block" ? matchedFilter : null;
  const effectiveBlock =
    actorIsAdmin && parsed.allowAdminBypass && block ? null : block;
  const category = categorizeUrl(normalizedUrl);
  const flagged =
    (matchedFilter ? String(matchedFilter.mode ?? "block") === "flag" : false) ||
    Boolean(block);

  db.prepare(`
    INSERT INTO website_logs (
      id, user_id, session_id, url, title, hostname, category, flagged, blocked, filter_list_name, filter_mode, notify_admin, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    nanoid(),
    req.session.userId ?? null,
    req.sessionID,
    normalizedUrl,
    parsed.title ?? null,
    new URL(normalizedUrl).hostname,
    category,
    flagged ? 1 : 0,
    effectiveBlock ? 1 : 0,
    matchedFilter?.list_name ? String(matchedFilter.list_name) : null,
    matchedFilter?.mode ? String(matchedFilter.mode) : null,
    matchedFilter?.notify_on_match ? 1 : 0,
    Date.now(),
  );

  if (effectiveBlock) {
    res.status(403).json({
      blocked: true,
      reason: effectiveBlock.reason,
      pattern: effectiveBlock.pattern,
      listName: effectiveBlock.list_name ?? null,
      url: normalizedUrl,
      flagged,
      adminBypassAllowed: actorIsAdmin,
    });
    return;
  }

  res.json({
    blocked: false,
    url: normalizedUrl,
    flagged,
  });
});

app.get("/api/search/suggestions", asyncRoute(async (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!query) {
    res.json({ suggestions: [] });
    return;
  }

  const response = await fetch(
    `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`,
  );
  if (!response.ok) {
    res.status(502).json({ suggestions: [] });
    return;
  }

  const payload = (await response.json()) as unknown;
  const suggestions =
    Array.isArray(payload) && Array.isArray(payload[1])
      ? payload[1]
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 6)
      : [];

  res.json({ suggestions });
}));

app.get("/api/admin/users", requireAdmin, (_req, res) => {
  const now = Date.now();
  const rows = db.prepare(`
    SELECT
      u.id,
      u.username,
      u.role,
      u.totp_enabled,
      u.created_at,
      s.session_id AS latest_session_id,
      latest_session.last_seen_at AS latest_session_last_seen_at,
      COALESCE(flagged.flagged_count, 0) AS flagged_count,
      active_bans.id AS active_ban_id,
      active_bans.reason AS active_ban_reason,
      active_bans.expires_at AS active_ban_expires_at
    FROM users u
    LEFT JOIN (
      SELECT user_id, COUNT(*) AS flagged_count
      FROM website_logs
      WHERE flagged = 1
      GROUP BY user_id
    ) flagged ON flagged.user_id = u.id
    LEFT JOIN (
      SELECT user_id, MAX(last_seen_at) AS last_seen_at
      FROM session_state
      WHERE user_id IS NOT NULL
      GROUP BY user_id
    ) latest_session ON latest_session.user_id = u.id
    LEFT JOIN session_state s
      ON s.user_id = u.id AND s.last_seen_at = latest_session.last_seen_at
    LEFT JOIN (
      SELECT b.id, b.target_user_id, b.reason, b.expires_at
      FROM bans b
      INNER JOIN (
        SELECT target_user_id, MAX(created_at) AS latest_created_at
        FROM bans
        WHERE target_type = 'user' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)
        GROUP BY target_user_id
      ) latest_active_bans
        ON latest_active_bans.target_user_id = b.target_user_id
       AND latest_active_bans.latest_created_at = b.created_at
      WHERE b.target_type = 'user' AND b.revoked_at IS NULL AND (b.expires_at IS NULL OR b.expires_at > ?)
    ) active_bans ON active_bans.target_user_id = u.id
    ORDER BY
      CASE WHEN latest_session.last_seen_at IS NULL THEN 1 ELSE 0 END,
      latest_session.last_seen_at DESC,
      u.username COLLATE NOCASE ASC
  `).all(now, now);

  res.json({ users: rows });
});

app.get("/api/admin/logs", requireAdmin, (req, res) => {
  const filter = String(req.query.filter ?? "all");
  let sql = `
    SELECT wl.*, u.username
    FROM website_logs wl
    LEFT JOIN users u ON u.id = wl.user_id
  `;
  const params: unknown[] = [];

  if (filter === "flagged") {
    sql += " WHERE wl.flagged = 1 OR wl.blocked = 1 ";
  } else if (filter === "blocked") {
    sql += " WHERE wl.blocked = 1 ";
  } else if (filter === "regular") {
    sql += " WHERE wl.flagged = 0 AND wl.blocked = 0 ";
  }

  sql += " ORDER BY wl.flagged DESC, wl.created_at DESC LIMIT 250";

  res.json({ logs: db.prepare(sql).all(...params) });
});

app.get("/api/admin/blocked-sites", requireAdmin, (_req, res) => {
  const rows = db.prepare(`
    SELECT bs.*, u.username, issuer.username AS created_by_username
    FROM blocked_sites bs
    LEFT JOIN users u ON u.id = bs.user_id
    LEFT JOIN users issuer ON issuer.id = bs.created_by_user_id
    ORDER BY
      CASE WHEN bs.is_enabled = 1 THEN 0 ELSE 1 END,
      CASE WHEN bs.mode = 'block' THEN 0 ELSE 1 END,
      bs.created_at DESC
  `).all();

  res.json({ blockedSites: rows });
});

app.post("/api/admin/blocked-sites", requireAdmin, (req, res) => {
  const parsed = blockSiteSchema.parse(req.body);
  const pattern = normalizeBlockedSitePattern(parsed.pattern);
  const reason = parsed.reason.trim();
  if (!pattern || !reason) {
    res.status(400).json({ error: "Blocked site pattern and reason are required." });
    return;
  }
  upsertBlockedSite({
    userId: parsed.userId ?? null,
    pattern,
    reason,
    listName: parsed.listName?.trim() || null,
    mode: parsed.mode ?? "block",
    notifyOnMatch: parsed.notifyOnMatch ?? true,
    isEnabled: parsed.isEnabled ?? true,
    createdByUserId: req.session.userId!,
  });

  res.status(201).json({ ok: true });
});

app.post("/api/admin/blocked-sites/import", requireAdmin, (req, res) => {
  const parsed = importBlockedSitesSchema.parse(req.body);
  const entries = parsed.content
    .split(/\r?\n/)
    .map((line) => normalizeBlockedSitePattern(line))
    .filter(Boolean);

  if (entries.length === 0) {
    res.status(400).json({ error: "No blocking rules were found in that file." });
    return;
  }

  const uniquePatterns = Array.from(new Set(entries));
  const transaction = db.transaction((patterns: string[]) => {
    for (const pattern of patterns) {
      upsertBlockedSite({
        userId: parsed.userId ?? null,
        pattern,
        reason: parsed.reason.trim(),
        listName: parsed.listName?.trim() || null,
        mode: parsed.mode ?? "block",
        notifyOnMatch: parsed.notifyOnMatch ?? true,
        isEnabled: parsed.isEnabled ?? true,
        createdByUserId: req.session.userId!,
      });
    }
  });

  transaction(uniquePatterns);

  res.status(201).json({ ok: true, imported: uniquePatterns.length });
});

app.patch("/api/admin/blocked-sites/:id", requireAdmin, (req, res) => {
  const parsed = updateBlockedSiteSchema.parse(req.body);
  const existing = db.prepare("SELECT id FROM blocked_sites WHERE id = ?").get(req.params.id) as
    | { id: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: "Filter rule not found." });
    return;
  }
  const current = db.prepare("SELECT * FROM blocked_sites WHERE id = ?").get(req.params.id) as Record<string, unknown>;
  db.prepare(`
    UPDATE blocked_sites
    SET pattern = ?,
        reason = ?,
        list_name = ?,
        mode = ?,
        notify_on_match = ?,
        is_enabled = ?
    WHERE id = ?
  `).run(
    parsed.pattern ? normalizeBlockedSitePattern(parsed.pattern) : String(current.pattern),
    parsed.reason?.trim() ?? String(current.reason),
    parsed.listName?.trim() ?? (current.list_name ? String(current.list_name) : null),
    parsed.mode ?? (String(current.mode || "block") === "flag" ? "flag" : "block"),
    parsed.notifyOnMatch === undefined ? Number(current.notify_on_match ?? 1) : (parsed.notifyOnMatch ? 1 : 0),
    parsed.isEnabled === undefined ? Number(current.is_enabled ?? 1) : (parsed.isEnabled ? 1 : 0),
    req.params.id,
  );
  res.json({ ok: true });
});

app.delete("/api/admin/blocked-sites/:id", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM blocked_sites WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

app.get("/api/admin/alerts", requireAdmin, (_req, res) => {
  const rows = db.prepare(`
    SELECT a.*, u.username AS target_username, issuer.username AS created_by_username
    FROM alerts a
    LEFT JOIN users u ON u.id = a.target_user_id
    LEFT JOIN users issuer ON issuer.id = a.created_by_user_id
    ORDER BY a.created_at DESC
  `).all();

  res.json({ alerts: rows });
});

app.get("/api/admin/tickets", requireAdmin, (_req, res) => {
  res.json({ tickets: getSupportTicketsForAdmin() });
});

app.get("/api/admin/notifications", requireAdmin, (req, res) => {
  res.json({ notifications: getAdminNotifications(req.session.userId!) });
});

app.post("/api/admin/notifications/:notificationId/read", requireAdmin, (req, res) => {
  const parsed = readStateSchema.parse(req.body);
  const notificationId = String(req.params.notificationId);
  if (parsed.read) {
    db.prepare(`
      INSERT INTO admin_notification_reads (id, notification_id, user_id, read_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(notification_id, user_id) DO UPDATE SET read_at = excluded.read_at
    `).run(crypto.randomUUID(), notificationId, req.session.userId, Date.now());
  } else {
    db.prepare(`
      DELETE FROM admin_notification_reads
      WHERE notification_id = ? AND user_id = ?
    `).run(notificationId, req.session.userId);
  }
  res.json({ ok: true });
});

app.get("/api/admin/bans", requireAdmin, (req, res) => {
  const now = Date.now();
  const timeframe = parseAnalyticsTimeframe(req.query.timeframe);
  const recentWindow = now - ADMIN_TIMEFRAME_WINDOWS[timeframe];
  const activeBans = db.prepare(`
    SELECT
      b.*,
      target.username AS target_username,
      issuer.username AS issued_by_username
    FROM bans b
    LEFT JOIN users target ON target.id = b.target_user_id
    LEFT JOIN users issuer ON issuer.id = b.issued_by_user_id
    WHERE b.revoked_at IS NULL
      AND (b.expires_at IS NULL OR b.expires_at > ?)
    ORDER BY b.created_at DESC
  `).all(now);
  const recentUnbans = db.prepare(`
    SELECT
      b.*,
      target.username AS target_username,
      issuer.username AS issued_by_username
    FROM bans b
    LEFT JOIN users target ON target.id = b.target_user_id
    LEFT JOIN users issuer ON issuer.id = b.issued_by_user_id
    WHERE b.revoked_at IS NOT NULL
      AND b.revoked_at >= ?
    ORDER BY b.revoked_at DESC
    LIMIT 25
  `).all(recentWindow);

  res.json({ activeBans, recentUnbans });
});

app.post("/api/admin/bans/:banId/revoke", requireAdmin, (req, res) => {
  const banId = String(req.params.banId);
  const row = db.prepare("SELECT id FROM bans WHERE id = ? AND revoked_at IS NULL").get(banId);
  if (!row) {
    res.status(404).json({ error: "Active ban not found." });
    return;
  }
  db.prepare("UPDATE bans SET revoked_at = ? WHERE id = ?").run(Date.now(), banId);
  res.json({ ok: true });
});

app.get("/api/admin/sessions", requireAdmin, (_req, res) => {
  const now = Date.now();
  const rows = db.prepare(`
    SELECT
      s.session_id,
      s.user_id,
      u.username,
      u.role,
      s.last_seen_at,
      s.created_at,
      COALESCE(flagged.flagged_count, 0) AS flagged_count,
      active_bans.id AS active_ban_id,
      active_bans.reason AS active_ban_reason
    FROM session_state s
    LEFT JOIN users u ON u.id = s.user_id
    LEFT JOIN (
      SELECT session_id, COUNT(*) AS flagged_count
      FROM website_logs
      WHERE flagged = 1
      GROUP BY session_id
    ) flagged ON flagged.session_id = s.session_id
    LEFT JOIN (
      SELECT b.id, b.target_session_id, b.reason
      FROM bans b
      INNER JOIN (
        SELECT target_session_id, MAX(created_at) AS latest_created_at
        FROM bans
        WHERE target_type = 'session' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)
        GROUP BY target_session_id
      ) latest_active_bans
        ON latest_active_bans.target_session_id = b.target_session_id
       AND latest_active_bans.latest_created_at = b.created_at
      WHERE b.target_type = 'session' AND b.revoked_at IS NULL AND (b.expires_at IS NULL OR b.expires_at > ?)
    ) active_bans ON active_bans.target_session_id = s.session_id
    ORDER BY
      s.last_seen_at DESC,
      CASE WHEN s.user_id IS NOT NULL THEN 0 ELSE 1 END,
      COALESCE(u.username, s.session_id) COLLATE NOCASE ASC
  `).all(now, now);

  res.json({ sessions: rows });
});

app.get("/api/admin/stats", requireAdmin, (req, res) => {
  const now = Date.now();
  const timeframe = parseAnalyticsTimeframe(req.query.timeframe);
  const { since, buckets } = getActivitySeries(now, timeframe);
  const stats = {
    totalUsers: Number(
      (db.prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number }).count,
    ),
    adminUsers: Number(
      (db.prepare("SELECT COUNT(*) AS count FROM users WHERE role IN ('admin', 'master_admin')").get() as { count: number }).count,
    ),
    onlineUsers: Number(
      (db.prepare(`
        SELECT COUNT(DISTINCT user_id) AS count
        FROM session_state
        WHERE user_id IS NOT NULL AND last_seen_at >= ?
      `).get(now - ONLINE_WINDOW_MS) as { count: number }).count,
    ),
    activeSessions: Number(
      (db.prepare("SELECT COUNT(*) AS count FROM session_state WHERE last_seen_at >= ?").get(now - ONLINE_WINDOW_MS) as { count: number }).count,
    ),
    loggedInSessions: Number(
      (db.prepare("SELECT COUNT(*) AS count FROM session_state WHERE user_id IS NOT NULL AND last_seen_at >= ?").get(now - ONLINE_WINDOW_MS) as { count: number }).count,
    ),
    guestSessions: Number(
      (db.prepare("SELECT COUNT(*) AS count FROM session_state WHERE user_id IS NULL AND last_seen_at >= ?").get(now - ONLINE_WINDOW_MS) as { count: number }).count,
    ),
    dailyActiveUsers: Number(
      (db.prepare(`
        SELECT COUNT(DISTINCT user_id) AS count
        FROM session_state
        WHERE user_id IS NOT NULL AND last_seen_at >= ?
      `).get(since) as { count: number }).count,
    ),
    dailyActiveGuests: Number(
      (db.prepare(`
        SELECT COUNT(DISTINCT session_id) AS count
        FROM session_state
        WHERE user_id IS NULL AND last_seen_at >= ?
      `).get(since) as { count: number }).count,
    ),
    activeBans: Number(
      (db.prepare(`
        SELECT COUNT(*) AS count
        FROM bans
        WHERE revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > ?)
      `).get(now) as { count: number }).count,
    ),
    blockedSites: Number(
      (db.prepare("SELECT COUNT(*) AS count FROM blocked_sites").get() as { count: number }).count,
    ),
    flaggedLogs24h: Number(
      (db.prepare("SELECT COUNT(*) AS count FROM website_logs WHERE flagged = 1 AND created_at >= ?").get(since) as { count: number }).count,
    ),
    totalLogs24h: Number(
      (db.prepare("SELECT COUNT(*) AS count FROM website_logs WHERE created_at >= ?").get(since) as { count: number }).count,
    ),
    alerts24h: Number(
      (db.prepare("SELECT COUNT(*) AS count FROM alerts WHERE created_at >= ?").get(since) as { count: number }).count,
    ),
    timeframe,
    activitySeries: buckets,
  };

  res.json({ stats });
});

app.post("/api/admin/alerts", requireAdmin, (req, res) => {
  const parsed = alertSchema.parse(req.body);
  const now = Date.now();
  const deliverUntilAt = parsed.targetUserId ? null : now + GLOBAL_ALERT_WINDOW_MS;

  db.prepare(`
    INSERT INTO alerts (
      id, target_user_id, title, message, color, created_by_user_id, active, created_at, deliver_until_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    nanoid(),
    parsed.targetUserId ?? null,
    parsed.title,
    parsed.message,
    parsed.color,
    req.session.userId,
    now,
    deliverUntilAt,
  );

  res.status(201).json({ ok: true });
});

app.delete("/api/admin/alerts/:id", requireAdmin, (req, res) => {
  db.prepare("UPDATE alerts SET active = 0 WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

app.post("/api/admin/users/:userId/ban", requireAdmin, (req, res) => {
  const parsed = banSchema.parse(req.body);
  const targetUser = getUserById(String(req.params.userId));

  if (!targetUser) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  if (targetUser.role === "master_admin" || targetUser.role === "admin") {
    res.status(403).json({ error: "Admin accounts cannot be banned." });
    return;
  }

  const expiresAt = parsed.durationMinutes ? Date.now() + parsed.durationMinutes * 60 * 1000 : null;
  const targetSessionId = parsed.targetSessionId ?? getLatestSessionIdForUser(targetUser.id);
  const existingUserBan = getExistingActiveBan({
    targetType: "user",
    targetUserId: targetUser.id,
    targetSessionId: targetSessionId ?? null,
  });
  if (existingUserBan) {
    res.status(409).json({ error: "That user already has an active ban." });
    return;
  }

  db.prepare(`
    INSERT INTO bans (
      id, target_type, target_user_id, target_session_id, reason, issued_by_user_id, expires_at, created_at
    ) VALUES (?, 'user', ?, ?, ?, ?, ?, ?)
  `).run(nanoid(), targetUser.id, targetSessionId, parsed.reason, req.session.userId, expiresAt, Date.now());

  if (targetSessionId) {
    const existingSessionBan = getExistingActiveBan({
      targetType: "session",
      targetUserId: targetUser.id,
      targetSessionId,
    });
    if (!existingSessionBan) {
    db.prepare(`
      INSERT INTO bans (
        id, target_type, target_user_id, target_session_id, reason, issued_by_user_id, expires_at, created_at
      ) VALUES (?, 'session', ?, ?, ?, ?, ?, ?)
    `).run(nanoid(), targetUser.id, targetSessionId, parsed.reason, req.session.userId, expiresAt, Date.now());
    }
  }

  res.json({ ok: true });
});

app.post("/api/admin/sessions/:sessionId/ban", requireAdmin, (req, res) => {
  const parsed = banSchema.parse(req.body);
  const sessionId = String(req.params.sessionId);
  const sessionRow = db
    .prepare("SELECT user_id FROM session_state WHERE session_id = ?")
    .get(sessionId) as { user_id: string | null } | undefined;
  if (sessionRow?.user_id) {
    const sessionUser = getUserById(sessionRow.user_id);
    if (
      sessionUser &&
      (sessionUser.role === "admin" || sessionUser.role === "master_admin")
    ) {
      res.status(403).json({ error: "Sessions belonging to admins cannot be banned." });
      return;
    }
  }
  const expiresAt = parsed.durationMinutes ? Date.now() + parsed.durationMinutes * 60 * 1000 : null;
  const existingSessionBan = getExistingActiveBan({
    targetType: "session",
    targetSessionId: sessionId,
  });
  if (existingSessionBan) {
    res.status(409).json({ error: "That session already has an active ban." });
    return;
  }

  db.prepare(`
    INSERT INTO bans (
      id, target_type, target_user_id, target_session_id, reason, issued_by_user_id, expires_at, created_at
    ) VALUES (?, 'session', NULL, ?, ?, ?, ?, ?)
  `).run(nanoid(), sessionId, parsed.reason, req.session.userId, expiresAt, Date.now());

  res.json({ ok: true });
});

app.post("/api/admin/users/:userId/role", requireAdmin, (req, res) => {
  const parsed = updateRoleSchema.parse(req.body);
  const targetUser = getUserById(String(req.params.userId));
  const actingUser = getUserById(req.session.userId!);

  if (!targetUser) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  if (!actingUser) {
    res.status(401).json({ error: "Admin session is invalid." });
    return;
  }

  if (targetUser.role === "master_admin") {
    res.status(403).json({ error: "The master admin role cannot be changed." });
    return;
  }

  if (actingUser.id === targetUser.id && parsed.role === "user") {
    res.status(400).json({ error: "You cannot demote your own account while signed in." });
    return;
  }

  if (parsed.role === "admin" && !targetUser.totp_enabled) {
    res.status(400).json({ error: "Users must enable TOTP before being promoted to admin." });
    return;
  }

  db.prepare("UPDATE users SET role = ?, updated_at = ? WHERE id = ?").run(
    parsed.role,
    Date.now(),
    targetUser.id,
  );

  res.json({ ok: true });
});

app.post("/api/admin/users/:userId/reset-password", requireAdmin, asyncRoute(async (req, res) => {
  const parsed = resetPasswordSchema.parse(req.body);
  const targetUser = getUserById(String(req.params.userId));

  if (!targetUser) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.newPassword, 12);
  db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(
    passwordHash,
    Date.now(),
    targetUser.id,
  );

  res.json({ ok: true });
}));

app.post("/api/admin/users/:userId/reset-totp", requireAdmin, asyncRoute(async (req, res) => {
  const targetUser = getUserById(String(req.params.userId));

  if (!targetUser) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  if (targetUser.role === "master_admin") {
    res.status(403).json({ error: "The master admin TOTP secret cannot be reset from the panel." });
    return;
  }

  if (targetUser.role === "admin") {
    const secret = new OTPAuth.Secret();
    const totp = new OTPAuth.TOTP({
      issuer: "Nova Browser",
      label: targetUser.username,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret,
    });

    db.prepare(`
      UPDATE users
      SET totp_secret_encrypted = ?, totp_enabled = 0, updated_at = ?
      WHERE id = ?
    `).run(encryptValue(secret.base32), Date.now(), targetUser.id);

    const qr = await QRCode.toDataURL(totp.toString());
    res.json({
      ok: true,
      base32: secret.base32,
      qrCodeDataUrl: qr,
      otpauthUrl: totp.toString(),
      requiresVerification: true,
    });
    return;
  }

  db.prepare(`
    UPDATE users
    SET totp_secret_encrypted = NULL, totp_enabled = 0, updated_at = ?
    WHERE id = ?
  `).run(Date.now(), targetUser.id);

  res.json({ ok: true });
}));

app.post("/api/admin/users/:userId/username", requireAdmin, (req, res) => {
  const parsed = updateUsernameSchema.parse(req.body);
  const username = normalizeUsername(parsed.username);
  assertValidUsername(username);

  const targetUser = getUserById(String(req.params.userId));
  if (!targetUser) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  const existing = getUserByUsername(username);
  if (existing && existing.id !== targetUser.id) {
    res.status(409).json({ error: "That username is already taken." });
    return;
  }

  db.prepare("UPDATE users SET username = ?, updated_at = ? WHERE id = ?").run(
    username,
    Date.now(),
    targetUser.id,
  );

  res.json({ ok: true });
});

app.delete("/api/admin/users/:userId", requireAdmin, (req, res) => {
  const targetUser = getUserById(String(req.params.userId));
  if (!targetUser) {
    res.status(404).json({ error: "User not found." });
    return;
  }
  if (targetUser.role === "master_admin" || targetUser.role === "admin") {
    res.status(403).json({ error: "Admin accounts cannot be deleted." });
    return;
  }

  const id = targetUser.id;
  const deleteTx = db.transaction(() => {
    const ticketIds = (
      db.prepare("SELECT id FROM support_tickets WHERE owner_user_id = ?").all(id) as { id: string }[]
    ).map((row) => row.id);
    for (const tid of ticketIds) {
      db.prepare(
        "DELETE FROM support_message_attachments WHERE message_id IN (SELECT id FROM support_messages WHERE ticket_id = ?)",
      ).run(tid);
      db.prepare("DELETE FROM support_messages WHERE ticket_id = ?").run(tid);
      db.prepare("DELETE FROM support_tickets WHERE id = ?").run(tid);
    }
    db.prepare("DELETE FROM saved_passwords WHERE owner_type = 'user' AND owner_id = ?").run(id);
    db.prepare("DELETE FROM user_state WHERE user_id = ?").run(id);
    db.prepare("UPDATE session_state SET user_id = NULL WHERE user_id = ?").run(id);
    db.prepare("UPDATE website_logs SET user_id = NULL WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM bans WHERE target_user_id = ? OR issued_by_user_id = ?").run(id, id);
    db.prepare("DELETE FROM alerts WHERE created_by_user_id = ?").run(id);
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
  });
  deleteTx();

  res.json({ ok: true });
});

app.use("/scram", express.static(scramjetStaticDir));
app.use("/libcurl", express.static(libcurlStaticDir));
app.use("/baremux", express.static(baremuxStaticDir));

if (fs.existsSync(path.join(frontendPublicDir, "sw.js"))) {
  app.get("/sw.js", (_req, res) => {
    res.sendFile(path.join(frontendPublicDir, "sw.js"));
  });
}

if (fs.existsSync(frontendDistDir)) {
  app.use(express.static(frontendDistDir));
  app.use((_req, res) => {
    res.sendFile(path.join(frontendDistDir, "index.html"));
  });
} else {
  app.use((_req, res) => {
    res.type("text/plain").send("Nova backend is running. Build the frontend or run Vite dev server on port 8080.");
  });
}

function isWispUpgradePath(rawUrl: string | undefined): boolean {
  if (!rawUrl) return false;
  const pathOnly = rawUrl.split("?")[0]?.split("#")[0] ?? "";
  const configured = env.WISP_PATH.startsWith("/") ? env.WISP_PATH : `/${env.WISP_PATH}`;
  const base = configured.replace(/\/+$/, "") || "/";
  return pathOnly === base || pathOnly.startsWith(`${base}/`);
}

server.on("upgrade", (req, socket, head) => {
  if (isWispUpgradePath(req.url)) {
    wisp.routeRequest(req, socket, head);
    return;
  }

  socket.end();
});

server.listen(env.PORT, "0.0.0.0", () => {
  console.log(`Nova backend listening on http://0.0.0.0:${env.PORT}`);
  void refreshAllProxyLatencies();
  setInterval(() => void refreshAllProxyLatencies(), PROXY_LATENCY_TTL_MS);
  setInterval(() => {
    const now = Date.now();
    const expired = db
      .prepare(`SELECT id FROM screen_share_requests WHERE expires_at < ?`)
      .all(now) as Array<{ id: string }>;
    for (const row of expired) {
      screenShareFrames.delete(row.id);
      screenShareLastFrameAt.delete(row.id);
    }
    db.prepare(`DELETE FROM screen_share_requests WHERE expires_at < ?`).run(now);
  }, 60_000);
});

function createSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      totp_secret_encrypted TEXT,
      totp_enabled INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session_state (
      session_id TEXT PRIMARY KEY,
      user_id TEXT,
      settings_json TEXT NOT NULL,
      tabs_json TEXT NOT NULL,
      shortcuts_json TEXT NOT NULL,
      last_seen_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_state (
      user_id TEXT PRIMARY KEY,
      settings_json TEXT NOT NULL,
      tabs_json TEXT NOT NULL,
      shortcuts_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS saved_passwords (
      id TEXT PRIMARY KEY,
      owner_type TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      origin TEXT NOT NULL,
      site_username TEXT NOT NULL,
      password_encrypted TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(owner_type, owner_id, origin, site_username)
    );

    CREATE TABLE IF NOT EXISTS website_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      session_id TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT,
      hostname TEXT NOT NULL,
      category TEXT NOT NULL,
      flagged INTEGER NOT NULL DEFAULT 0,
      blocked INTEGER NOT NULL DEFAULT 0,
      filter_list_name TEXT,
      filter_mode TEXT,
      notify_admin INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS blocked_sites (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      pattern TEXT NOT NULL,
      reason TEXT NOT NULL,
      list_name TEXT,
      mode TEXT NOT NULL DEFAULT 'block',
      notify_on_match INTEGER NOT NULL DEFAULT 1,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      created_by_user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bans (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL,
      target_user_id TEXT,
      target_session_id TEXT,
      reason TEXT NOT NULL,
      issued_by_user_id TEXT NOT NULL,
      expires_at INTEGER,
      revoked_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      target_user_id TEXT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      color TEXT NOT NULL,
      created_by_user_id TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      deliver_until_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS alert_deliveries (
      id TEXT PRIMARY KEY,
      alert_id TEXT NOT NULL,
      owner_key TEXT NOT NULL,
      delivered_at INTEGER NOT NULL,
      UNIQUE(alert_id, owner_key)
    );

    CREATE TABLE IF NOT EXISTS alert_reads (
      id TEXT PRIMARY KEY,
      alert_id TEXT NOT NULL,
      owner_key TEXT NOT NULL,
      read_at INTEGER,
      UNIQUE(alert_id, owner_key)
    );

    CREATE TABLE IF NOT EXISTS admin_notification_reads (
      id TEXT PRIMARY KEY,
      notification_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      read_at INTEGER NOT NULL,
      UNIQUE(notification_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      last_read_by_owner_at INTEGER,
      last_read_by_admin_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS support_messages (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      author_user_id TEXT,
      author_role TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS support_message_attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      stored_name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS screen_share_requests (
      id TEXT PRIMARY KEY,
      target_session_id TEXT NOT NULL,
      admin_user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      ended_at INTEGER,
      declined_at INTEGER
    );
  `);

  const alertColumns = db.prepare("PRAGMA table_info(alerts)").all() as Array<{ name: string }>;
  if (!alertColumns.some((column) => column.name === "deliver_until_at")) {
    db.exec("ALTER TABLE alerts ADD COLUMN deliver_until_at INTEGER");
  }

  const sessionColumns = db.prepare("PRAGMA table_info(session_state)").all() as Array<{ name: string }>;
  if (!sessionColumns.some((column) => column.name === "proxy_location_id")) {
    db.exec("ALTER TABLE session_state ADD COLUMN proxy_location_id TEXT");
  }
  if (!sessionColumns.some((column) => column.name === "assigned_proxy_url")) {
    db.exec("ALTER TABLE session_state ADD COLUMN assigned_proxy_url TEXT");
  }

  const ticketColumns = db.prepare("PRAGMA table_info(support_tickets)").all() as Array<{ name: string }>;
  if (!ticketColumns.some((column) => column.name === "kind")) {
    db.exec("ALTER TABLE support_tickets ADD COLUMN kind TEXT NOT NULL DEFAULT 'support'");
  }
  if (!ticketColumns.some((column) => column.name === "related_url")) {
    db.exec("ALTER TABLE support_tickets ADD COLUMN related_url TEXT");
  }

  const blockedSiteColumns = db.prepare("PRAGMA table_info(blocked_sites)").all() as Array<{ name: string }>;
  if (!blockedSiteColumns.some((column) => column.name === "list_name")) {
    db.exec("ALTER TABLE blocked_sites ADD COLUMN list_name TEXT");
  }
  if (!blockedSiteColumns.some((column) => column.name === "mode")) {
    db.exec("ALTER TABLE blocked_sites ADD COLUMN mode TEXT NOT NULL DEFAULT 'block'");
  }
  if (!blockedSiteColumns.some((column) => column.name === "notify_on_match")) {
    db.exec("ALTER TABLE blocked_sites ADD COLUMN notify_on_match INTEGER NOT NULL DEFAULT 1");
  }
  if (!blockedSiteColumns.some((column) => column.name === "is_enabled")) {
    db.exec("ALTER TABLE blocked_sites ADD COLUMN is_enabled INTEGER NOT NULL DEFAULT 1");
  }

  const logColumns = db.prepare("PRAGMA table_info(website_logs)").all() as Array<{ name: string }>;
  if (!logColumns.some((column) => column.name === "filter_list_name")) {
    db.exec("ALTER TABLE website_logs ADD COLUMN filter_list_name TEXT");
  }
  if (!logColumns.some((column) => column.name === "filter_mode")) {
    db.exec("ALTER TABLE website_logs ADD COLUMN filter_mode TEXT");
  }
  if (!logColumns.some((column) => column.name === "notify_admin")) {
    db.exec("ALTER TABLE website_logs ADD COLUMN notify_admin INTEGER NOT NULL DEFAULT 0");
  }
}

function seedMasterAdmin() {
  const username = normalizeUsername(env.MASTER_ADMIN_USERNAME);
  const existing = getUserByUsername(username);
  const now = Date.now();

  if (existing) {
    db.prepare(`
      UPDATE users
      SET role = 'master_admin',
          totp_enabled = 1,
          totp_secret_encrypted = COALESCE(totp_secret_encrypted, ?),
          updated_at = ?
      WHERE id = ?
    `).run(encryptValue(env.MASTER_ADMIN_TOTP_SECRET), now, existing.id);
    return;
  }

  const passwordHash = bcrypt.hashSync(env.MASTER_ADMIN_PASSWORD, 12);
  db.prepare(`
    INSERT INTO users (
      id, username, password_hash, role, totp_secret_encrypted, totp_enabled, created_at, updated_at
    ) VALUES (?, ?, ?, 'master_admin', ?, 1, ?, ?)
  `).run(
    nanoid(),
    username,
    passwordHash,
    encryptValue(env.MASTER_ADMIN_TOTP_SECRET),
    now,
    now,
  );
}

function makeTheme(id: string, name: string, accent: string, colors: [string, string, string], pattern: string): ThemePreset {
  const g = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${colors[0]}"/><stop offset="0.5" stop-color="${colors[1]}"/><stop offset="1" stop-color="${colors[2]}"/></linearGradient></defs><rect width="1600" height="900" fill="url(#g)"/>`;
  const chromeTop = `<g fill="white" fill-opacity="0.1"><rect x="72" y="64" width="1456" height="52" rx="16"/><rect x="92" y="80" width="110" height="24" rx="6" fill-opacity="0.22"/><rect x="212" y="80" width="96" height="24" rx="6" fill-opacity="0.14"/><rect x="318" y="80" width="88" height="24" rx="6" fill-opacity="0.14"/><rect x="92" y="128" width="1416" height="36" rx="10" fill-opacity="0.08"/><rect x="112" y="136" width="980" height="22" rx="5" fill-opacity="0.12"/></g>`;
  const svg =
    pattern === "browser-tabs"
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">${g}${chromeTop}<rect x="120" y="220" width="1360" height="620" rx="18" fill="white" fill-opacity="0.04" stroke="white" stroke-opacity="0.08"/></svg>`
      : pattern === "browser-stack"
        ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">${g}${chromeTop}<rect x="160" y="240" width="1280" height="560" rx="16" fill="white" fill-opacity="0.03"/><rect x="200" y="280" width="1200" height="480" rx="12" fill="white" fill-opacity="0.04"/></svg>`
        : pattern === "browser-grid"
          ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">${g}${chromeTop}<g stroke="white" stroke-opacity="0.12" fill="none"><rect x="140" y="240" width="620" height="280" rx="12"/><rect x="800" y="240" width="620" height="280" rx="12"/><rect x="140" y="540" width="620" height="280" rx="12"/><rect x="800" y="540" width="620" height="280" rx="12"/></g></svg>`
          : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">${g}${chromeTop}<path d="M800 320 L920 460 L800 560 L680 460 Z" fill="white" fill-opacity="0.12"/><circle cx="800" cy="460" r="120" fill="none" stroke="white" stroke-opacity="0.15" stroke-width="8"/></svg>`;

  return {
    id,
    name,
    accent,
    preview: colors[2],
    backgroundImage: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
  };
}

function getOwnerState(userId: string | null, sessionId: string) {
  if (userId) {
    const row = db.prepare("SELECT * FROM user_state WHERE user_id = ?").get(userId) as Record<string, string> | undefined;
    if (!row) {
      const fresh = {
        settings: defaultSettings,
        tabs: defaultTabs,
        shortcuts: {},
      };
      db.prepare(`
        INSERT INTO user_state (
          user_id, settings_json, tabs_json, shortcuts_json, updated_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        JSON.stringify(fresh.settings),
        JSON.stringify(fresh.tabs),
        JSON.stringify(fresh.shortcuts),
        Date.now(),
        Date.now(),
      );
      return fresh;
    }

    return {
      settings: parseJson(row.settings_json, settingsSchema, defaultSettings),
      tabs: parseJson(row.tabs_json, tabsSchema, defaultTabs),
      shortcuts: parseJson(row.shortcuts_json, shortcutsSchema, {}),
    };
  }

  const row = db.prepare("SELECT * FROM session_state WHERE session_id = ?").get(sessionId) as Record<string, string> | undefined;

  if (!row) {
    ensureSessionState(sessionId, null);
    return {
      settings: defaultSettings,
      tabs: defaultTabs,
      shortcuts: {},
    };
  }

  return {
    settings: parseJson(row.settings_json, settingsSchema, defaultSettings),
    tabs: parseJson(row.tabs_json, tabsSchema, defaultTabs),
    shortcuts: parseJson(row.shortcuts_json, shortcutsSchema, {}),
  };
}

function persistOwnerState(ownerType: "user" | "session", ownerId: string, partial: Partial<{
  settings: BrowserSettings;
  tabs: BrowserTab[];
  shortcuts: ShortcutMap;
}>) {
  const current =
    ownerType === "user"
      ? getOwnerState(ownerId, ownerId)
      : getOwnerState(null, ownerId);

  const nextState = {
    settings: partial.settings ?? current.settings,
    tabs: partial.tabs ?? current.tabs,
    shortcuts: partial.shortcuts ?? current.shortcuts,
  };

  if (ownerType === "user") {
    db.prepare(`
      INSERT INTO user_state (
        user_id, settings_json, tabs_json, shortcuts_json, updated_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        settings_json = excluded.settings_json,
        tabs_json = excluded.tabs_json,
        shortcuts_json = excluded.shortcuts_json,
        updated_at = excluded.updated_at
    `).run(
      ownerId,
      JSON.stringify(nextState.settings),
      JSON.stringify(nextState.tabs),
      JSON.stringify(nextState.shortcuts),
      Date.now(),
      Date.now(),
    );
    return;
  }

  db.prepare(`
    INSERT INTO session_state (
      session_id, user_id, settings_json, tabs_json, shortcuts_json, last_seen_at, created_at
    ) VALUES (?, NULL, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      settings_json = excluded.settings_json,
      tabs_json = excluded.tabs_json,
      shortcuts_json = excluded.shortcuts_json,
      last_seen_at = excluded.last_seen_at
  `).run(
    ownerId,
    JSON.stringify(nextState.settings),
    JSON.stringify(nextState.tabs),
    JSON.stringify(nextState.shortcuts),
    Date.now(),
    Date.now(),
  );
}

function getOwnerKey(userId: string | null, sessionId: string) {
  if (userId) {
    return { type: "user" as const, id: userId };
  }

  return { type: "session" as const, id: sessionId };
}

function ensureSessionState(sessionId: string, userId: string | null) {
  db.prepare(`
    INSERT INTO session_state (
      session_id, user_id, settings_json, tabs_json, shortcuts_json, last_seen_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      user_id = excluded.user_id,
      last_seen_at = excluded.last_seen_at
  `).run(
    sessionId,
    userId,
    JSON.stringify(defaultSettings),
    JSON.stringify(defaultTabs),
    JSON.stringify({}),
    Date.now(),
    Date.now(),
  );
}

function bindSessionToUser(sessionId: string, userId: string) {
  db.prepare("UPDATE session_state SET user_id = ?, last_seen_at = ? WHERE session_id = ?").run(
    userId,
    Date.now(),
    sessionId,
  );
}

function getUserByUsername(username: string) {
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username) as
    | (Record<string, unknown> & {
        id: string;
        username: string;
        password_hash: string;
        role: Role;
        totp_secret_encrypted: string | null;
        totp_enabled: number;
      })
    | undefined;
}

function getUserById(id: string) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as
    | (Record<string, unknown> & {
        id: string;
        username: string;
        password_hash: string;
        role: Role;
        totp_secret_encrypted: string | null;
        totp_enabled: number;
      })
    | undefined;
}

function sanitizeUser(user: ReturnType<typeof getUserById>) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    isAdmin: user.role === "admin" || user.role === "master_admin",
    totpEnabled: Boolean(user.totp_enabled),
  };
}

function getActiveBan(sessionId: string, userId: string | null) {
  const row = db.prepare(`
    SELECT bans.*, issuer.username AS issued_by_username
    FROM bans
    LEFT JOIN users issuer ON issuer.id = bans.issued_by_user_id
    WHERE revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > ?)
      AND (
        (target_type = 'session' AND target_session_id = ?)
        OR
        (? IS NOT NULL AND target_type = 'user' AND target_user_id = ?)
      )
    ORDER BY CASE WHEN target_type = 'user' THEN 0 ELSE 1 END, created_at DESC
    LIMIT 1
  `).get(Date.now(), sessionId, userId, userId) as Record<string, unknown> | undefined;

  return row;
}

function getExistingActiveBan(target: {
  targetType: "user" | "session";
  targetUserId?: string | null;
  targetSessionId?: string | null;
}) {
  return db.prepare(`
    SELECT id
    FROM bans
    WHERE target_type = ?
      AND COALESCE(target_user_id, '') = COALESCE(?, '')
      AND COALESCE(target_session_id, '') = COALESCE(?, '')
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > ?)
    ORDER BY created_at DESC
    LIMIT 1
  `).get(
    target.targetType,
    target.targetUserId ?? null,
    target.targetSessionId ?? null,
    Date.now(),
  ) as { id: string } | undefined;
}

function applySessionBanForUser(
  userId: string,
  sessionId: string,
  reason: string,
  expiresAt: unknown,
  issuedByUserId: unknown,
) {
  const existing = getExistingActiveBan({
    targetType: "session",
    targetUserId: userId,
    targetSessionId: sessionId,
  });
  if (existing) {
    return;
  }
  db.prepare(`
    INSERT INTO bans (
      id, target_type, target_user_id, target_session_id, reason, issued_by_user_id, expires_at, created_at
    ) VALUES (?, 'session', ?, ?, ?, ?, ?, ?)
  `).run(nanoid(), userId, sessionId, reason, issuedByUserId, expiresAt ?? null, Date.now());
}

function formatBan(ban: Record<string, unknown>) {
  return {
    reason: String(ban.reason),
    expiresAt: ban.expires_at ? Number(ban.expires_at) : null,
    issuedByUsername: ban.issued_by_username ? String(ban.issued_by_username) : "Unknown admin",
  };
}

function getAlertOwnerKey(userId: string | null, sessionId: string) {
  return userId ? `user:${userId}` : `session:${sessionId}`;
}

function getActiveAlerts(userId: string | null, sessionId: string) {
  const ownerKey = getAlertOwnerKey(userId, sessionId);
  const now = Date.now();
  const sessionStartedAt = getSessionCreatedAt(sessionId);
  const alerts = db.prepare(`
    SELECT a.*, issuer.username AS created_by_username
    FROM alerts a
    LEFT JOIN users issuer ON issuer.id = a.created_by_user_id
    WHERE a.active = 1
      AND (a.target_user_id IS NULL OR a.target_user_id = ?)
      AND (a.deliver_until_at IS NULL OR a.deliver_until_at >= ?)
      AND (a.target_user_id IS NOT NULL OR a.created_at >= ?)
      AND NOT EXISTS (
        SELECT 1
        FROM alert_deliveries delivery
        WHERE delivery.alert_id = a.id AND delivery.owner_key = ?
      )
    ORDER BY a.created_at DESC
  `).all(userId, now, sessionStartedAt, ownerKey) as Array<{ id: string } & Record<string, unknown>>;

  if (alerts.length > 0) {
    const insertDelivery = db.prepare(`
      INSERT OR IGNORE INTO alert_deliveries (id, alert_id, owner_key, delivered_at)
      VALUES (?, ?, ?, ?)
    `);
    const insertMany = db.transaction((rows: Array<{ id: string }>) => {
      for (const alert of rows) {
        insertDelivery.run(nanoid(), alert.id, ownerKey, now);
      }
    });
    insertMany(alerts);
  }

  return alerts;
}

function getSessionCreatedAt(sessionId: string) {
  const row = db.prepare("SELECT created_at FROM session_state WHERE session_id = ?").get(sessionId) as
    | { created_at: number }
    | undefined;
  return row?.created_at ?? Date.now();
}

function getInboxNotifications(userId: string | null, sessionId: string) {
  const ownerKey = getAlertOwnerKey(userId, sessionId);
  const now = Date.now();
  const sessionCreatedAt = getSessionCreatedAt(sessionId);

  return db.prepare(`
    SELECT
      a.*,
      issuer.username AS created_by_username,
      CASE WHEN reads.read_at IS NULL THEN 0 ELSE 1 END AS is_read
    FROM alerts a
    LEFT JOIN users issuer ON issuer.id = a.created_by_user_id
    LEFT JOIN alert_reads reads ON reads.alert_id = a.id AND reads.owner_key = ?
    WHERE a.active = 1
      AND (
        a.target_user_id = ?
        OR (
          a.target_user_id IS NULL
          AND (a.deliver_until_at IS NULL OR a.deliver_until_at >= ?)
          AND a.created_at >= ?
        )
      )
    ORDER BY
      CASE WHEN reads.read_at IS NULL THEN 0 ELSE 1 END,
      a.created_at DESC
  `).all(ownerKey, userId, now, sessionCreatedAt);
}

function hydrateTicketMessages(
  messages: Array<Record<string, unknown> & { id: string; ticket_id: string }>,
) {
  if (messages.length === 0) return messages;
  const rows = db
    .prepare(
      `
    SELECT id, message_id, original_name, mime_type, size, created_at
    FROM support_message_attachments
    WHERE message_id IN (${messages.map(() => "?").join(",")})
  `,
    )
    .all(...messages.map((m) => m.id)) as Array<{
    id: string;
    message_id: string;
    original_name: string;
    mime_type: string;
    size: number;
    created_at: number;
  }>;
  return messages.map((m) => ({
    ...m,
    attachments: rows
      .filter((r) => r.message_id === m.id)
      .map((r) => ({
        id: r.id,
        url: `/api/messages/attachments/${r.id}`,
        original_name: r.original_name,
        mime_type: r.mime_type,
        size: r.size,
        created_at: r.created_at,
      })),
  }));
}

function getSupportTicketsForUser(userId: string) {
  const tickets = db.prepare(`
    SELECT
      t.*,
      u.username AS owner_username,
      CASE
        WHEN t.updated_at > COALESCE(t.last_read_by_owner_at, 0) THEN 1
        ELSE 0
      END AS unread
    FROM support_tickets t
    LEFT JOIN users u ON u.id = t.owner_user_id
    WHERE t.owner_user_id = ?
    ORDER BY
      CASE WHEN t.status = 'open' THEN 0 ELSE 1 END,
      t.updated_at DESC
  `).all(userId) as Array<Record<string, unknown> & { id: string }>;

  if (tickets.length === 0) return [];

  const messages = db.prepare(`
    SELECT
      m.*,
      u.username AS author_username
    FROM support_messages m
    LEFT JOIN users u ON u.id = m.author_user_id
    WHERE m.ticket_id IN (${tickets.map(() => "?").join(",")})
    ORDER BY m.created_at ASC
  `).all(...tickets.map((ticket) => ticket.id)) as Array<Record<string, unknown> & { ticket_id: string; id: string }>;

  const withAttachments = hydrateTicketMessages(messages);

  return tickets.map((ticket) => ({
    ...ticket,
    messages: withAttachments.filter((message) => message.ticket_id === ticket.id),
  }));
}

function getSupportTicketsForAdmin() {
  const tickets = db.prepare(`
    SELECT
      t.*,
      u.username AS owner_username,
      CASE
        WHEN t.updated_at > COALESCE(t.last_read_by_admin_at, 0) THEN 1
        ELSE 0
      END AS unread_for_admin
    FROM support_tickets t
    LEFT JOIN users u ON u.id = t.owner_user_id
    ORDER BY
      CASE WHEN t.status = 'open' THEN 0 ELSE 1 END,
      t.updated_at DESC
  `).all() as Array<Record<string, unknown> & { id: string }>;

  if (tickets.length === 0) return [];

  const messages = db.prepare(`
    SELECT
      m.*,
      u.username AS author_username
    FROM support_messages m
    LEFT JOIN users u ON u.id = m.author_user_id
    WHERE m.ticket_id IN (${tickets.map(() => "?").join(",")})
    ORDER BY m.created_at ASC
  `).all(...tickets.map((ticket) => ticket.id)) as Array<Record<string, unknown> & { ticket_id: string; id: string }>;

  const withAttachments = hydrateTicketMessages(messages);

  return tickets.map((ticket) => ({
    ...ticket,
    unread: Boolean(ticket.unread_for_admin),
    messages: withAttachments.filter((message) => message.ticket_id === ticket.id),
  }));
}

function getAdminNotifications(userId: string) {
  const tickets = getSupportTicketsForAdmin() as unknown as Array<{
    id: string;
    owner_username: string;
    subject: string;
    updated_at: number;
    unread_for_admin: boolean;
    messages: Array<{
      id: string;
      ticket_id: string;
      author_role: "user" | "admin" | "master_admin";
    }>;
  }>;
  const recentLogs = db.prepare(`
    SELECT wl.*, u.username
    FROM website_logs wl
    LEFT JOIN users u ON u.id = wl.user_id
    WHERE (wl.blocked = 1 OR wl.flagged = 1)
      AND COALESCE(wl.notify_admin, 0) = 1
    ORDER BY wl.created_at DESC
    LIMIT 60
  `).all() as Array<Record<string, unknown> & {
    id: string;
    created_at: number;
    blocked: number;
    session_id: string;
    hostname: string;
    username?: string | null;
  }>;

  const ticketNotifications = tickets
    .filter((ticket) => ticket.unread_for_admin)
    .map((ticket) => {
      const latestMessage = Array.isArray(ticket.messages) && ticket.messages.length > 0
        ? ticket.messages[ticket.messages.length - 1]
        : null;
      const authoredByUser = latestMessage?.author_role === "user";
      return {
        id: `ticket:${ticket.id}:${ticket.updated_at}`,
        kind: authoredByUser ? (ticket.messages.length > 1 ? "ticket-replied" : "ticket-opened") : "ticket-opened",
        title: authoredByUser
          ? ticket.messages.length > 1
            ? "Ticket reply waiting"
            : "New ticket opened"
          : "Unread ticket",
        message: `${ticket.owner_username}: ${ticket.subject}`,
        created_at: Number(ticket.updated_at),
        ticket_id: String(ticket.id),
        username: String(ticket.owner_username),
      };
    });

  const logNotifications = recentLogs.map((entry) => ({
    id: `log:${entry.id}`,
    kind: entry.blocked ? "blocked-site" : "flagged-site",
    title: entry.blocked ? "Blocked site visited" : "Flagged site visited",
    message: `${entry.username ?? "Guest"} visited ${entry.hostname}`,
    created_at: Number(entry.created_at),
    log_id: String(entry.id),
    session_id: String(entry.session_id),
    username: entry.username ? String(entry.username) : null,
  }));

  const notifications = [...ticketNotifications, ...logNotifications]
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, 80);

  const readRows = notifications.length > 0
    ? db.prepare(`
        SELECT notification_id
        FROM admin_notification_reads
        WHERE user_id = ?
          AND notification_id IN (${notifications.map(() => "?").join(", ")})
      `).all(userId, ...notifications.map((notification) => notification.id)) as Array<{ notification_id: string }>
    : [];
  const readIds = new Set(readRows.map((row) => row.notification_id));

  return notifications.map((notification) => ({
    ...notification,
    unread: !readIds.has(notification.id),
  }));
}

function parseAnalyticsTimeframe(value: unknown): AnalyticsTimeframe {
  return value === "7d" || value === "30d" ? value : "24h";
}

function getActivitySeries(now: number, timeframe: AnalyticsTimeframe) {
  const windowMs = ADMIN_TIMEFRAME_WINDOWS[timeframe];
  const since = now - windowMs;
  const bucketCount = timeframe === "24h" ? 8 : timeframe === "7d" ? 7 : 10;
  const bucketSize = Math.ceil(windowMs / bucketCount);
  const start = now - bucketSize * bucketCount;
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const bucketStart = start + index * bucketSize;
    const date = new Date(bucketStart);
    const label =
      timeframe === "24h"
        ? date.toLocaleTimeString([], { hour: "numeric" })
        : timeframe === "7d"
          ? date.toLocaleDateString([], { weekday: "short" })
          : date.toLocaleDateString([], { month: "short", day: "numeric" });
    return {
      label,
      logs: 0,
      flaggedLogs: 0,
      tickets: 0,
      alerts: 0,
    };
  });

  const bucketIndexFor = (timestamp: number) => {
    const index = Math.floor((timestamp - start) / bucketSize);
    return Math.max(0, Math.min(bucketCount - 1, index));
  };

  const logRows = db.prepare(`
    SELECT created_at, flagged
    FROM website_logs
    WHERE created_at >= ?
  `).all(since) as Array<{ created_at: number; flagged: number }>;
  for (const row of logRows) {
    const bucket = buckets[bucketIndexFor(row.created_at)];
    bucket.logs += 1;
    if (row.flagged) {
      bucket.flaggedLogs += 1;
    }
  }

  const ticketRows = db.prepare(`
    SELECT created_at
    FROM support_tickets
    WHERE created_at >= ?
  `).all(since) as Array<{ created_at: number }>;
  for (const row of ticketRows) {
    buckets[bucketIndexFor(row.created_at)].tickets += 1;
  }

  const alertRows = db.prepare(`
    SELECT created_at
    FROM alerts
    WHERE created_at >= ?
  `).all(since) as Array<{ created_at: number }>;
  for (const row of alertRows) {
    buckets[bucketIndexFor(row.created_at)].alerts += 1;
  }

  return { since, buckets };
}

function getLatestSessionIdForUser(userId: string) {
  const row = db.prepare(`
    SELECT session_id
    FROM session_state
    WHERE user_id = ?
    ORDER BY last_seen_at DESC
    LIMIT 1
  `).get(userId) as { session_id: string } | undefined;

  return row?.session_id ?? null;
}

function normalizeBlockedSitePattern(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^\*\./, "")
    .replace(/\/+$/, "");
}

function matchesBlockedSitePattern(url: string, rawPattern: string) {
  const pattern = normalizeBlockedSitePattern(rawPattern);
  if (!pattern) return false;

  const parsedUrl = new URL(url);
  const host = parsedUrl.hostname.toLowerCase().replace(/^www\./, "");
  const fullPath = `${host}${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`.replace(/\/+$/, "");
  const [patternHostRaw, ...patternPathParts] = pattern.split("/");
  const patternHost = patternHostRaw.replace(/^www\./, "");
  const patternPath = patternPathParts.join("/");

  if (!patternPath) {
    return (
      host === patternHost ||
      host.endsWith(`.${patternHost}`) ||
      fullPath === patternHost ||
      fullPath.startsWith(`${patternHost}/`)
    );
  }

  return (
    (host === patternHost || host.endsWith(`.${patternHost}`)) &&
    (
      fullPath === pattern ||
      fullPath.startsWith(`${pattern}/`) ||
      fullPath.startsWith(`${pattern}?`) ||
      fullPath.startsWith(`${pattern}#`)
    )
  );
}

function upsertBlockedSite(input: {
  userId: string | null;
  pattern: string;
  reason: string;
  listName: string | null;
  mode: "flag" | "block";
  notifyOnMatch: boolean;
  isEnabled: boolean;
  createdByUserId: string;
}) {
  const existing = db.prepare(`
    SELECT id
    FROM blocked_sites
    WHERE user_id IS ?
      AND pattern = ?
      AND COALESCE(list_name, '') = COALESCE(?, '')
  `).get(input.userId, input.pattern, input.listName) as { id: string } | undefined;

  if (existing) {
    db.prepare(`
      UPDATE blocked_sites
      SET reason = ?,
          list_name = ?,
          mode = ?,
          notify_on_match = ?,
          is_enabled = ?
      WHERE id = ?
    `).run(
      input.reason,
      input.listName,
      input.mode,
      input.notifyOnMatch ? 1 : 0,
      input.isEnabled ? 1 : 0,
      existing.id,
    );
    return existing.id;
  }

  const id = nanoid();
  db.prepare(`
    INSERT INTO blocked_sites (
      id, user_id, pattern, reason, list_name, mode, notify_on_match, is_enabled, created_by_user_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.userId,
    input.pattern,
    input.reason,
    input.listName,
    input.mode,
    input.notifyOnMatch ? 1 : 0,
    input.isEnabled ? 1 : 0,
    input.createdByUserId,
    Date.now(),
  );
  return id;
}

function getBlockForUrl(url: string, userId: string | null) {
  const rows = db.prepare(`
    SELECT *
    FROM blocked_sites
    WHERE (user_id IS NULL OR user_id = ?)
      AND is_enabled = 1
    ORDER BY CASE WHEN mode = 'block' THEN 0 ELSE 1 END, created_at DESC
  `).all(userId) as Array<{
    pattern: string;
    reason: string;
    list_name?: string | null;
    mode?: string | null;
    notify_on_match?: number;
  }>;

  return rows.find((row) => {
    if (!row.pattern) return false;
    return matchesBlockedSitePattern(url, row.pattern);
  });
}

function categorizeUrl(url: string) {
  return "default";
}

function normalizeUrl(value: string, searchEngine: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith("nova://")) return trimmed;

  try {
    const direct = new URL(trimmed);
    return direct.toString();
  } catch {
    if (trimmed.includes(".")) {
      return `https://${trimmed}`;
    }

    const query = encodeURIComponent(trimmed);
    const engine = searchEngine.toLowerCase();

    if (engine.includes("duck")) return `https://duckduckgo.com/?q=${query}`;
    if (engine.includes("bing")) return `https://www.bing.com/search?q=${query}`;
    if (engine.includes("yahoo")) return `https://search.yahoo.com/search?p=${query}`;
    return `https://www.google.com/search?q=${query}`;
  }
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function assertValidUsername(username: string) {
  if (/^.+@.+\..+$/.test(username)) {
    throw new Error("Usernames cannot be email addresses.");
  }

  if (!/^[a-z0-9_.-]+$/i.test(username)) {
    throw new Error("Usernames may only contain letters, numbers, dots, underscores, and dashes.");
  }
}

function verifyTotpToken(secretEncrypted: string, token: string) {
  const secret = decryptValue(secretEncrypted);
  const totp = new OTPAuth.TOTP({
    issuer: "Nova Browser",
    label: "Nova Browser",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });

  return totp.validate({ token, window: 1 }) !== null;
}

function encryptValue(value: string) {
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash("sha256").update(env.SESSION_SECRET).digest();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function decryptValue(value: string) {
  const raw = Buffer.from(value, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const key = crypto.createHash("sha256").update(env.SESSION_SECRET).digest();
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

function getPublicHostHeader(req: Request) {
  const value = req.get("x-public-host")?.trim();
  if (!value) return null;
  return /^[a-z0-9.-]+(?::\d+)?$/i.test(value) ? value : null;
}

function getPublicProtoHeader(req: Request) {
  const value = req.get("x-public-proto")?.trim().toLowerCase();
  return value === "http" || value === "https" ? value : null;
}

function getWispUrl(req: Request) {
  const protocol = (getPublicProtoHeader(req) ?? req.protocol) === "https" ? "wss" : "ws";
  const host = getPublicHostHeader(req) ?? req.get("host");
  return `${protocol}://${host}${env.WISP_PATH}`;
}

function parseJson<T>(value: string, schema: z.ZodType<T>, fallback: T) {
  try {
    return schema.parse(JSON.parse(value));
  } catch {
    return fallback;
  }
}

function asyncRoute(handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    res.status(401).json({ error: "Sign in required." });
    return;
  }
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = req.session.userId ? getUserById(req.session.userId) : null;
  if (!user || (user.role !== "admin" && user.role !== "master_admin")) {
    res.status(403).json({ error: "Admin access required." });
    return;
  }
  next();
}

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  let message = error instanceof Error ? error.message : "Unexpected server error.";
  if (error instanceof z.ZodError) {
    const firstIssue = error.issues[0];
    if (firstIssue) {
      const field = firstIssue.path.length > 0 ? String(firstIssue.path[firstIssue.path.length - 1]) : "field";
      if (firstIssue.code === "too_small" && "minimum" in firstIssue) {
        message = `${field[0]?.toUpperCase() ?? ""}${field.slice(1)} must be at least ${firstIssue.minimum} characters.`;
      } else if (firstIssue.code === "too_big" && "maximum" in firstIssue) {
        message = `${field[0]?.toUpperCase() ?? ""}${field.slice(1)} must be at most ${firstIssue.maximum} characters.`;
      } else {
        message = `${field[0]?.toUpperCase() ?? ""}${field.slice(1)}: ${firstIssue.message}`;
      }
    } else {
      message = "Invalid request.";
    }
  }
  res.status(400).json({ error: message });
});
