import React, { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

import type {
  BrowserExtras,
  BrowserSettings,
  BrowserTab,
  GameApp,
  SavedPasswordRecord,
  Shortcut,
} from "@/types/browser";

const SETTING_GROUPS = [
  {
    id: "visual",
    label: "Visual settings",
    fields: [
      { path: "theme.mode", label: "Theme mode" },
      { path: "theme.accentColor", label: "Accent color" },
      { path: "theme.density", label: "Density" },
      { path: "theme.tabOrientation", label: "Tab orientation" },
      { path: "theme.backgroundUrl", label: "Background" },
      { path: "theme.customFavicon", label: "Custom favicon" },
      { path: "theme.customTitle", label: "Custom title" },
      { path: "theme.faviconPreset", label: "Favicon preset" },
      { path: "theme.titlePreset", label: "Title preset" },
      { path: "theme.themePresetId", label: "Theme preset" },
    ],
  },
  {
    id: "search-privacy",
    label: "Search and privacy",
    fields: [
      { path: "defaultSearchEngine", label: "Default search engine" },
      { path: "searchSuggestions", label: "Search suggestions" },
      { path: "safeBrowsing", label: "Safe browsing" },
      { path: "doNotTrack", label: "Do not track" },
      { path: "pushNotifications", label: "Push notifications" },
      { path: "notificationSound", label: "Notification sound" },
    ],
  },
  {
    id: "behavior",
    label: "Behavior",
    fields: [
      { path: "tabBehavior", label: "Tab behavior" },
      { path: "restoreTabs", label: "Restore tabs" },
      { path: "showTips", label: "Nova tips" },
      { path: "askWhereToSave", label: "Ask where to save" },
      { path: "downloadLocation", label: "Download location" },
    ],
  },
  {
    id: "settings-utilities",
    label: "Settings and utilities",
    fields: [
      { path: "proxyLocation", label: "Exit location" },
      { path: "showExitLocationBadge", label: "Exit location badge" },
      { path: "extensions.adShield", label: "Ad Shield" },
      { path: "extensions.darkReader", label: "Dark Reader" },
    ],
  },
];

interface SyncPanelProps {
  localState: {
    settings: BrowserSettings;
    tabs: BrowserTab[];
    extras: BrowserExtras;
  };
  accountState: {
    settings: BrowserSettings;
    tabs: BrowserTab[];
    extras: BrowserExtras;
  };
  sessionPasswords: SavedPasswordRecord[];
  accountPasswords: SavedPasswordRecord[];
  onApply: (
    mergedState: {
      settings: BrowserSettings;
      tabs: BrowserTab[];
      extras: BrowserExtras;
    },
    importPasswordIds: string[],
  ) => Promise<void>;
}

function getByPath(target: unknown, path: string) {
  return path.split(".").reduce<unknown>((value, part) => {
    if (!value || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[part];
  }, target);
}

function setByPath<T extends object>(target: T, path: string, value: unknown) {
  const parts = path.split(".");
  let cursor: Record<string, unknown> = target as Record<string, unknown>;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    const next = cursor[key];
    if (!next || typeof next !== "object") {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
}

function formatValue(value: unknown) {
  if (typeof value === "boolean") return value ? "On" : "Off";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "Set";
}

function dedupeBy<T>(items: T[], keyFor: (item: T) => string) {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const item of items) {
    const key = keyFor(item);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

function formatHistoryTimestamp(timestamp: number) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(timestamp);
  } catch {
    return "";
  }
}

function ItemSelector({
  title,
  count,
  children,
  defaultOpen = false,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-border bg-background/40 p-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 text-left text-sm font-semibold"
      >
        <span>
          {title}
          <span className="ml-2 text-xs font-normal text-muted-foreground">{count} available</span>
        </span>
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card/70">
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
        </span>
      </button>
      {open ? <div className="mt-4 space-y-2">{children}</div> : null}
    </div>
  );
}

export const SyncPanel: React.FC<SyncPanelProps> = ({
  localState,
  accountState,
  sessionPasswords,
  accountPasswords,
  onApply,
}) => {
  const sortedLocalHistory = useMemo(
    () => [...localState.extras.history].sort((left, right) => right.timestamp - left.timestamp),
    [localState.extras.history],
  );
  const [tabsSource, setTabsSource] = useState<"local" | "account">("account");
  const [groupSources, setGroupSources] = useState<Record<string, "local" | "account">>(
    () => Object.fromEntries(SETTING_GROUPS.map((group) => [group.id, "account"])),
  );
  const [shortcutSources, setShortcutSources] = useState<Record<string, "local" | "account">>(
    () => Object.fromEntries(localState.settings.shortcuts.map((shortcut) => [shortcut.id, "account"])),
  );
  const [selectedBookmarkUrls, setSelectedBookmarkUrls] = useState<Record<string, boolean>>(
    () => Object.fromEntries(localState.extras.bookmarks.map((bookmark) => [bookmark.url, true])),
  );
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<Record<string, boolean>>(
    () => Object.fromEntries(localState.extras.history.map((entry) => [entry.id, true])),
  );
  const [selectedShortcutIds, setSelectedShortcutIds] = useState<Record<string, boolean>>(
    () => Object.fromEntries(localState.extras.shortcutTiles.map((entry) => [entry.id, true])),
  );
  const [selectedAppIds, setSelectedAppIds] = useState<Record<string, boolean>>(
    () => Object.fromEntries(localState.extras.customAppsGames.map((entry) => [entry.id, true])),
  );
  const [selectedPasswordIds, setSelectedPasswordIds] = useState<Record<string, boolean>>(
    () => Object.fromEntries(sessionPasswords.map((entry) => [entry.id, true])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accountPasswordKeys = useMemo(
    () => new Set(accountPasswords.map((entry) => `${entry.origin}|${entry.site_username}`)),
    [accountPasswords],
  );

  async function handleApply() {
    setBusy(true);
    setError(null);
    try {
      const mergedSettings = structuredClone(accountState.settings);
      for (const group of SETTING_GROUPS) {
        for (const field of group.fields) {
          const source = groupSources[group.id] ?? "account";
          setByPath(
            mergedSettings,
            field.path,
            getByPath(source === "local" ? localState.settings : accountState.settings, field.path),
          );
        }
      }

      const mergedShortcutSettings = dedupeBy(
        [
          ...localState.settings.shortcuts
            .filter((shortcut) => shortcutSources[shortcut.id] === "local")
            .map((shortcut) => ({ ...shortcut })),
          ...accountState.settings.shortcuts
            .filter((shortcut) => shortcutSources[shortcut.id] !== "local")
            .map((shortcut) => ({ ...shortcut })),
        ],
        (shortcut) => shortcut.id,
      );
      mergedSettings.shortcuts = mergedShortcutSettings;

      const mergedTabs =
        tabsSource === "local"
          ? structuredClone(localState.tabs)
          : structuredClone(accountState.tabs);

      const selectedLocalBookmarks = localState.extras.bookmarks.filter(
        (bookmark) => selectedBookmarkUrls[bookmark.url],
      );
      const mergedBookmarks = dedupeBy(
        [...selectedLocalBookmarks, ...accountState.extras.bookmarks],
        (bookmark) => bookmark.url,
      );

      const selectedLocalHistory = localState.extras.history.filter(
        (entry) => selectedHistoryIds[entry.id],
      );
      const mergedHistory = dedupeBy(
        [...selectedLocalHistory, ...accountState.extras.history],
        (entry) => `${entry.url}|${entry.timestamp}`,
      ).sort((left, right) => right.timestamp - left.timestamp);

      const selectedLocalShortcutTiles = localState.extras.shortcutTiles.filter(
        (entry) => selectedShortcutIds[entry.id],
      );
      const mergedShortcutTiles = dedupeBy(
        [...selectedLocalShortcutTiles, ...accountState.extras.shortcutTiles],
        (entry) => entry.url,
      ).slice(0, 10);

      const selectedLocalApps = localState.extras.customAppsGames.filter(
        (entry) => selectedAppIds[entry.id],
      );
      const mergedApps = dedupeBy(
        [...selectedLocalApps, ...accountState.extras.customAppsGames],
        (entry) => `${entry.category}|${entry.url}`,
      );

      await onApply(
        {
          settings: mergedSettings,
          tabs: mergedTabs,
          extras: {
            bookmarks: mergedBookmarks,
            history: mergedHistory,
            shortcutTiles: mergedShortcutTiles,
            customAppsGames: mergedApps,
            tutorialDismissed: accountState.extras.tutorialDismissed || localState.extras.tutorialDismissed,
          },
        },
        sessionPasswords
          .filter((entry) => selectedPasswordIds[entry.id])
          .map((entry) => entry.id),
      );
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to apply that sync selection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex max-h-[min(92vh,60rem)] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-2xl sm:p-6">
      <h3 className="text-xl font-semibold">Choose your post-sign-in setup</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Merge this device into your account by category, then drill into the specific items you want to keep.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Account data stays in place unless you switch a section to use this device. The item lists below are local
        items you can import into your account.
      </p>
      {error && (
        <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="mt-5 grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto overflow-x-hidden pb-2 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-4">
          <ItemSelector title="Tabs" count={localState.tabs.length}>
            <div className="grid gap-2 md:grid-cols-2">
              <button
                type="button"
                onClick={() => setTabsSource("local")}
                className={`rounded-xl border px-4 py-3 text-left ${tabsSource === "local" ? "border-primary bg-primary/10" : "border-border bg-card/40"}`}
              >
                <div className="text-sm font-medium">Keep this device tabs</div>
                <div className="mt-1 text-xs text-muted-foreground">{localState.tabs.length} tabs</div>
              </button>
              <button
                type="button"
                onClick={() => setTabsSource("account")}
                className={`rounded-xl border px-4 py-3 text-left ${tabsSource === "account" ? "border-primary bg-primary/10" : "border-border bg-card/40"}`}
              >
                <div className="text-sm font-medium">Use account tabs</div>
                <div className="mt-1 text-xs text-muted-foreground">{accountState.tabs.length} tabs</div>
              </button>
            </div>
          </ItemSelector>

          <ItemSelector title="Settings" count={SETTING_GROUPS.length}>
            {SETTING_GROUPS.map((group) => (
              <div key={group.id} className="rounded-xl border border-border bg-card/30 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm font-medium">{group.label}</span>
                  <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="whitespace-nowrap">Source</span>
                    <select
                      value={groupSources[group.id]}
                      onChange={(event) =>
                        setGroupSources((current) => ({
                          ...current,
                          [group.id]: event.target.value as "local" | "account",
                        }))
                      }
                      className="rounded-md border border-border bg-secondary px-2 py-1.5 text-xs text-foreground"
                    >
                      <option value="account">Account</option>
                      <option value="local">This device</option>
                    </select>
                  </label>
                </div>
                <details className="mt-2">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[11px] text-muted-foreground">
                    <span>Compare fields ({group.fields.length})</span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                  </summary>
                  <div className="mt-2 space-y-2">
                    {group.fields.map((field) => (
                      <div key={field.path} className="rounded-lg border border-border/70 bg-background/50 px-3 py-2">
                        <div className="text-xs font-medium">{field.label}</div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          Local: {formatValue(getByPath(localState.settings, field.path))} | Account:{" "}
                          {formatValue(getByPath(accountState.settings, field.path))}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            ))}
            <details className="rounded-xl border border-border bg-card/30 p-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium">
                <span>Keybinds</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </summary>
              <div className="mt-3 space-y-2">
                {localState.settings.shortcuts.map((shortcut) => {
                  const accountShortcut =
                    accountState.settings.shortcuts.find((entry) => entry.id === shortcut.id) ?? shortcut;
                  return (
                    <div key={shortcut.id} className="grid gap-2 rounded-lg border border-border/70 bg-background/50 px-3 py-2 md:grid-cols-[1fr_auto]">
                      <div>
                        <div className="text-xs font-medium">{shortcut.label}</div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          Local: {shortcut.keys} | Account: {accountShortcut.keys}
                        </div>
                      </div>
                      <select
                        value={shortcutSources[shortcut.id] ?? "account"}
                        onChange={(event) =>
                          setShortcutSources((current) => ({
                            ...current,
                            [shortcut.id]: event.target.value as "local" | "account",
                          }))
                        }
                        className="rounded-md border border-border bg-secondary px-2 py-1 text-xs"
                      >
                        <option value="account">Account</option>
                        <option value="local">Local</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            </details>
          </ItemSelector>
        </div>

        <div className="space-y-4">
          <ItemSelector title="Local bookmarks to import" count={localState.extras.bookmarks.length}>
            {localState.extras.bookmarks.map((bookmark) => (
              <label key={bookmark.url} className="flex items-start gap-3 rounded-xl border border-border bg-card/30 px-3 py-3 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(selectedBookmarkUrls[bookmark.url])}
                  onChange={(event) =>
                    setSelectedBookmarkUrls((current) => ({
                      ...current,
                      [bookmark.url]: event.target.checked,
                    }))
                  }
                />
                <div className="min-w-0">
                  <div className="truncate font-medium">{bookmark.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{bookmark.url}</div>
                </div>
              </label>
            ))}
          </ItemSelector>

          <ItemSelector title="Local history to import" count={sortedLocalHistory.length} defaultOpen>
            {sortedLocalHistory.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card/20 px-3 py-4 text-sm text-muted-foreground">
                No local history was found for this device. Your existing account history will still be kept.
              </div>
            ) : null}
            <div className="px-1 text-xs text-muted-foreground">
              Checked entries from this device will be added to your existing account history.
            </div>
            {sortedLocalHistory.slice(0, 100).map((entry, index) => (
              <label
                key={entry.id || `hist-${entry.timestamp}-${entry.url}-${index}`}
                className="flex items-start gap-3 rounded-xl border border-border bg-card/30 px-3 py-3 text-sm"
              >
                <input
                  type="checkbox"
                  checked={Boolean(selectedHistoryIds[entry.id])}
                  onChange={(event) =>
                    setSelectedHistoryIds((current) => ({
                      ...current,
                      [entry.id]: event.target.checked,
                    }))
                  }
                />
                <div className="min-w-0">
                  <div className="truncate font-medium">{entry.title || entry.url}</div>
                  <div className="truncate text-xs text-muted-foreground">{entry.url}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {formatHistoryTimestamp(entry.timestamp)}
                    {entry.category ? ` | ${entry.category}` : ""}
                  </div>
                </div>
              </label>
            ))}
            {sortedLocalHistory.length > 100 ? (
              <div className="px-1 text-xs text-muted-foreground">
                Showing the newest 100 history entries in the merge wizard.
              </div>
            ) : null}
          </ItemSelector>

          <ItemSelector title="Local pinned shortcuts to import" count={localState.extras.shortcutTiles.length}>
            {localState.extras.shortcutTiles.map((entry) => (
              <label key={entry.id} className="flex items-start gap-3 rounded-xl border border-border bg-card/30 px-3 py-3 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(selectedShortcutIds[entry.id])}
                  onChange={(event) =>
                    setSelectedShortcutIds((current) => ({
                      ...current,
                      [entry.id]: event.target.checked,
                    }))
                  }
                />
                <div className="min-w-0">
                  <div className="truncate font-medium">{entry.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{entry.url}</div>
                </div>
              </label>
            ))}
          </ItemSelector>

          <ItemSelector title="Local custom apps and games to import" count={localState.extras.customAppsGames.length}>
            {localState.extras.customAppsGames.map((entry) => (
              <label key={entry.id} className="flex items-start gap-3 rounded-xl border border-border bg-card/30 px-3 py-3 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(selectedAppIds[entry.id])}
                  onChange={(event) =>
                    setSelectedAppIds((current) => ({
                      ...current,
                      [entry.id]: event.target.checked,
                    }))
                  }
                />
                <div className="min-w-0">
                  <div className="truncate font-medium">{entry.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{entry.category} | {entry.url}</div>
                </div>
              </label>
            ))}
          </ItemSelector>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">Account items are preserved by default.</div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void handleApply()}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {busy ? "Applying sync..." : "Apply Sync Selection"}
        </button>
      </div>
    </div>
  );
};
