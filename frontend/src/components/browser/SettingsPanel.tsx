import React, { useMemo, useState } from "react";
import { ArrowLeft, Keyboard, Palette, Search, Shield, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { buildDefaultKeyboardShortcuts, primaryModifierLabel } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import type { BrowserSettings, ThemePreset } from "@/types/browser";

interface SettingsPanelProps {
  settings: BrowserSettings;
  onUpdateSettings: (s: Partial<BrowserSettings>) => void;
  onUpdateTheme: (t: Partial<BrowserSettings["theme"]>) => void;
  themePresets: ThemePreset[];
  onClose: () => void;
  onBack?: () => void;
  onOpenAccountDetails?: () => void;
}

const ACCENT_COLORS = [
  { label: "Cyan", value: "172 66% 50%" },
  { label: "Blue", value: "217 91% 60%" },
  { label: "Green", value: "142 71% 45%" },
  { label: "Orange", value: "25 95% 53%" },
  { label: "Rose", value: "346 77% 60%" },
  { label: "Amber", value: "45 93% 47%" },
];

function matchesQuery(query: string, ...terms: Array<string | number | boolean | undefined>) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return terms.some((term) =>
    String(term ?? "")
      .toLowerCase()
      .includes(normalized),
  );
}

function normalizeShortcutKey(value: string) {
  switch (value) {
    case " ":
      return "Space";
    default:
      return value.length === 1 ? value.toUpperCase() : value;
  }
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  onUpdateSettings,
  onUpdateTheme,
  themePresets,
  onClose,
  onBack,
  onOpenAccountDetails,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [capturingShortcutId, setCapturingShortcutId] = useState<string | null>(null);
  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredShortcuts = useMemo(() => {
    if (!normalizedQuery) return settings.shortcuts;
    return settings.shortcuts.filter(
      (shortcut) =>
        shortcut.label.toLowerCase().includes(normalizedQuery) ||
        shortcut.action.toLowerCase().includes(normalizedQuery) ||
        shortcut.keys.toLowerCase().includes(normalizedQuery),
    );
  }, [normalizedQuery, settings.shortcuts]);

  const settingResults = useMemo(
    () => [
      {
        key: "restoreTabs",
        label: "Restore tabs on launch",
        description: "",
        visible: matchesQuery(normalizedQuery, "Restore tabs on launch", "restore", "session"),
        control: (
          <Switch
            checked={settings.restoreTabs}
            onCheckedChange={(value) => onUpdateSettings({ restoreTabs: value })}
          />
        ),
      },
      {
        key: "searchSuggestions",
        label: "Search suggestions",
        description: "",
        visible: matchesQuery(normalizedQuery, "Search suggestions", "suggestions", "search"),
        control: (
          <Switch
            checked={settings.searchSuggestions}
            onCheckedChange={(value) => onUpdateSettings({ searchSuggestions: value })}
          />
        ),
      },
      {
        key: "showBookmarksBar",
        label: "Bookmarks bar",
        description: "",
        visible: matchesQuery(normalizedQuery, "Bookmarks bar", "bookmarks", "favorites"),
        control: (
          <Switch
            checked={settings.showBookmarksBar}
            onCheckedChange={(value) => onUpdateSettings({ showBookmarksBar: value })}
          />
        ),
      },
      {
        key: "defaultSearchEngine",
        label: "Default search engine",
        description: "",
        visible: matchesQuery(normalizedQuery, "Default search engine", settings.defaultSearchEngine),
        control: (
          <select
            value={settings.defaultSearchEngine}
            onChange={(event) =>
              onUpdateSettings({
                defaultSearchEngine:
                  event.target.value as BrowserSettings["defaultSearchEngine"],
              })
            }
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="duckduckgo">DuckDuckGo</option>
            <option value="google">Google</option>
            <option value="bing">Bing</option>
            <option value="yahoo">Yahoo</option>
          </select>
        ),
      },
      {
        key: "density",
        label: "Density",
        description: "",
        visible: matchesQuery(normalizedQuery, "Density", settings.theme.density),
        control: (
          <select
            value={settings.theme.density}
            onChange={(event) =>
              onUpdateTheme({
                density: event.target.value as BrowserSettings["theme"]["density"],
              })
            }
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="compact">Compact</option>
            <option value="default">Default</option>
            <option value="spacious">Spacious</option>
          </select>
        ),
      },
      {
        key: "tabOrientation",
        label: "Tab orientation",
        description: "",
        visible: matchesQuery(normalizedQuery, "Tab orientation", settings.theme.tabOrientation),
        control: (
          <select
            value={settings.theme.tabOrientation}
            onChange={(event) =>
              onUpdateTheme({
                tabOrientation: event.target.value as BrowserSettings["theme"]["tabOrientation"],
              })
            }
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical</option>
          </select>
        ),
      },
      {
        key: "safeBrowsing",
        label: "Safe browsing",
        description: "",
        visible: matchesQuery(normalizedQuery, "Safe browsing", "safety", "security"),
        control: (
          <Switch
            checked={settings.safeBrowsing}
            onCheckedChange={(value) => onUpdateSettings({ safeBrowsing: value })}
          />
        ),
      },
      {
        key: "showTips",
        label: "Nova tips",
        description: "",
        visible: matchesQuery(normalizedQuery, "Nova tips", "tips", settings.showTips),
        control: (
          <Switch
            checked={settings.showTips}
            onCheckedChange={(value) => onUpdateSettings({ showTips: value })}
          />
        ),
      },
      {
        key: "backgroundUrl",
        label: "Background image",
        description: "",
        visible: matchesQuery(normalizedQuery, "Background image", "background", settings.theme.backgroundUrl),
        control: (
          <Input
            value={settings.theme.backgroundUrl}
            onChange={(event) => onUpdateTheme({ backgroundUrl: event.target.value })}
            placeholder="Custom background image URL"
            className="w-64"
          />
        ),
      },
    ].filter((item) => item.visible),
    [normalizedQuery, onUpdateSettings, onUpdateTheme, settings],
  );

  function updateShortcut(id: string, keys: string) {
    onUpdateSettings({
      shortcuts: settings.shortcuts.map((shortcut) =>
        shortcut.id === id ? { ...shortcut, keys } : shortcut,
      ),
    });
  }

  function applyShortcutPreset(modifier: "Ctrl" | "Alt") {
    onUpdateSettings({ shortcuts: buildDefaultKeyboardShortcuts(modifier) });
  }

  function resetShortcut(id: string) {
    const fallback = settings.shortcuts.find(
      (shortcut) => shortcut.id === id,
    );
    if (!fallback?.isDefault) return;
    const defaultShortcut = buildDefaultKeyboardShortcuts().find(
      (shortcut) => shortcut.id === id,
    );
    updateShortcut(id, defaultShortcut?.keys ?? fallback.keys);
  }

  function captureShortcut(event: React.KeyboardEvent<HTMLInputElement>, id: string) {
    const ignoredKeys = ["Control", "Shift", "Alt", "Meta", "Tab"];
    if (ignoredKeys.includes(event.key)) return;
    event.preventDefault();
    const keys = [
      event.ctrlKey ? "Ctrl" : "",
      event.shiftKey ? "Shift" : "",
      event.altKey ? "Alt" : "",
      event.metaKey ? "Meta" : "",
      normalizeShortcutKey(event.key),
    ].filter(Boolean);
    updateShortcut(id, keys.join("+"));
    setCapturingShortcutId(null);
  }

  return (
    <div className="w-[28rem] border-l border-border bg-background flex flex-col h-full animate-panel-in">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          {onBack ? (
            <button
              onClick={onBack}
              className="p-1 rounded hover:bg-muted transition-colors active:scale-95"
              title="Back"
              aria-label="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          ) : null}
          <h2 className="text-sm font-semibold text-foreground">Settings</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-muted transition-colors active:scale-95"
          title="Close settings"
          aria-label="Close settings"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
          <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search settings or shortcuts..."
            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
        {normalizedQuery && (
          <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <div className="text-sm font-semibold">Search Results</div>
            {settingResults.length > 0 && (
              <div className="grid gap-3">
                {settingResults.map((result) => (
                  <div
                    key={result.key}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-background/70 px-4 py-4"
                  >
                    <div>
                      <div className="text-sm font-medium">{result.label}</div>
                      {result.description ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {result.description}
                        </div>
                      ) : null}
                    </div>
                    <div className="shrink-0">{result.control}</div>
                  </div>
                ))}
              </div>
            )}
            {settingResults.length === 0 && filteredShortcuts.length === 0 && (
              <div className="text-xs text-muted-foreground">
                No settings matched that search.
              </div>
            )}
          </section>
        )}
        <section className="rounded-2xl border border-border bg-card p-4 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Palette className="w-4 h-4 text-primary" />
            Appearance
          </div>
          <div className="grid grid-cols-2 gap-3">
            {themePresets.map((theme) => (
              <button
                key={theme.id}
                onClick={() =>
                  onUpdateTheme({
                    themePresetId: theme.id,
                    accentColor: theme.accentColor,
                    backgroundUrl: theme.backgroundUrl,
                  })
                }
                className={`rounded-xl border p-3 text-left transition-all ${
                  settings.theme.themePresetId === theme.id
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/40"
                }`}
              >
                <div
                  className="h-16 rounded-lg mb-3"
                  style={{
                    backgroundColor: `hsl(${theme.accentColor})`,
                    backgroundImage: theme.backgroundUrl ? `url("${theme.backgroundUrl}")` : undefined,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                />
                <div className="text-sm font-medium">{theme.name}</div>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs text-muted-foreground">
              Accent color
              <select
                value={settings.theme.accentColor}
                onChange={(event) =>
                  onUpdateTheme({ accentColor: event.target.value })
                }
                className="w-full bg-muted text-foreground text-sm px-3 py-2 rounded-lg border border-border outline-none"
              >
                {ACCENT_COLORS.map((color) => (
                  <option key={color.value} value={color.value}>
                    {color.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              Density
              <select
                value={settings.theme.density}
                onChange={(event) =>
                  onUpdateTheme({
                    density: event.target.value as BrowserSettings["theme"]["density"],
                  })
                }
                className="w-full bg-muted text-foreground text-sm px-3 py-2 rounded-lg border border-border outline-none"
              >
                <option value="compact">Compact</option>
                <option value="default">Default</option>
                <option value="spacious">Spacious</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              Tab orientation
              <select
                value={settings.theme.tabOrientation}
                onChange={(event) =>
                  onUpdateTheme({
                    tabOrientation: event.target.value as BrowserSettings["theme"]["tabOrientation"],
                  })
                }
                className="w-full bg-muted text-foreground text-sm px-3 py-2 rounded-lg border border-border outline-none"
              >
                <option value="horizontal">Horizontal</option>
                <option value="vertical">Vertical</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              Theme mode
              <select
                value={settings.theme.mode}
                onChange={(event) =>
                  onUpdateTheme({
                    mode: event.target.value as BrowserSettings["theme"]["mode"],
                  })
                }
                className="w-full bg-muted text-foreground text-sm px-3 py-2 rounded-lg border border-border outline-none"
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="midnight">Midnight</option>
              </select>
            </label>
          </div>
          <Input
            value={settings.theme.backgroundUrl}
            onChange={(event) => onUpdateTheme({ backgroundUrl: event.target.value })}
            placeholder="Custom background image URL"
          />
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <SlidersHorizontal className="w-4 h-4 text-primary" />
            Browser Behavior
          </div>
          <ToggleRow
            title="Restore tabs on launch"
            description=""
            checked={settings.restoreTabs}
            onChange={(value) => onUpdateSettings({ restoreTabs: value })}
          />
          <ToggleRow
            title="Search suggestions"
            description=""
            checked={settings.searchSuggestions}
            onChange={(value) => onUpdateSettings({ searchSuggestions: value })}
          />
          <ToggleRow
            title="Bookmarks bar"
            description=""
            checked={settings.showBookmarksBar}
            onChange={(value) => onUpdateSettings({ showBookmarksBar: value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs text-muted-foreground">
              Default search engine
              <select
                value={settings.defaultSearchEngine}
                onChange={(event) =>
                  onUpdateSettings({
                    defaultSearchEngine:
                      event.target.value as BrowserSettings["defaultSearchEngine"],
                  })
                }
                className="w-full bg-muted text-foreground text-sm px-3 py-2 rounded-lg border border-border outline-none"
              >
                <option value="duckduckgo">DuckDuckGo</option>
                <option value="google">Google</option>
                <option value="bing">Bing</option>
                <option value="yahoo">Yahoo</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              Tab behavior
              <select
                value={settings.tabBehavior}
                onChange={(event) =>
                  onUpdateSettings({
                    tabBehavior:
                      event.target.value as BrowserSettings["tabBehavior"],
                  })
                }
                className="w-full bg-muted text-foreground text-sm px-3 py-2 rounded-lg border border-border outline-none"
              >
                <option value="keep-loaded">Keep Loaded</option>
                <option value="unload-idle">Unload After 5 Minutes</option>
                <option value="unload-over-limit">Unload After 10 Tabs</option>
              </select>
            </label>
            <ToggleRow
              title="Nova tips"
              description=""
              checked={settings.showTips}
              onChange={(value) => onUpdateSettings({ showTips: value })}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Shield className="w-4 h-4 text-primary" />
            Privacy & Security
          </div>
          <ToggleRow
            title="Safe browsing"
            description=""
            checked={settings.safeBrowsing}
            onChange={(value) => onUpdateSettings({ safeBrowsing: value })}
          />
          <ToggleRow
            title="Do Not Track"
            description=""
            checked={settings.doNotTrack}
            onChange={(value) => onUpdateSettings({ doNotTrack: value })}
          />
          <ToggleRow
            title="Push notifications"
            description=""
            checked={settings.pushNotifications}
            onChange={(value) => onUpdateSettings({ pushNotifications: value })}
          />
          <ToggleRow
            title="Notification sound"
            description=""
            checked={settings.notificationSound}
            onChange={(value) =>
              onUpdateSettings({ notificationSound: value })
            }
          />
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Keyboard className="w-4 h-4 text-primary" />
            Keyboard Shortcuts
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-background/60 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              Nova starts with <span className="text-foreground">{primaryModifierLabel()}</span> as the main
              in-app shortcut key. You can switch the preset to <span className="text-foreground">Ctrl</span>{" "}
              or <span className="text-foreground">Alt</span> below, then fine-tune any individual combo.
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="secondary" onClick={() => applyShortcutPreset("Ctrl")}>
                Use Ctrl defaults
              </Button>
              <Button type="button" variant="secondary" onClick={() => applyShortcutPreset("Alt")}>
                Use Alt defaults
              </Button>
            </div>
            {filteredShortcuts.map((shortcut) => (
              <div
                key={shortcut.id}
                className="rounded-xl border border-border bg-background/60 p-3"
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div>
                    <div className="text-sm font-medium">{shortcut.label}</div>
                    <div className="text-xs text-muted-foreground">
                      Action: {shortcut.action}
                    </div>
                  </div>
                  {shortcut.isDefault && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => resetShortcut(shortcut.id)}
                    >
                      Reset
                    </Button>
                  )}
                </div>
                <button
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    setCapturingShortcutId(shortcut.id);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-all",
                    capturingShortcutId === shortcut.id
                      ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                      : "border-border bg-background/70 hover:border-primary/30",
                  )}
                >
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
                      Shortcut
                    </div>
                    <div className="mt-1 text-sm font-semibold">
                      {capturingShortcutId === shortcut.id ? "Press any key combo..." : shortcut.keys}
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {capturingShortcutId === shortcut.id ? "Recording" : "Click to edit"}
                  </div>
                </button>
                {capturingShortcutId === shortcut.id && (
                  <Input
                    autoFocus
                    value={shortcut.keys}
                    onChange={(event) => updateShortcut(shortcut.id, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setCapturingShortcutId(null);
                        return;
                      }
                      captureShortcut(event, shortcut.id);
                    }}
                    placeholder={`${primaryModifierLabel()}+T`}
                    className="mt-3"
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      {onOpenAccountDetails ? (
        <div className="shrink-0 border-t border-border px-4 py-3">
          <Button type="button" variant="outline" className="w-full text-xs" onClick={onOpenAccountDetails}>
            Account details
          </Button>
        </div>
      ) : null}
    </div>
  );
};

const ToggleRow: React.FC<{
  title: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}> = ({ title, description, checked, onChange }) => (
  <label className="flex items-center justify-between gap-4 rounded-xl border border-border bg-background/60 px-4 py-3">
    <div>
      <div className="text-sm font-medium">{title}</div>
      {description ? <div className="text-xs text-muted-foreground">{description}</div> : null}
    </div>
    <Switch checked={checked} onCheckedChange={onChange} />
  </label>
);
