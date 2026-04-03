import React, { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  AppWindow,
  Ban,
  ChevronRight,
  Gamepad2,
  Home,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { resolveApiUrl } from "@/lib/api";
import type { GameApp } from "@/types/browser";

interface InternalPageProps {
  url: string;
  gamesApps: GameApp[];
  onAddShortcut?: (shortcut: { title: string; url: string; color: string; favicon?: string }) => void;
  onAddCustomGameApp?: (entry: Omit<GameApp, "id" | "isCustom">) => void;
  onRemoveCustomGameApp?: (id: string) => void;
  onNavigate: (url: string) => void;
  onOpenInNewTab?: (url: string, titleHint?: string) => void;
  onBypassBlockedSite?: (url: string) => void;
}

function defaultBannerForCatalogUrl(url: string) {
  try {
    return resolveApiUrl(`/api/favicon?url=${encodeURIComponent(url)}`);
  } catch {
    return "";
  }
}

function isImageSource(value: string | undefined) {
  return Boolean(value && /^(https?:|data:|\/)/i.test(value));
}

function placeholderBannerForEntry(title: string, category: GameApp["category"]) {
  const accent = category === "game" ? "#8b5cf6" : "#0ea5e9";
  const deep = category === "game" ? "#1f1238" : "#082f49";
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 540">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop stop-color="${deep}"/>
          <stop offset="1" stop-color="${accent}"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="540" fill="url(#g)"/>
      <rect x="54" y="56" width="1092" height="428" rx="28" fill="white" fill-opacity="0.05" stroke="white" stroke-opacity="0.12"/>
      <text x="72" y="444" fill="white" fill-opacity="0.92" font-family="Arial, sans-serif" font-size="56" font-weight="700">${title.replace(/[<&>"]/g, "").slice(0, 26)}</text>
    </svg>`,
  )}`;
}

function resolveBannerSource(item: Pick<GameApp, "banner" | "title" | "category">) {
  return isImageSource(item.banner)
    ? item.banner!
    : placeholderBannerForEntry(item.title, item.category);
}

function resolveIconSource(item: Pick<GameApp, "icon" | "url">) {
  return isImageSource(item.icon) ? item.icon! : defaultBannerForCatalogUrl(item.url);
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

function parseInternalUrl(url: string) {
  if (!url.startsWith("nova://")) {
    return {
      kind: "error",
      target: "",
      source: "",
      message: "",
      title: "",
    };
  }
  try {
    const parsed = new URL(url.replace(/^nova:\/\//i, "https://nova.internal/"));
    const segments = parsed.pathname.replace(/^\//, "").split("/").filter(Boolean);
    const kind = segments[0] ?? "error";
    return {
      kind,
      target: parsed.searchParams.get("target") ?? "",
      source: parsed.searchParams.get("source") ?? "",
      message:
        parsed.searchParams.get("message") ??
        parsed.searchParams.get("reason") ??
        "",
      title: parsed.searchParams.get("title") ?? "",
      adminBypassAllowed: parsed.searchParams.get("adminBypassAllowed") === "1",
    };
  } catch {
    return {
      kind: "error",
      target: "",
      source: "",
      message: "",
      title: "",
      adminBypassAllowed: false,
    };
  }
}

function formatDisplayUrl(value: string) {
  if (!value) return "accounts.google.com";
  try {
    return new URL(value).toString();
  } catch {
    return value;
  }
}

const shellCard =
  "rounded-3xl border border-border bg-card/95 shadow-2xl backdrop-blur-xl";

const SourcePill: React.FC<{
  active: boolean;
  label: string;
  onClick: () => void;
}> = ({ active, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
      active ? "border-primary bg-primary/10 text-foreground" : "border-border bg-background/60 text-muted-foreground",
    )}
  >
    {label}
  </button>
);

const CatalogBanner: React.FC<{ item: Pick<GameApp, "banner" | "title" | "category"> }> = ({ item }) => {
  const fallback = placeholderBannerForEntry(item.title, item.category);
  const [src, setSrc] = useState(resolveBannerSource(item));

  useEffect(() => {
    setSrc(resolveBannerSource(item));
  }, [item.banner, item.category, item.title]);

  return (
    <img
      src={src}
      alt=""
      className="h-full w-full object-cover"
      onError={() => setSrc(fallback)}
    />
  );
};

const CatalogIcon: React.FC<{ item: Pick<GameApp, "icon" | "title" | "url"> }> = ({ item }) => {
  const fallbackInitial = (item.title.trim()[0] ?? "?").toUpperCase();
  const fallbackSrc = resolveIconSource(item);
  const [src, setSrc] = useState(fallbackSrc);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSrc(resolveIconSource(item));
    setFailed(false);
  }, [item.icon, item.title, item.url]);

  if (failed || !src) {
    return (
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-sm font-semibold text-primary">
        {fallbackInitial}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      className="h-11 w-11 rounded-2xl border border-border/60 bg-background/70 object-cover p-2"
      onError={() => {
        setSrc("");
        setFailed(true);
      }}
    />
  );
};

export const InternalPage: React.FC<InternalPageProps> = ({
  url,
  gamesApps,
  onAddShortcut,
  onAddCustomGameApp,
  onRemoveCustomGameApp,
  onNavigate,
  onOpenInNewTab,
  onBypassBlockedSite,
}) => {
  const status = parseInternalUrl(url);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [confirmBypassOpen, setConfirmBypassOpen] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "custom" | "preloaded">("all");
  const [customTitle, setCustomTitle] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [customFavicon, setCustomFavicon] = useState("");
  const [customBanner, setCustomBanner] = useState("");
  const games = useMemo(
    () => gamesApps.filter((item) => item.category === "game"),
    [gamesApps],
  );
  const apps = useMemo(
    () => gamesApps.filter((item) => item.category === "app"),
    [gamesApps],
  );

  if (status.kind === "apps" || status.kind === "games") {
    const isGames = status.kind === "games";
    const title = isGames ? "Games Library" : "Apps Library";
    const items = isGames ? games : apps;
    const Icon = isGames ? Gamepad2 : AppWindow;
    const accentColor = isGames ? "#8b5cf6" : "#0ea5e9";
    const filteredItems = items.filter((item) => {
      const matchesQuery =
        !libraryQuery.trim() ||
        `${item.title} ${item.description} ${item.url}`.toLowerCase().includes(libraryQuery.trim().toLowerCase());
      const matchesSource =
        sourceFilter === "all" ? true : sourceFilter === "custom" ? Boolean(item.isCustom) : !item.isCustom;
      return matchesQuery && matchesSource;
    });
    const customCount = items.filter((item) => item.isCustom).length;
    const preloadedCount = items.length - customCount;

    const draftPreview =
      (() => {
        const url = normalizeLikelyExternalUrl(customUrl);
        const title = customTitle.trim();
        if (!title || !url) return null;
        try {
          new URL(url);
        } catch {
          return null;
        }
        const icon = normalizeLikelyExternalUrl(customFavicon) || defaultBannerForCatalogUrl(url);
        const banner = normalizeLikelyExternalUrl(customBanner) || placeholderBannerForEntry(title, isGames ? "game" : "app");
        return {
          title,
          url,
          description: customDescription.trim() || `Custom ${isGames ? "game" : "app"}`,
          icon,
          banner,
          category: isGames ? ("game" as const) : ("app" as const),
        };
      })();

    return (
      <>
      <div className="flex min-h-0 flex-1 flex-col bg-background">
        <div className={`mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col p-3 sm:p-5 ${shellCard}`}>
          <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-3 sm:mb-5 sm:gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Icon className="h-6 w-6" />
              </div>
              <div>
                <div className="text-xl font-semibold sm:text-2xl">{title}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => onNavigate("newtab")}>
                <Home className="mr-2 h-4 w-4" />
                Back to new tab
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className={cn(isGames && "ring-2 ring-primary ring-offset-2 ring-offset-card")}
                onClick={() => onNavigate("nova://games")}
              >
                Games
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className={cn(!isGames && "ring-2 ring-primary ring-offset-2 ring-offset-card")}
                onClick={() => onNavigate("nova://apps")}
              >
                Apps
              </Button>
            </div>
          </div>

          <div className="mb-3 shrink-0 rounded-3xl border border-border bg-background/60 p-3 sm:mb-4 sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold">{title} controls</div>
              </div>
              <Button type="button" size="sm" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                New custom {isGames ? "game" : "app"}
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              <div className="relative min-w-[14rem] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={libraryQuery}
                  onChange={(event) => setLibraryQuery(event.target.value)}
                  placeholder={`Search ${isGames ? "games" : "apps"}`}
                  className="h-9 pl-9"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <SourcePill active={sourceFilter === "all"} label={`All (${items.length})`} onClick={() => setSourceFilter("all")} />
                <SourcePill active={sourceFilter === "preloaded"} label={`Preloaded (${preloadedCount})`} onClick={() => setSourceFilter("preloaded")} />
                <SourcePill active={sourceFilter === "custom"} label={`Custom (${customCount})`} onClick={() => setSourceFilter("custom")} />
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="grid grid-cols-1 gap-3 pb-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredItems.map((item) => {
              return (
              <div
                key={item.id}
                className="overflow-hidden rounded-2xl border border-border bg-background/60 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-background"
              >
                <button type="button" onClick={() => onNavigate(item.url)} className="w-full text-left">
                  <div className="relative h-24 w-full overflow-hidden bg-muted/30 sm:h-28">
                    <CatalogBanner item={item} />
                  </div>
                  <div className="p-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <CatalogIcon item={item} />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold">{item.title}</div>
                          <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                            {item.isCustom ? "Custom" : "Preloaded"} {isGames ? "game" : "app"}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {item.description}
                    </div>
                  </div>
                </button>
                <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-4 py-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      onAddShortcut?.({
                        title: item.title,
                        url: item.url,
                        color: accentColor,
                        favicon: resolveApiUrl(`/api/favicon?url=${encodeURIComponent(item.url)}`),
                      })
                    }
                  >
                    Add to shortcuts
                  </Button>
                  {item.isCustom && (
                    <Button variant="ghost" size="sm" onClick={() => onRemoveCustomGameApp?.(item.id)}>
                      <Trash2 className="mr-1 h-4 w-4" />
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            );
            })}
            {filteredItems.length === 0 ? (
              <div className="col-span-full rounded-3xl border border-dashed border-border px-6 py-16 text-center text-sm text-muted-foreground">
                No {isGames ? "games" : "apps"} matched that search or filter.
              </div>
            ) : null}
          </div>
          </div>
        </div>
      </div>
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl rounded-3xl border-border">
          <DialogHeader>
            <DialogTitle>Create a custom {isGames ? "game" : "app"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-5 md:grid-cols-[1fr_18rem]">
            <div className="space-y-3">
              <Input
                value={customTitle}
                onChange={(event) => setCustomTitle(event.target.value)}
                placeholder={`${isGames ? "Game" : "App"} title`}
              />
              <Input
                value={customUrl}
                onChange={(event) => setCustomUrl(event.target.value)}
                placeholder="https://example.com"
              />
              <Input
                value={customDescription}
                onChange={(event) => setCustomDescription(event.target.value)}
                placeholder="Description (optional)"
              />
              <Input
                value={customFavicon}
                onChange={(event) => setCustomFavicon(event.target.value)}
                placeholder="Custom favicon URL (optional)"
              />
              <Input
                value={customBanner}
                onChange={(event) => setCustomBanner(event.target.value)}
                placeholder="Custom banner URL (optional)"
              />
            </div>
            <div className="flex flex-col gap-3">
              <div className="text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Preview
              </div>
              {draftPreview ? (
                <div className="overflow-hidden rounded-2xl border border-border bg-background/80 shadow-lg">
                  <div className="relative h-24 w-full overflow-hidden bg-muted/40 sm:h-28">
                    <CatalogBanner item={draftPreview} />
                  </div>
                  <div className="p-4 text-left">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <CatalogIcon item={draftPreview} />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold">{draftPreview.title}</div>
                          <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                            Custom {isGames ? "game" : "app"}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{draftPreview.description}</div>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-dashed border-border px-4 text-center text-xs text-muted-foreground">
                  Enter a title and valid URL to preview your card.
                </div>
              )}
              <Button
                type="button"
                disabled={!draftPreview}
                onClick={() => {
                  if (!draftPreview) return;
                  onAddCustomGameApp({
                    title: draftPreview.title,
                    url: draftPreview.url,
                    description: draftPreview.description,
                    icon: draftPreview.icon,
                    banner: draftPreview.banner,
                    category: draftPreview.category,
                  });
                  setCustomTitle("");
                  setCustomUrl("");
                  setCustomDescription("");
                  setCustomFavicon("");
                  setCustomBanner("");
                  setCreateDialogOpen(false);
                }}
              >
                Save custom {isGames ? "game" : "app"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </>
    );
  }

  if (status.kind === "blocked") {
    return (
      <div className="flex h-full items-center justify-center bg-background p-8">
        <div className={`max-w-xl p-8 ${shellCard}`}>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/15">
              <Ban className="h-6 w-6 text-destructive" />
            </div>
            <div>
              <div className="text-lg font-semibold">This site is blocked</div>
              <div className="text-sm text-muted-foreground">
                Your network operator has restricted access to this destination.
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-background/70 p-4 text-sm text-muted-foreground">
            <div className="break-words text-foreground">
              {status.message || "This website is blocked."}
            </div>
            {status.target ? (
              <div className="mt-3 break-all text-xs opacity-80">URL: {status.target}</div>
            ) : null}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            {status.adminBypassAllowed && status.target ? (
              <Button variant="secondary" onClick={() => setConfirmBypassOpen(true)}>
                Continue anyway
              </Button>
            ) : null}
            <Button onClick={() => onNavigate("newtab")}>New tab</Button>
          </div>
          <Dialog open={confirmBypassOpen} onOpenChange={setConfirmBypassOpen}>
            <DialogContent className="max-w-md rounded-3xl border-border">
              <DialogHeader>
                <DialogTitle>Bypass this block?</DialogTitle>
              </DialogHeader>
              <div className="text-sm text-muted-foreground">
                This destination is on an active block list. Continue only if you need to review it as an administrator.
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setConfirmBypassOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    if (!status.target) return;
                    onBypassBlockedSite?.(status.target);
                    setConfirmBypassOpen(false);
                  }}
                >
                  Continue
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    );
  }

  if (status.kind === "auth-blocked") {
    return (
      <div className="flex h-full items-center justify-center bg-background p-8">
        <div className={`max-w-xl p-8 ${shellCard}`}>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/15">
              <ShieldAlert className="h-6 w-6 text-amber-300" />
            </div>
            <div>
              <div className="text-lg font-semibold">This sign-in page blocks embedding</div>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-background/70 p-4 text-sm text-muted-foreground">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Target URL</div>
            <div className="mt-2 break-all text-foreground">{formatDisplayUrl(status.target)}</div>
          </div>
          <div className="mt-6 flex gap-3">
            <Button
              variant="secondary"
              onClick={() => onNavigate(status.source || "https://youtube.com")}
            >
              Return to previous page
            </Button>
            {status.target ? (
              <Button
                onClick={() => onOpenInNewTab?.(status.target, "Sign in")}
              >
                Continue in new tab
              </Button>
            ) : null}
            <Button onClick={() => onNavigate("newtab")}>Open a fresh tab</Button>
          </div>
        </div>
      </div>
    );
  }

  if (status.kind === "scramjet-error") {
    return (
      <div className="flex h-full items-center justify-center bg-background p-8">
        <div className={`max-w-2xl p-8 ${shellCard}`}>
          <div className="mb-5 flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/15 text-destructive">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <div>
              <div className="text-xl font-semibold">
                Nova couldn't load this proxied page
              </div>
              <div className="text-sm text-muted-foreground">
                The proxy worker ran into an issue before the page could fully render.
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-background/70 p-4 text-sm text-muted-foreground">
            <div className="font-medium text-foreground">
              {status.title || "Proxy runtime error"}
            </div>
            <div className="mt-2 break-words">
              {status.message || "The proxy reported an unknown loading error."}
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            <Button variant="secondary" onClick={() => onNavigate("newtab")}>
              Back to new tab
            </Button>
            <Button onClick={() => onNavigate("nova://apps")}>
              Explore apps instead
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center bg-background p-8">
      <div className={`max-w-lg p-8 ${shellCard}`}>
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <div className="text-lg font-semibold">Nova internal page</div>
            <div className="text-sm text-muted-foreground">
              This destination is reserved for Nova browser experiences.
            </div>
          </div>
        </div>
        <Button onClick={() => onNavigate("newtab")}>Back to new tab</Button>
      </div>
    </div>
  );
};
