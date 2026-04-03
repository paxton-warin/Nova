import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, Compass, Globe2, Keyboard, Moon, PaintBucket, Search, Shield, Sparkles, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  buildDefaultKeyboardShortcuts,
  primaryModifierLabel,
  shortcutPlatformLabel,
  standardBrowserShortcutLabel,
} from "@/lib/shortcuts";
import type { BrowserSettings, ProxyLocationOption, ThemePreset, TransportConfig } from "@/types/browser";

interface TutorialProps {
  settings: BrowserSettings;
  themePresets: ThemePreset[];
  proxyLocations: ProxyLocationOption[];
  transportConfig?: TransportConfig | null;
  proxyLocationNotice?: string | null;
  onUpdateSettings: (value: Partial<BrowserSettings>) => void;
  onUpdateTheme: (value: Partial<BrowserSettings["theme"]>) => void;
  onProxyLocationChange: (locationId: string) => void;
  /** Create account without opening the full account panel. */
  onRegister?: (username: string, password: string) => Promise<boolean>;
  /** Sign in without leaving setup; loads your account and jumps to the review step. */
  onLoginFromSetup?: (username: string, password: string, totpToken?: string) => Promise<boolean>;
  authError?: string | null;
  onDismiss: () => void;
  jumpToReviewAfterAuth?: boolean;
  onConsumedJumpToReview?: () => void;
  accountUsername?: string | null;
}

export const Tutorial: React.FC<TutorialProps> = ({
  settings,
  themePresets,
  proxyLocations,
  transportConfig,
  proxyLocationNotice,
  onUpdateSettings,
  onUpdateTheme,
  onProxyLocationChange,
  onRegister,
  onLoginFromSetup,
  authError,
  onDismiss,
  jumpToReviewAfterAuth,
  onConsumedJumpToReview,
  accountUsername,
}) => {
  const [step, setStep] = useState(0);
  const [shortcutTest, setShortcutTest] = useState("");
  const [setupMode, setSetupMode] = useState<"login" | "signup">("login");
  const [setupUsername, setSetupUsername] = useState("");
  const [setupPassword, setSetupPassword] = useState("");
  const [setupTotp, setSetupTotp] = useState("");
  const [setupBusy, setSetupBusy] = useState(false);

  function updateShortcut(id: string, keys: string) {
    onUpdateSettings({
      shortcuts: settings.shortcuts.map((shortcut) =>
        shortcut.id === id ? { ...shortcut, keys } : shortcut,
      ),
    });
  }

  const searchEngineOptions = ["duckduckgo", "google", "bing", "yahoo"] as const;
  const primaryModifier = primaryModifierLabel();
  const platformLabel = shortcutPlatformLabel();
  const standardShortcutLabel = standardBrowserShortcutLabel();
  const hasProxyLocations = proxyLocations.length > 0;
  const activeLocationId = transportConfig?.proxyLocationId ?? settings.proxyLocation;
  const activeLocation = proxyLocations.find((entry) => entry.id === activeLocationId) ?? null;
  const selectedLocation = proxyLocations.find((entry) => entry.id === settings.proxyLocation) ?? null;
  const shortcutPresetOptions = [
    {
      id: "primary",
      label: `Use ${primaryModifier} defaults`,
      apply: () => onUpdateSettings({ shortcuts: buildDefaultKeyboardShortcuts() }),
    },
    {
      id: "ctrl",
      label: "Use Ctrl defaults",
      apply: () => onUpdateSettings({ shortcuts: buildDefaultKeyboardShortcuts("Ctrl") }),
    },
    {
      id: "alt",
      label: "Use Alt defaults",
      apply: () => onUpdateSettings({ shortcuts: buildDefaultKeyboardShortcuts("Alt") }),
    },
  ].filter((option, index, all) => all.findIndex((entry) => entry.label === option.label) === index);

  const steps = useMemo(
    () => [
      {
        title: "Start your setup",
        icon: User,
        body: (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Already have an account? Sign in here to pull your synced settings and skip re-picking them. You can still confirm everything on the last step or later in Settings.
            </p>
            {onLoginFromSetup || onRegister ? (
              <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                <div className="text-sm font-medium text-foreground">
                  {onLoginFromSetup && onRegister
                    ? setupMode === "login"
                      ? "Sign in to this device"
                      : "Create an account"
                    : onLoginFromSetup
                      ? "Sign in to this device"
                      : "Create an account"}
                </div>
                {onLoginFromSetup && onRegister ? (
                  <div className="flex gap-1 rounded-lg bg-secondary p-1">
                    {(["login", "signup"] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setSetupMode(value)}
                        className={`flex-1 rounded-md px-3 py-2 text-xs font-medium ${
                          setupMode === value
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground"
                        }`}
                      >
                        {value === "login" ? "Sign In" : "Sign Up"}
                      </button>
                    ))}
                  </div>
                ) : null}
                {onLoginFromSetup && onRegister && setupMode === "signup" ? (
                  <div className="text-xs text-muted-foreground">Pick a username and password.</div>
                ) : null}
                <input
                  value={setupUsername}
                  onChange={(e) => setSetupUsername(e.target.value)}
                  placeholder="Username"
                  autoComplete="username"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
                />
                <input
                  value={setupPassword}
                  onChange={(e) => setSetupPassword(e.target.value)}
                  placeholder="Password"
                  type="password"
                  autoComplete={setupMode === "signup" ? "new-password" : "current-password"}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
                />
                {onLoginFromSetup && (!onRegister || setupMode === "login") ? (
                  <input
                    value={setupTotp}
                    onChange={(e) => setSetupTotp(e.target.value)}
                    placeholder="Admin TOTP (only if your account requires it)"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none"
                  />
                ) : null}
                {authError ? <div className="text-xs text-destructive">{authError}</div> : null}
                <Button
                  type="button"
                  className="w-full"
                  disabled={setupBusy || !setupUsername.trim() || !setupPassword}
                  onClick={() => {
                    void (async () => {
                      setSetupBusy(true);
                      try {
                        if (onRegister && (!onLoginFromSetup || setupMode === "signup")) {
                          const ok = await onRegister(setupUsername.trim(), setupPassword);
                          if (ok) {
                            setSetupPassword("");
                            setSetupUsername("");
                          }
                        } else if (onLoginFromSetup) {
                          const ok = await onLoginFromSetup(
                            setupUsername.trim(),
                            setupPassword,
                            setupTotp.trim() || undefined,
                          );
                          if (ok) {
                            setSetupPassword("");
                            setSetupTotp("");
                          }
                        }
                      } finally {
                        setSetupBusy(false);
                      }
                    })();
                  }}
                >
                  {setupBusy
                    ? onRegister && (!onLoginFromSetup || setupMode === "signup")
                      ? "Creating account…"
                      : "Signing in…"
                    : onRegister && (!onLoginFromSetup || setupMode === "signup")
                      ? "Create account"
                      : "Sign in & use account settings"}
                </Button>
              </div>
            ) : null}
            <div className="grid grid-cols-1 gap-3">
              <button
                type="button"
                onClick={() => setStep((value) => value + 1)}
                className="rounded-xl border border-border bg-card/70 px-4 py-4 text-left transition-all hover:border-primary/40"
              >
                <div className="text-sm font-medium">Continue setup as guest</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Configure Nova on this device; you can sign in later and merge with the sync manager.
                </div>
              </button>
            </div>
          </div>
        ),
      },
      {
        title: "Choose your Nova look",
        icon: PaintBucket,
        body: (
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
                    : "border-border bg-card/70 hover:border-primary/40"
                }`}
              >
                <div
                  className="h-20 rounded-lg mb-3 border border-border/50"
                  style={{
                    backgroundColor: `hsl(${theme.accentColor})`,
                    backgroundImage: theme.backgroundUrl ? `url("${theme.backgroundUrl}")` : undefined,
                    backgroundPosition: "center",
                    backgroundSize: "cover",
                  }}
                />
                <div className="text-sm font-medium">{theme.name}</div>
              </button>
            ))}
          </div>
        ),
      },
      {
        title: "Pick your search defaults",
        icon: Search,
        body: (
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              Start with the search engine and quick-search behavior you want every time you open a new tab.
            </div>
            <div className="grid grid-cols-2 gap-3">
              {searchEngineOptions.map((engine) => (
                <button
                  key={engine}
                  onClick={() => onUpdateSettings({ defaultSearchEngine: engine })}
                  className={`rounded-xl border px-3 py-4 text-left capitalize ${
                    settings.defaultSearchEngine === engine
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card/70 hover:border-primary/40"
                  }`}
                >
                  <div className="text-sm font-medium">{engine}</div>
                </button>
              ))}
            </div>
            <label className="flex items-center justify-between rounded-xl border border-border bg-card/70 px-4 py-3">
              <div>
                <div className="text-sm font-medium">Search suggestions</div>
                <div className="text-xs text-muted-foreground">
                  Show helpful suggestions while you type
                </div>
              </div>
              <Switch
                checked={settings.searchSuggestions}
                onCheckedChange={(value) =>
                  onUpdateSettings({ searchSuggestions: value })
                }
              />
            </label>
          </div>
        ),
      },
      {
        title: "Choose your browsing defaults",
        icon: Compass,
        body: (
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              These are the everyday defaults most people care about. You can still change everything later in Settings.
            </div>
            <label className="flex items-center justify-between rounded-xl border border-border bg-card/70 px-4 py-3">
              <div>
                <div className="text-sm font-medium">Restore tabs on launch</div>
                <div className="text-xs text-muted-foreground">Bring your previous session back when you reopen Nova.</div>
              </div>
              <Switch
                checked={settings.restoreTabs}
                onCheckedChange={(value) => onUpdateSettings({ restoreTabs: value })}
              />
            </label>
            <label className="flex items-center justify-between rounded-xl border border-border bg-card/70 px-4 py-3">
              <div>
                <div className="text-sm font-medium">Bookmarks bar</div>
                <div className="text-xs text-muted-foreground">Keep pinned sites visible below the URL bar.</div>
              </div>
              <Switch
                checked={settings.showBookmarksBar}
                onCheckedChange={(value) => onUpdateSettings({ showBookmarksBar: value })}
              />
            </label>
            <label className="flex items-center justify-between rounded-xl border border-border bg-card/70 px-4 py-3">
              <div>
                <div className="text-sm font-medium">Safe browsing</div>
                <div className="text-xs text-muted-foreground">Warn and filter against unsafe destinations.</div>
              </div>
              <Switch
                checked={settings.safeBrowsing}
                onCheckedChange={(value) => onUpdateSettings({ safeBrowsing: value })}
              />
            </label>
            <div className="rounded-xl border border-border bg-card/70 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                  <Globe2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="text-sm font-medium">Exit location</div>
                  <div className="text-xs text-muted-foreground">
                    Pick where Nova exits from when browsing through a proxy.
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
                  <div className="rounded-lg border border-border bg-background/60 px-3 py-3 text-xs text-muted-foreground">
                    <div className="font-medium text-foreground">
                      Active route: {activeLocation?.label ?? selectedLocation?.label ?? settings.proxyLocation}
                    </div>
                    <div className="mt-1">
                      Selected: {selectedLocation?.label ?? settings.proxyLocation}
                      {activeLocationId !== settings.proxyLocation
                        ? ` • Fallback: ${activeLocation?.label ?? activeLocationId}`
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
                  No exit locations are configured yet.
                </div>
              )}
            </div>
            <label className="flex items-center justify-between rounded-xl border border-border bg-card/70 px-4 py-3">
              <div>
                <div className="text-sm font-medium">Show exit location badge</div>
                <div className="text-xs text-muted-foreground">Display a tiny URL-bar badge for non-default exit regions.</div>
              </div>
              <Switch
                checked={settings.showExitLocationBadge}
                onCheckedChange={(value) => onUpdateSettings({ showExitLocationBadge: value })}
              />
            </label>
            <label className="flex items-center justify-between rounded-xl border border-border bg-card/70 px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                  <Shield className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="text-sm font-medium">Ad Shield</div>
                  <div className="text-xs text-muted-foreground">Keep safe browsing protection on from the start.</div>
                </div>
              </div>
              <Switch
                checked={settings.extensions.adShield}
                onCheckedChange={(value) =>
                  onUpdateSettings({
                    safeBrowsing: value,
                    extensions: { ...settings.extensions, adShield: value },
                  })
                }
              />
            </label>
            <label className="flex items-center justify-between rounded-xl border border-border bg-card/70 px-4 py-3">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
                  <Moon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <div className="text-sm font-medium">Dark Reader</div>
                  <div className="text-xs text-muted-foreground">Automatically darken bright pages while browsing.</div>
                </div>
              </div>
              <Switch
                checked={settings.extensions.darkReader}
                onCheckedChange={(value) =>
                  onUpdateSettings({
                    extensions: { ...settings.extensions, darkReader: value },
                  })
                }
              />
            </label>
            <label className="flex items-center justify-between rounded-xl border border-border bg-card/70 px-4 py-3">
              <div>
                <div className="text-sm font-medium">Nova tips</div>
                <div className="text-xs text-muted-foreground">Show quick tips and helpful system hints.</div>
              </div>
              <Switch
                checked={settings.showTips}
                onCheckedChange={(value) => onUpdateSettings({ showTips: value })}
              />
            </label>
            <label className="block rounded-xl border border-border bg-card/70 px-4 py-3">
              <div className="text-sm font-medium">Tab behavior</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Choose whether tabs stay loaded or unload when Nova gets busy.
              </div>
              <select
                value={settings.tabBehavior}
                onChange={(event) =>
                  onUpdateSettings({
                    tabBehavior: event.target.value as BrowserSettings["tabBehavior"],
                  })
                }
                className="mt-3 w-full rounded-lg border border-border bg-background/70 px-3 py-2 text-sm outline-none"
              >
                <option value="keep-loaded">Keep Loaded</option>
                <option value="unload-idle">Unload After 5 Minutes</option>
                <option value="unload-over-limit">Unload After 10 Tabs</option>
              </select>
            </label>
          </div>
        ),
      },
      {
        title: "Choose your shortcuts",
        icon: Keyboard,
        body: (
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">Why different modifiers:</span> Nova detected a{" "}
              <span className="text-foreground">{platformLabel}</span> keyboard, so built-in shortcuts default
              to <span className="text-foreground">{primaryModifier}</span> to avoid common browser and system
              conflicts. Standard browser shortcuts like{" "}
              <span className="text-foreground">{standardShortcutLabel}</span> still work here too.
            </div>
            <div className={`grid grid-cols-1 gap-2 ${shortcutPresetOptions.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
              {shortcutPresetOptions.map((option) => (
                <Button
                  key={option.id}
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={option.apply}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <div className="rounded-xl border border-border bg-card/70 p-4">
              <div className="text-sm font-medium">Customize the main shortcuts</div>
              <div className="mt-1 text-xs text-muted-foreground">
                Edit the combos you care about most, then test one below before you finish setup.
              </div>
              <div className="mt-3 space-y-2">
                {settings.shortcuts
                  .filter((shortcut) => ["1", "2", "3", "12"].includes(shortcut.id))
                  .map((shortcut) => (
                  <label key={shortcut.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background/60 px-3 py-2">
                    <span className="text-xs text-muted-foreground">{shortcut.label}</span>
                    <input
                      value={shortcut.keys}
                      onChange={(event) => updateShortcut(shortcut.id, event.target.value)}
                      className="w-32 rounded-lg border border-border bg-card px-2 py-1 text-xs outline-none"
                    />
                  </label>
                ))}
              </div>
              <div className="mt-4">
                <input
                  value={shortcutTest}
                  onChange={() => {}}
                  onKeyDown={(event) => {
                    event.preventDefault();
                    const keys = [
                      event.ctrlKey ? "Ctrl" : "",
                      event.shiftKey ? "Shift" : "",
                      event.altKey ? "Alt" : "",
                      event.metaKey ? "Meta" : "",
                      event.key.length === 1 ? event.key.toUpperCase() : event.key,
                    ].filter(Boolean);
                    setShortcutTest(keys.join("+"));
                  }}
                  placeholder="Press a key combo to test"
                  className="w-full rounded-xl border border-border bg-background/60 px-3 py-2 text-sm outline-none"
                />
                <div className="mt-2 text-xs text-muted-foreground">
                  {shortcutTest
                    ? `Matched action: ${
                        settings.shortcuts.find((shortcut) => shortcut.keys.replace(/\s/g, "") === shortcutTest)?.label ?? "None yet"
                      }`
                    : "Press a combo here to confirm the shortcut you want to use."}
                </div>
              </div>
            </div>
          </div>
        ),
      },
      {
        title: "You are ready to browse",
        icon: Sparkles,
        body: (
          <div className="rounded-2xl border border-primary/30 bg-primary/10 p-5">
            <div className="text-sm font-medium">Nova is now configured around your preferences.</div>
            {accountUsername ? (
              <div className="mt-2 text-xs text-foreground/90">
                Signed in as <span className="font-medium text-foreground">{accountUsername}</span>. Your
                account data is loaded. Review the steps you skipped or finish below.
              </div>
            ) : null}
            <div className="text-xs text-muted-foreground mt-2 leading-relaxed">
              Signed in? Your account settings are already in use. You can still refine everything from
              Settings or the Account panel for sync, passwords, and admin tools.
            </div>
          </div>
        ),
      },
    ],
    [
      accountUsername,
      authError,
      onLoginFromSetup,
      onRegister,
      onUpdateSettings,
      onUpdateTheme,
      settings,
      setupBusy,
      setupMode,
      setupPassword,
      setupTotp,
      setupUsername,
      shortcutTest,
      proxyLocationNotice,
      proxyLocations,
      themePresets,
      transportConfig,
      primaryModifier,
      platformLabel,
      searchEngineOptions,
      shortcutPresetOptions,
      standardShortcutLabel,
    ],
  );

  useEffect(() => {
    if (!jumpToReviewAfterAuth) return;
    setStep(Math.max(0, steps.length - 1));
    onConsumedJumpToReview?.();
  }, [jumpToReviewAfterAuth, onConsumedJumpToReview, steps.length]);

  const current = steps[step];
  const Icon = current.icon;

  return (
    <div className="fixed inset-0 z-[220] bg-background/55 backdrop-blur-sm">
      <div className="absolute left-1/2 top-16 max-h-[calc(100vh-5rem)] w-[min(100vw-2rem,28rem)] -translate-x-1/2 overflow-y-auto rounded-3xl border border-border bg-card/95 shadow-2xl">
        <div className="h-1.5 bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>
        <div className="p-6">
          <div className="flex items-start gap-4 mb-5">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Icon className="w-6 h-6 text-primary" />
            </div>
            <div>
              <div className="text-lg font-semibold">{current.title}</div>
              <div className="text-sm text-muted-foreground">
                Interactive setup that configures the browser as you go.
              </div>
            </div>
          </div>

          <div className="mb-6">{current.body}</div>

          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={onDismiss}>
              Skip setup
            </Button>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <Button variant="secondary" onClick={() => setStep((value) => value - 1)}>
                  Back
                </Button>
              )}
              {step > 0 ? (
                <Button onClick={() => (step < steps.length - 1 ? setStep((value) => value + 1) : onDismiss())}>
                  {step < steps.length - 1 ? "Next" : "Start Browsing"}
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
