import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bell, Globe2, Keyboard, Moon, Palette, Search, Shield, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { BrowserSettings, ProxyLocationOption, ThemePreset, TransportConfig } from "@/types/browser";

interface SettingsPanelProps {
  settings: BrowserSettings;
  onUpdateSettings: (s: Partial<BrowserSettings>) => void;
  onUpdateTheme: (t: Partial<BrowserSettings["theme"]>) => void;
  themePresets: ThemePreset[];
  proxyLocations: ProxyLocationOption[];
  transportConfig?: TransportConfig | null;
  proxyLocationNotice?: string | null;
  onProxyLocationChange: (locationId: string) => void;
  onOpenShortcutManager: () => void;
  initialSearchQuery?: string | null;
  searchVersion?: number;
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

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  onUpdateSettings,
  onUpdateTheme,
  themePresets,
  proxyLocations,
  transportConfig,
  proxyLocationNotice,
  onProxyLocationChange,
  onOpenShortcutManager,
  initialSearchQuery,
  searchVersion = 0,
  onClose,
  onBack,
  onOpenAccountDetails,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = searchQuery.trim().toLowerCase();

  useEffect(() => {
    setSearchQuery(initialSearchQuery ?? "");
    if (initialSearchQuery) {
      window.requestAnimationFrame(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      });
    }
  }, [initialSearchQuery, searchVersion]);

  const hasProxyLocations = proxyLocations.length > 0;
  const activeLocationId = transportConfig?.proxyLocationId ?? settings.proxyLocation;
  const activeLocation = proxyLocations.find((entry) => entry.id === activeLocationId) ?? null;
  const selectedLocation = proxyLocations.find((entry) => entry.id === settings.proxyLocation) ?? null;
  const isCustomLocation = activeLocationId !== "us";
  const proxyStatusText = transportConfig?.proxyUrl
    ? isCustomLocation
      ? `Currently using a custom exit proxy from ${activeLocation?.label ?? activeLocationId}.`
      : `Currently using the default ${activeLocation?.label ?? "US"} exit proxy.`
    : "Currently using the server connection directly because no working exit proxy is available.";

  const themePresetNames = themePresets.map((preset) => preset.name);

  const settingResults = useMemo(
    () => [
      {
        key: "shortcutManager",
        label: "Keyboard shortcuts",
        description: "",
        visible: matchesQuery(normalizedQuery, "Keyboard shortcuts", "shortcut", "shortcuts", "keybind", "keybinds", "hotkey"),
        control: (
          <Button type="button" variant="secondary" size="sm" onClick={onOpenShortcutManager}>
            Open manager
          </Button>
        ),
      },
      {
        key: "themePresetId",
        label: "Theme preset",
        description: "",
        visible: matchesQuery(normalizedQuery, "Theme preset", "theme", "preset", ...themePresetNames),
        control: (
          <select
            value={settings.theme.themePresetId}
            onChange={(event) => {
              const preset = themePresets.find((theme) => theme.id === event.target.value);
              if (!preset) return;
              onUpdateTheme({
                themePresetId: preset.id,
                accentColor: preset.accentColor,
                backgroundUrl: preset.backgroundUrl,
              });
            }}
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
          >
            {themePresets.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
              </option>
            ))}
          </select>
        ),
      },
      {
        key: "accentColor",
        label: "Accent color",
        description: "",
        visible: matchesQuery(
          normalizedQuery,
          "Accent color",
          "accent",
          "color",
          ...ACCENT_COLORS.map((color) => color.label),
        ),
        control: (
          <select
            value={settings.theme.accentColor}
            onChange={(event) => onUpdateTheme({ accentColor: event.target.value })}
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
          >
            {ACCENT_COLORS.map((color) => (
              <option key={color.value} value={color.value}>
                {color.label}
              </option>
            ))}
          </select>
        ),
      },
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
        visible: matchesQuery(normalizedQuery, "Density", "compact", "default", "spacious", settings.theme.density),
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
        visible: matchesQuery(
          normalizedQuery,
          "Tab orientation",
          "tabs",
          "horizontal",
          "vertical",
          settings.theme.tabOrientation,
        ),
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
        key: "themeMode",
        label: "Theme mode",
        description: "",
        visible: matchesQuery(
          normalizedQuery,
          "Theme mode",
          "light",
          "dark",
          "midnight",
          settings.theme.mode,
        ),
        control: (
          <select
            value={settings.theme.mode}
            onChange={(event) =>
              onUpdateTheme({
                mode: event.target.value as BrowserSettings["theme"]["mode"],
              })
            }
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="midnight">Midnight</option>
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
        key: "tabBehavior",
        label: "Tab behavior",
        description: "",
        visible: matchesQuery(
          normalizedQuery,
          "Tab behavior",
          "keep loaded",
          "unload idle",
          "unload over limit",
          settings.tabBehavior,
        ),
        control: (
          <select
            value={settings.tabBehavior}
            onChange={(event) =>
              onUpdateSettings({
                tabBehavior: event.target.value as BrowserSettings["tabBehavior"],
              })
            }
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="keep-loaded">Keep Loaded</option>
            <option value="unload-idle">Unload After 5 Minutes</option>
            <option value="unload-over-limit">Unload After 10 Tabs</option>
          </select>
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
        key: "proxyLocation",
        label: "Exit location",
        description: "",
        visible: matchesQuery(
          normalizedQuery,
          "Exit location",
          "proxy",
          "location",
          "region",
          selectedLocation?.label,
          activeLocation?.label,
        ),
        control: hasProxyLocations ? (
          <Select value={settings.proxyLocation} onValueChange={onProxyLocationChange}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Choose region" />
            </SelectTrigger>
            <SelectContent>
              {proxyLocations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>
                  <span className="flex items-center gap-2">
                    <span aria-hidden>{loc.emoji}</span>
                    <span>{loc.label}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-xs text-muted-foreground">No exit locations configured</span>
        ),
      },
      {
        key: "showExitLocationBadge",
        label: "Show exit location while browsing",
        description: "",
        visible: matchesQuery(normalizedQuery, "exit location badge", "proxy badge", settings.showExitLocationBadge),
        control: (
          <Switch
            checked={settings.showExitLocationBadge}
            onCheckedChange={(value) => onUpdateSettings({ showExitLocationBadge: value })}
          />
        ),
      },
      {
        key: "adShield",
        label: "Ad Shield",
        description: "",
        visible: matchesQuery(normalizedQuery, "Ad Shield", "adshield", settings.extensions.adShield),
        control: (
          <Switch
            checked={settings.extensions.adShield}
            onCheckedChange={(value) =>
              onUpdateSettings({
                safeBrowsing: value,
                extensions: { ...settings.extensions, adShield: value },
              })
            }
          />
        ),
      },
      {
        key: "darkReader",
        label: "Dark Reader",
        description: "",
        visible: matchesQuery(normalizedQuery, "Dark Reader", "darkreader", settings.extensions.darkReader),
        control: (
          <Switch
            checked={settings.extensions.darkReader}
            onCheckedChange={(value) =>
              onUpdateSettings({
                extensions: { ...settings.extensions, darkReader: value },
              })
            }
          />
        ),
      },
      {
        key: "doNotTrack",
        label: "Do Not Track",
        description: "",
        visible: matchesQuery(normalizedQuery, "Do Not Track", "privacy", "tracking", "dnt"),
        control: (
          <Switch
            checked={settings.doNotTrack}
            onCheckedChange={(value) => onUpdateSettings({ doNotTrack: value })}
          />
        ),
      },
      {
        key: "pushNotifications",
        label: "Push notifications",
        description: "",
        visible: matchesQuery(normalizedQuery, "Push notifications", "notifications", "alerts"),
        control: (
          <Switch
            checked={settings.pushNotifications}
            onCheckedChange={(value) => onUpdateSettings({ pushNotifications: value })}
          />
        ),
      },
      {
        key: "notificationSound",
        label: "Notification sound",
        description: "",
        visible: matchesQuery(normalizedQuery, "Notification sound", "sound", "audio", "notifications"),
        control: (
          <Switch
            checked={settings.notificationSound}
            onCheckedChange={(value) => onUpdateSettings({ notificationSound: value })}
          />
        ),
      },
      {
        key: "backgroundUrl",
        label: "Background image",
        description: "",
        visible: matchesQuery(
          normalizedQuery,
          "Background image",
          "background",
          "wallpaper",
          settings.theme.backgroundUrl,
        ),
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
    [
      activeLocation?.label,
      hasProxyLocations,
      normalizedQuery,
      onProxyLocationChange,
      onOpenShortcutManager,
      onUpdateSettings,
      onUpdateTheme,
      proxyLocations,
      selectedLocation?.label,
      settings,
      themePresetNames,
      themePresets,
    ],
  );

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
            ref={searchInputRef}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search settings..."
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
            {settingResults.length === 0 && (
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
            Browsing
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
            <Globe2 className="w-4 h-4 text-primary" />
            Location & Routing
          </div>
          <div className="rounded-xl border border-border bg-background/60 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 shrink-0 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Globe2 className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">Exit location</div>
                <div className="text-xs text-muted-foreground mt-1">
                  Choose the proxy region for browsing traffic.
                </div>
              </div>
            </div>
            {hasProxyLocations ? (
              <>
                <Select value={settings.proxyLocation} onValueChange={onProxyLocationChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose region" />
                  </SelectTrigger>
                  <SelectContent>
                    {proxyLocations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        <span className="flex items-center gap-2">
                          <span aria-hidden>{loc.emoji}</span>
                          <span>{loc.label}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="rounded-lg border border-border/70 bg-card/40 px-3 py-3 text-xs text-muted-foreground">
                  <div className="font-medium text-foreground">{proxyStatusText}</div>
                  <div className="mt-1">
                    Selected: {selectedLocation?.label ?? settings.proxyLocation}
                    {activeLocationId !== settings.proxyLocation
                      ? ` • Active fallback: ${activeLocation?.label ?? activeLocationId}`
                      : ""}
                  </div>
                </div>
                {proxyLocationNotice ? (
                  <div className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-3 text-xs text-emerald-100">
                    {proxyLocationNotice}
                  </div>
                ) : null}
                {transportConfig?.proxyWarning ? (
                  <div className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-3 text-xs text-amber-100">
                    {transportConfig.proxyWarning}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-amber-500/40 bg-amber-500/10 px-3 py-3 text-xs text-amber-100">
                No exit locations are configured.
              </div>
            )}
          </div>
          <ToggleRow
            title="Show exit location while browsing"
            description="Display a tiny badge in the URL bar when a non-default exit region is active."
            checked={settings.showExitLocationBadge}
            onChange={(value) => onUpdateSettings({ showExitLocationBadge: value })}
          />
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Shield className="w-4 h-4 text-primary" />
            Privacy & Security
          </div>
          <ToggleRow
            title="Ad Shield"
            description="Safe browsing protection for risky destinations."
            checked={settings.extensions.adShield}
            onChange={(value) =>
              onUpdateSettings({
                safeBrowsing: value,
                extensions: { ...settings.extensions, adShield: value },
              })
            }
          />
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
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Bell className="w-4 h-4 text-primary" />
            Notifications
          </div>
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
            <Moon className="w-4 h-4 text-primary" />
            Reading & Display
          </div>
          <ToggleRow
            title="Dark Reader"
            description="Darken bright pages automatically while you browse."
            checked={settings.extensions.darkReader}
            onChange={(value) =>
              onUpdateSettings({
                extensions: { ...settings.extensions, darkReader: value },
              })
            }
          />
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Keyboard className="w-4 h-4 text-primary" />
            Keyboard & Commands
          </div>
          <div className="rounded-xl border border-border bg-background/60 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium">Keybind manager</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Manage all shortcuts in one dedicated panel instead of mixing them into Settings.
                </div>
              </div>
              <Button type="button" variant="secondary" onClick={onOpenShortcutManager}>
                Open
              </Button>
            </div>
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
