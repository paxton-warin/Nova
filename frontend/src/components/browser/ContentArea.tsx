import React, { forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";

import { injectEruda, getScramjetController } from "@/lib/scramjet";
import { cn } from "@/lib/utils";
import type { Bookmark, BrowserTab, GameApp, Shortcut, TransportConfig } from "@/types/browser";
import { NewTabPage } from "./NewTabPage";
import { InternalPage } from "./InternalPage";

interface ContentAreaProps {
  tabs: BrowserTab[];
  activeTab: BrowserTab | undefined;
  bookmarks: Bookmark[];
  shortcuts: Shortcut[];
  gamesApps: GameApp[];
  onAddShortcut: (shortcut: Omit<Shortcut, "id" | "favicon"> & { favicon?: string }) => void;
  onUpdateShortcut: (id: string, patch: Partial<Shortcut>) => void;
  onMoveShortcut: (id: string, targetIndex: number) => void;
  onRemoveShortcut: (id: string) => void;
  onAddCustomGameApp: (entry: Omit<GameApp, "id" | "isCustom">) => void;
  onRemoveCustomGameApp: (id: string) => void;
  onNavigate: (url: string, options?: { allowAdminBypass?: boolean }) => void;
  onOpenInNewTab: (url: string, titleHint?: string, options?: { allowAdminBypass?: boolean }) => void;
  searchEngine: string;
  searchSuggestions: boolean;
  backgroundUrl: string;
  tabBehavior: "keep-loaded" | "unload-idle" | "unload-over-limit";
  transportConfig: TransportConfig | null;
  inspectRequestToken: number;
  erudaEnabled: boolean;
  darkReaderEnabled: boolean;
  scramjetErrorMessage: string | null;
  onLoadingChange: (tabId: string, isLoading: boolean) => void;
  onTabLoadTimeout: (tabId: string, targetUrl: string) => void;
  onFrameNavigate: (tabId: string, url: string, title?: string) => void;
  onScramjetError: (message: string | null) => void;
  onFrameContextMenu: (payload: { x: number; y: number; linkUrl?: string; imageUrl?: string }) => void;
  onFramePointerDown: () => void;
  onFrameShortcut: (event: KeyboardEvent) => boolean;
  onFrameFullscreenRequest: () => void;
  onPasswordCapture: (entry: { origin: string; username: string; password: string }) => void;
  onFrameWebsiteMessage: (entry: {
    tabId: string;
    kind: "notification" | "alert";
    title: string;
    message: string;
    url: string;
  }) => void;
  onInspectErudaFailed?: (message: string) => void;
  onRegisterTabFullscreenHost?: (element: HTMLDivElement | null) => void;
  onOpenTickets?: () => void;
}

function resolveContextMenuUrl(rawValue: string | null | undefined, baseUrl: string) {
  if (!rawValue) return undefined;
  try {
    return new URL(rawValue, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function titleFromUrl(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || url;
  } catch {
    return url;
  }
}

function buildFrameContextMenuPayload(
  target: EventTarget | null,
  baseUrl: string,
  x: number,
  y: number,
) {
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

export const ContentArea = forwardRef<HTMLDivElement, ContentAreaProps>(function ContentArea({
  tabs,
  activeTab,
  bookmarks,
  shortcuts,
  gamesApps,
  onAddShortcut,
  onUpdateShortcut,
  onMoveShortcut,
  onRemoveShortcut,
  onAddCustomGameApp,
  onRemoveCustomGameApp,
  onNavigate,
  onOpenInNewTab,
  searchEngine,
  searchSuggestions,
  backgroundUrl,
  tabBehavior,
  transportConfig,
  inspectRequestToken,
  erudaEnabled,
  darkReaderEnabled,
  scramjetErrorMessage,
  onLoadingChange,
  onTabLoadTimeout,
  onFrameNavigate,
  onScramjetError,
  onFrameContextMenu,
  onFramePointerDown,
  onFrameShortcut,
  onFrameFullscreenRequest,
  onPasswordCapture,
  onFrameWebsiteMessage,
  onInspectErudaFailed,
  onRegisterTabFullscreenHost,
  onOpenTickets,
}, ref) {
  const stableTabOrderRef = useRef<string[]>([]);
  const renderedTabIds = useMemo(() => {
    if (tabBehavior === "keep-loaded") {
      return new Set(tabs.map((tab) => tab.id));
    }
    if (tabBehavior === "unload-idle") {
      const cutoff = Date.now() - 5 * 60_000;
      return new Set(
        tabs
          .filter((tab) => tab.id === activeTab?.id || (tab.lastActiveAt ?? 0) >= cutoff)
          .map((tab) => tab.id),
      );
    }
    const mostRecent = [...tabs]
      .sort((left, right) => (right.lastActiveAt ?? 0) - (left.lastActiveAt ?? 0))
      .slice(0, 10)
      .map((tab) => tab.id);
    if (activeTab?.id && !mostRecent.includes(activeTab.id)) {
      mostRecent.push(activeTab.id);
    }
    return new Set(mostRecent);
  }, [activeTab?.id, tabBehavior, tabs]);
  const orderedTabs = useMemo(() => {
    const nextIds = tabs.map((tab) => tab.id);
    const stableIds = stableTabOrderRef.current.filter((id) => nextIds.includes(id));
    for (const id of nextIds) {
      if (!stableIds.includes(id)) {
        stableIds.push(id);
      }
    }
    stableTabOrderRef.current = stableIds;
    return stableIds
      .map((id) => tabs.find((tab) => tab.id === id))
      .filter((tab): tab is BrowserTab => Boolean(tab));
  }, [tabs]);

  return (
    <div ref={ref} className="flex-1 relative bg-background overflow-hidden min-h-0">
      {orderedTabs.map(tab => {
        const isActive = tab.id === activeTab?.id;
        const shouldRender = renderedTabIds.has(tab.id);
        if (!shouldRender) return null;

        if (tab.url === 'newtab') {
          return (
            <div key={tab.id} className={cn('absolute inset-0', isActive ? 'z-10' : 'z-0 invisible')}>
              <NewTabPage
                shortcuts={shortcuts}
                bookmarks={bookmarks}
                onAddShortcut={onAddShortcut}
                onUpdateShortcut={onUpdateShortcut}
                onMoveShortcut={onMoveShortcut}
                onRemoveShortcut={onRemoveShortcut}
                onNavigate={onNavigate}
                searchEngine={searchEngine}
                searchSuggestions={searchSuggestions}
                backgroundUrl={backgroundUrl}
                onOpenTickets={onOpenTickets}
              />
            </div>
          );
        }

        if (tab.url.startsWith("nova://")) {
          return (
            <div
              key={`${tab.id}-${tab.reloadToken ?? 0}`}
              className={cn("absolute inset-0 flex min-h-0 flex-col", isActive ? "z-10" : "z-0 invisible")}
            >
              <InternalPage
                url={tab.url}
                gamesApps={gamesApps}
                onNavigate={onNavigate}
                onOpenInNewTab={onOpenInNewTab}
                onBypassBlockedSite={(targetUrl) => onNavigate(targetUrl, { allowAdminBypass: true })}
                onAddShortcut={onAddShortcut}
                onAddCustomGameApp={onAddCustomGameApp}
                onRemoveCustomGameApp={onRemoveCustomGameApp}
              />
            </div>
          );
        }

        if (scramjetErrorMessage && isActive) {
          return (
            <div key={tab.id} className="absolute inset-0 z-10">
              <InternalPage
                url={`nova://scramjet-error?message=${encodeURIComponent(scramjetErrorMessage)}&title=${encodeURIComponent("Proxy runtime error")}`}
                gamesApps={gamesApps}
                onNavigate={onNavigate}
              />
            </div>
          );
        }

        return (
          <div key={tab.id} className={cn('absolute inset-0', isActive ? 'z-10' : 'z-0 invisible')}>
            {tab.isLoading && (
              <div className="absolute top-0 left-0 right-0 z-20 h-0.5 bg-primary/20">
                <div className="h-full bg-primary animate-[loading_1.5s_ease-in-out_infinite] w-1/3 rounded-full" />
              </div>
            )}
            <ProxyTabFrame
              tab={tab}
              isActive={isActive}
              onNavigate={onNavigate}
              onOpenInNewTab={onOpenInNewTab}
              transportConfig={transportConfig}
              inspectRequestToken={inspectRequestToken}
              erudaEnabled={erudaEnabled}
              darkReaderEnabled={darkReaderEnabled}
              onLoadingChange={onLoadingChange}
              onTabLoadTimeout={onTabLoadTimeout}
              onFrameNavigate={onFrameNavigate}
              onScramjetError={onScramjetError}
              onFrameContextMenu={onFrameContextMenu}
              onFramePointerDown={onFramePointerDown}
              onFrameShortcut={onFrameShortcut}
              onFrameFullscreenRequest={onFrameFullscreenRequest}
              onPasswordCapture={onPasswordCapture}
              onFrameWebsiteMessage={onFrameWebsiteMessage}
              onInspectErudaFailed={onInspectErudaFailed}
              onRegisterTabFullscreenHost={onRegisterTabFullscreenHost}
            />
          </div>
        );
      })}
    </div>
  );
});

interface ProxyTabFrameProps {
  tab: BrowserTab;
  isActive: boolean;
  onNavigate: (url: string, options?: { allowAdminBypass?: boolean }) => void;
  onOpenInNewTab: (url: string, titleHint?: string, options?: { allowAdminBypass?: boolean }) => void;
  transportConfig: TransportConfig | null;
  inspectRequestToken: number;
  erudaEnabled: boolean;
  darkReaderEnabled: boolean;
  onLoadingChange: (tabId: string, isLoading: boolean) => void;
  onTabLoadTimeout: (tabId: string, targetUrl: string) => void;
  onFrameNavigate: (tabId: string, url: string, title?: string) => void;
  onScramjetError: (message: string | null) => void;
  onFrameContextMenu: (payload: { x: number; y: number; linkUrl?: string; imageUrl?: string }) => void;
  onFramePointerDown: () => void;
  onFrameShortcut: (event: KeyboardEvent) => boolean;
  onFrameFullscreenRequest: () => void;
  onPasswordCapture: (entry: { origin: string; username: string; password: string }) => void;
  onFrameWebsiteMessage: (entry: {
    tabId: string;
    kind: "notification" | "alert";
    title: string;
    message: string;
    url: string;
  }) => void;
  onInspectErudaFailed?: (message: string) => void;
  onRegisterTabFullscreenHost?: (element: HTMLDivElement | null) => void;
}

const ProxyTabFrame: React.FC<ProxyTabFrameProps> = ({
  tab,
  isActive,
  onNavigate,
  onOpenInNewTab,
  transportConfig,
  inspectRequestToken,
  erudaEnabled,
  darkReaderEnabled,
  onLoadingChange,
  onTabLoadTimeout,
  onFrameNavigate,
  onScramjetError,
  onFrameContextMenu,
  onFramePointerDown,
  onFrameShortcut,
  onFrameFullscreenRequest,
  onPasswordCapture,
  onFrameWebsiteMessage,
  onInspectErudaFailed,
  onRegisterTabFullscreenHost,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cleanupBridgeRef = useRef<(() => void) | null>(null);
  const bridgedDocumentRef = useRef<Document | null>(null);
  const erudaEnabledRef = useRef(erudaEnabled);
  const onNavigateRef = useRef(onNavigate);
  const onOpenInNewTabRef = useRef(onOpenInNewTab);
  const onLoadingChangeRef = useRef(onLoadingChange);
  const onTabLoadTimeoutRef = useRef(onTabLoadTimeout);
  const onFrameNavigateRef = useRef(onFrameNavigate);
  const onFrameContextMenuRef = useRef(onFrameContextMenu);
  const onFramePointerDownRef = useRef(onFramePointerDown);
  const onFrameShortcutRef = useRef(onFrameShortcut);
  const onFrameFullscreenRequestRef = useRef(onFrameFullscreenRequest);
  const onPasswordCaptureRef = useRef(onPasswordCapture);
  const onFrameWebsiteMessageRef = useRef(onFrameWebsiteMessage);
  const frameRef = useRef<{
    go: (url: string | URL) => void;
    reload: () => void;
    frame: HTMLIFrameElement;
  } | null>(null);
  const readyUrlRef = useRef<string | null>(null);
  const lastInspectTokenRef = useRef(0);
  const lastReloadTokenRef = useRef<number | undefined>(undefined);
  const onInspectErudaFailedRef = useRef(onInspectErudaFailed);
  onInspectErudaFailedRef.current = onInspectErudaFailed;

  const tabUrlRef = useRef(tab.url);
  const tabIdRef = useRef(tab.id);
  const tabIsMutedRef = useRef(tab.isMuted);
  const lastReadyStateRef = useRef<string | null>(null);
  const lastReportedUrlRef = useRef<string | null>(null);
  const lastReportedTitleRef = useRef<string | null>(null);
  const lastObservedLiveUrlRef = useRef<string | null>(null);
  const loadTimeoutIdRef = useRef<number | null>(null);
  useEffect(() => {
    tabUrlRef.current = tab.url;
    tabIdRef.current = tab.id;
    tabIsMutedRef.current = tab.isMuted;
  }, [tab.url, tab.id, tab.isMuted]);

  useEffect(() => {
    erudaEnabledRef.current = erudaEnabled;
  }, [erudaEnabled]);

  useEffect(() => {
    onNavigateRef.current = onNavigate;
  }, [onNavigate]);

  useEffect(() => {
    onOpenInNewTabRef.current = onOpenInNewTab;
  }, [onOpenInNewTab]);

  useEffect(() => {
    onLoadingChangeRef.current = onLoadingChange;
  }, [onLoadingChange]);

  useEffect(() => {
    onTabLoadTimeoutRef.current = onTabLoadTimeout;
  }, [onTabLoadTimeout]);

  useEffect(() => {
    onFrameNavigateRef.current = onFrameNavigate;
  }, [onFrameNavigate]);

  useEffect(() => {
    onFrameContextMenuRef.current = onFrameContextMenu;
  }, [onFrameContextMenu]);

  useEffect(() => {
    onFramePointerDownRef.current = onFramePointerDown;
  }, [onFramePointerDown]);

  useEffect(() => {
    onFrameShortcutRef.current = onFrameShortcut;
  }, [onFrameShortcut]);

  useEffect(() => {
    onFrameFullscreenRequestRef.current = onFrameFullscreenRequest;
  }, [onFrameFullscreenRequest]);

  useEffect(() => {
    onPasswordCaptureRef.current = onPasswordCapture;
  }, [onPasswordCapture]);

  useEffect(() => {
    onFrameWebsiteMessageRef.current = onFrameWebsiteMessage;
  }, [onFrameWebsiteMessage]);

  useEffect(() => {
    if (loadTimeoutIdRef.current !== null) {
      window.clearTimeout(loadTimeoutIdRef.current);
      loadTimeoutIdRef.current = null;
    }
    if (!tab.isLoading || tab.url === "newtab" || tab.url.startsWith("nova://")) {
      return;
    }
    loadTimeoutIdRef.current = window.setTimeout(() => {
      onTabLoadTimeoutRef.current(tab.id, tabUrlRef.current);
    }, 120_000);
    return () => {
      if (loadTimeoutIdRef.current !== null) {
        window.clearTimeout(loadTimeoutIdRef.current);
        loadTimeoutIdRef.current = null;
      }
    };
  }, [tab.id, tab.isLoading, tab.url]);

  function applyDarkReaderStyle(frameDocument: Document, enabled: boolean) {
    const existing = frameDocument.getElementById("nova-dark-reader-style");
    if (!enabled) {
      existing?.remove();
      return;
    }
    const style =
      existing instanceof HTMLStyleElement
        ? existing
        : Object.assign(frameDocument.createElement("style"), {
            id: "nova-dark-reader-style",
          });
    style.textContent = `
      :root {
        color-scheme: dark;
      }
      html, body {
        background-color: #0c0f18 !important;
        color: #e6e9ef !important;
      }
      html {
        filter: brightness(0.82) contrast(1.06) saturate(0.9) !important;
      }
      img, video, canvas, picture, svg:not(:root),
      [role="img"], iframe, embed, object,
      [style*="background-image"] {
        filter: brightness(1.06) contrast(0.98) saturate(1.02) !important;
      }
    `;
    if (!style.parentNode) {
      frameDocument.head?.appendChild(style);
    }
  }

  function applyTabMuteState(frameDocument: Document, enabled: boolean) {
    const mediaElements = frameDocument.querySelectorAll("audio, video");
    mediaElements.forEach((element) => {
      if ("muted" in element && "volume" in element) {
        const mediaElement = element as HTMLMediaElement;
        mediaElement.defaultMuted = enabled;
        mediaElement.muted = enabled;
        if (!enabled && mediaElement.volume === 0) {
          mediaElement.volume = 1;
        }
      }
    });
  }

  function extractPasswordEntry(
    form: HTMLFormElement,
    frameWindow: Window,
    frameBaseUrl: string,
  ) {
    const passwordField = Array.from(form.elements).find(
      (element): element is HTMLInputElement =>
        element instanceof frameWindow.HTMLInputElement &&
        element.type === "password" &&
        element.value.trim().length > 0,
    );
    if (!passwordField) return null;

    const usernameField = Array.from(form.elements).find(
      (element): element is HTMLInputElement =>
        element instanceof frameWindow.HTMLInputElement &&
        element !== passwordField &&
        ["text", "email", "username"].includes(element.type) &&
        element.value.trim().length > 0,
    );

    try {
      return {
        origin: new URL(frameBaseUrl).origin,
        username: usernameField?.value.trim() ?? "",
        password: passwordField.value,
      };
    } catch {
      return null;
    }
  }

  function normalizeProxyNavigationUrl(
    rawValue: string | URL | null | undefined,
    baseUrl: string,
  ) {
    const value =
      typeof rawValue === "string"
        ? rawValue.trim()
        : rawValue instanceof URL
          ? rawValue.toString()
          : "";
    if (!value || value.startsWith("#") || value.startsWith("javascript:")) {
      return null;
    }

    let candidate = value;
    for (let depth = 0; depth < 8; depth += 1) {
      try {
        const url = new URL(candidate, baseUrl);
        if (
          url.origin === window.location.origin &&
          url.pathname.startsWith("/scramjet/")
        ) {
          const innerValue = decodeURIComponent(
            url.pathname.slice("/scramjet/".length),
          );
          if (/^(https?:|blob:|data:|about:|mailto:)/i.test(innerValue)) {
            candidate = innerValue;
            continue;
          }
          candidate = new URL(innerValue, baseUrl).href;
          continue;
        }
      } catch {
        break;
      }
      break;
    }

    try {
      return new URL(candidate, baseUrl).href;
    } catch {
      return candidate;
    }
  }

function normalizeFrameCompareUrl(value: string) {
  try {
    const url = new URL(value);
    const pathname = url.pathname.replace(/\/$/, "") || "/";
    return `${url.protocol}//${url.hostname.replace(/^www\./, "").toLowerCase()}${pathname}${url.search}`;
  } catch {
    return value.trim().toLowerCase();
  }
}

  const buildBlockedAuthUrl = useCallback((targetUrl: string) => {
    return `nova://auth-blocked?target=${encodeURIComponent(targetUrl)}&source=${encodeURIComponent(tabUrlRef.current)}`;
  }, []);

  function shouldBlockEmbeddedAuth(targetUrl: string) {
    try {
      const normalized = new URL(targetUrl);
      return normalized.hostname === "accounts.google.com";
    } catch {
      return targetUrl.includes("accounts.google.com");
    }
  }

  function resolveFrameLocation(frame: HTMLIFrameElement) {
    const href = frame.contentWindow?.location.href;
    if (!href) return null;
    try {
      const current = new URL(href);
      if (current.origin === window.location.origin) {
        if (current.pathname.startsWith("/scramjet/")) {
          const encodedTarget = `${current.pathname.slice("/scramjet/".length)}${current.search}${current.hash}`;
          const decodedTarget = decodeURIComponent(encodedTarget);
          if (
            /\/scramjet\/https?%3A/i.test(decodedTarget) ||
            decodedTarget.startsWith(`${window.location.origin}/scramjet/`)
          ) {
            return null;
          }
          return decodedTarget;
        }

        // Ignore proxy-shell and browser-error URLs when browsing external sites.
        if (!tabUrlRef.current.startsWith(window.location.origin)) {
          return null;
        }
      }
      return current.href;
    } catch {
      return href;
    }
  }

  const buildFormTargetUrl = useCallback((form: HTMLFormElement, frameWindow: Window) => {
    const frameBaseUrl =
      (frameRef.current?.frame && resolveFrameLocation(frameRef.current.frame)) ||
      tabUrlRef.current;
    const action =
      form.getAttribute("action") || frameBaseUrl;
    const resolvedUrl = normalizeProxyNavigationUrl(action, frameBaseUrl);
    if (!resolvedUrl) return null;

    const method = (form.method || "GET").toUpperCase();
    if (method !== "GET") {
      return resolvedUrl;
    }

    const nextUrl = new URL(resolvedUrl);
    const formData = new frameWindow.FormData(form);
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string") {
        nextUrl.searchParams.append(key, value);
      }
    }
    return nextUrl.href;
  }, []);

  const installPopupBridge = useCallback((frame: HTMLIFrameElement) => {
    const frameWindow = frame.contentWindow;
    const frameDocument = frameWindow?.document;
    if (!frameWindow || !frameDocument) return;
    const targetBaseUrl = resolveFrameLocation(frame) || tabUrlRef.current;
    const originalOpen = frameWindow.open.bind(frameWindow);
    const originalAlert = frameWindow.alert?.bind(frameWindow);
    const originalNotification = frameWindow.Notification;
    const mediaObserver = new frameWindow.MutationObserver(() => {
      applyTabMuteState(frameDocument, Boolean(tabIsMutedRef.current));
    });
    const routeWindowTarget = (
      target: string | undefined,
      url: string,
      titleHint?: string,
    ) => {
      if (shouldBlockEmbeddedAuth(url)) {
        onNavigateRef.current(buildBlockedAuthUrl(url));
        return frameWindow;
      }
      const normalizedTarget = (target || "_blank").toLowerCase();
      if (
        normalizedTarget === "_self" ||
        normalizedTarget === "_top" ||
        normalizedTarget === "_parent"
      ) {
        onNavigateRef.current(url);
        return frameWindow;
      }

      onOpenInNewTabRef.current(url, titleHint);
      return frameWindow;
    };

    const openOverride: typeof frameWindow.open = (
      url,
      target,
      features,
    ) => {
      const normalizedUrl = normalizeProxyNavigationUrl(
        typeof url === "string" || url instanceof URL ? url : null,
        targetBaseUrl,
      );
      if (!normalizedUrl) {
        return originalOpen(url, target, features);
      }
      return routeWindowTarget(target ?? "_blank", normalizedUrl, frameDocument.title);
    };

    try {
      Object.defineProperty(frameWindow, "open", {
        configurable: true,
        writable: true,
        value: openOverride,
      });
    } catch {
      try {
        frameWindow.open = openOverride;
      } catch {
        // Ignore pages that lock down window.open.
      }
    }

    const handleClick = (event: MouseEvent) => {
      const path =
        typeof event.composedPath === "function" ? event.composedPath() : [];
      const candidate = path.find((node) => {
        if (!node || typeof node !== "object" || !("tagName" in node)) return false;
        return String((node as Element).tagName).toLowerCase() === "a";
      });
      const fallbackTarget = event.target;
      const element =
        candidate ??
        (fallbackTarget &&
        typeof fallbackTarget === "object" &&
        "closest" in fallbackTarget &&
        typeof fallbackTarget.closest === "function"
          ? fallbackTarget.closest("a[href]")
          : null);

      if (!element || !("tagName" in element) || String(element.tagName).toLowerCase() !== "a") {
        return;
      }
      const anchor = element as HTMLAnchorElement;

      const normalizedUrl = normalizeProxyNavigationUrl(
        anchor.getAttribute("href") || anchor.href,
        targetBaseUrl,
      );
      if (!normalizedUrl) return;

      if (shouldBlockEmbeddedAuth(normalizedUrl)) {
        event.preventDefault();
        event.stopPropagation();
        onNavigateRef.current(buildBlockedAuthUrl(normalizedUrl));
        return;
      }

      const target = (anchor.target || "").toLowerCase();
      if (target !== "_blank" && target !== "_new") return;

      event.preventDefault();
      event.stopPropagation();
      onOpenInNewTabRef.current(
        normalizedUrl,
        anchor.textContent?.trim() || frameDocument.title,
      );
    };

    const handlePointerDown = (event: MouseEvent) => {
      if (event.button === 2) return;
      onFramePointerDownRef.current();
    };

    const handleSubmit = (event: SubmitEvent) => {
      const target = event.target;
      if (!(target instanceof frameWindow.HTMLFormElement)) return;
      const capturedPassword = extractPasswordEntry(target, frameWindow, targetBaseUrl);
      if (capturedPassword) {
        onPasswordCaptureRef.current(capturedPassword);
      }

      const targetName = (target.target || "").toLowerCase();
      if (targetName !== "_blank" && targetName !== "_new") return;

      const normalizedUrl = buildFormTargetUrl(target, frameWindow);
      if (!normalizedUrl) return;

      if (shouldBlockEmbeddedAuth(normalizedUrl)) {
        event.preventDefault();
        event.stopPropagation();
        onNavigateRef.current(buildBlockedAuthUrl(normalizedUrl));
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      onOpenInNewTabRef.current(normalizedUrl, frameDocument.title);
    };

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
      onFrameContextMenuRef.current(
        buildFrameContextMenuPayload(event.target, targetBaseUrl, event.clientX, event.clientY),
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (onFrameShortcutRef.current(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const handleFullscreenChange = () => {
      if (frameDocument.fullscreenElement) {
        onFrameFullscreenRequestRef.current();
      }
    };

    const notifyWebsiteMessage = (
      kind: "notification" | "alert",
      title: string,
      message: string,
    ) => {
      onFrameWebsiteMessageRef.current({
        tabId: tabIdRef.current,
        kind,
        title,
        message,
        url: resolveFrameLocation(frame) || targetBaseUrl,
      });
    };

    const alertOverride: typeof frameWindow.alert = (message?: string) => {
      notifyWebsiteMessage(
        "alert",
        frameDocument.title || titleFromUrl(targetBaseUrl),
        typeof message === "string" ? message : String(message ?? ""),
      );
    };

    const requestPermission = async () => {
      const permission = tabIsMutedRef.current ? "denied" : "granted";
      return permission as NotificationPermission;
    };

    const notificationOverride = function NotificationOverride(
      this: unknown,
      title: string,
      options?: NotificationOptions,
    ) {
      notifyWebsiteMessage(
        "notification",
        title || frameDocument.title || titleFromUrl(targetBaseUrl),
        options?.body || "",
      );
      return {
        close() {},
        onclick: null,
        onclose: null,
        onerror: null,
        onshow: null,
        title,
        body: options?.body || "",
        tag: options?.tag || "",
      };
    } as unknown as typeof Notification;

    Object.defineProperty(notificationOverride, "permission", {
      configurable: true,
      get: () => (tabIsMutedRef.current ? "denied" : "granted"),
    });
    Object.defineProperty(notificationOverride, "requestPermission", {
      configurable: true,
      value: requestPermission,
    });

    try {
      Object.defineProperty(frameWindow, "alert", {
        configurable: true,
        writable: true,
        value: alertOverride,
      });
    } catch {
      try {
        frameWindow.alert = alertOverride;
      } catch {
        // Ignore locked alert override.
      }
    }

    try {
      Object.defineProperty(frameWindow, "Notification", {
        configurable: true,
        writable: true,
        value: notificationOverride,
      });
    } catch {
      try {
        (frameWindow as Window & { Notification?: typeof Notification }).Notification =
          notificationOverride;
      } catch {
        // Ignore locked Notification override.
      }
    }

    frameDocument.addEventListener("mousedown", handlePointerDown, true);
    frameDocument.addEventListener("click", handleClick, true);
    frameDocument.addEventListener("submit", handleSubmit, true);
    frameDocument.addEventListener("contextmenu", handleContextMenu, true);
    frameDocument.addEventListener("keydown", handleKeyDown, true);
    frameDocument.addEventListener("fullscreenchange", handleFullscreenChange);
    if (frameDocument.documentElement) {
      mediaObserver.observe(frameDocument.documentElement, {
        childList: true,
        subtree: true,
      });
    }
    applyTabMuteState(frameDocument, Boolean(tabIsMutedRef.current));
    cleanupBridgeRef.current = () => {
      frameDocument.removeEventListener("mousedown", handlePointerDown, true);
      frameDocument.removeEventListener("click", handleClick, true);
      frameDocument.removeEventListener("submit", handleSubmit, true);
      frameDocument.removeEventListener("contextmenu", handleContextMenu, true);
      frameDocument.removeEventListener("keydown", handleKeyDown, true);
      frameDocument.removeEventListener("fullscreenchange", handleFullscreenChange);
      mediaObserver.disconnect();
      try {
        Object.defineProperty(frameWindow, "open", {
          configurable: true,
          writable: true,
          value: originalOpen,
        });
      } catch {
        try {
          frameWindow.open = originalOpen;
        } catch {
          // Ignore pages that lock down window.open.
        }
      }
      try {
        Object.defineProperty(frameWindow, "alert", {
          configurable: true,
          writable: true,
          value: originalAlert,
        });
      } catch {
        try {
          frameWindow.alert = originalAlert;
        } catch {
          // Ignore pages that lock down alert.
        }
      }
      try {
        Object.defineProperty(frameWindow, "Notification", {
          configurable: true,
          writable: true,
          value: originalNotification,
        });
      } catch {
        try {
          (frameWindow as Window & { Notification?: typeof Notification }).Notification =
            originalNotification;
        } catch {
          // Ignore pages that lock down Notification.
        }
      }
    };
  }, [buildBlockedAuthUrl, buildFormTargetUrl, tab.id]);

  useEffect(() => {
    const containerNode = containerRef.current;
    if (!transportConfig || !containerNode || frameRef.current) return;
    void (async () => {
      try {
        const controller = await getScramjetController(transportConfig);
        frameRef.current = controller.createFrame();
        frameRef.current.frame.className = "w-full h-full border-0";
        containerNode.replaceChildren(frameRef.current.frame);
        onScramjetError(null);
        if (tab.url !== "newtab") {
          lastReadyStateRef.current = null;
          lastReportedUrlRef.current = null;
          lastReportedTitleRef.current = null;
          onLoadingChangeRef.current(tab.id, true);
          frameRef.current.go(tab.url);
          readyUrlRef.current = tab.url;
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Scramjet failed to initialize.";
        onScramjetError(message);
      }
    })();
    return () => {
      cleanupBridgeRef.current?.();
      cleanupBridgeRef.current = null;
      bridgedDocumentRef.current = null;
      if (frameRef.current?.frame.parentElement === containerNode) {
        containerNode.replaceChildren();
      }
      frameRef.current = null;
    };
  }, [onScramjetError, tab.id, transportConfig]);

  useEffect(() => {
    if (!frameRef.current || tab.url === "newtab") return;
    if (readyUrlRef.current === tab.url) return;
    lastReadyStateRef.current = null;
    lastReportedUrlRef.current = null;
    lastReportedTitleRef.current = null;
    onLoadingChangeRef.current(tab.id, true);
    frameRef.current.go(tab.url);
    readyUrlRef.current = tab.url;
  }, [tab.url]);

  useEffect(() => {
    const frame = frameRef.current?.frame;
    const frameDocument = frame?.contentDocument;
    if (!frameDocument) return;
    applyDarkReaderStyle(frameDocument, darkReaderEnabled);
  }, [darkReaderEnabled]);

  useEffect(() => {
    const frame = frameRef.current?.frame;
    const frameDocument = frame?.contentDocument;
    if (!frameDocument) return;
    applyTabMuteState(frameDocument, Boolean(tab.isMuted));
  }, [tab.isMuted]);

  useEffect(() => {
    if (!frameRef.current || !tab.reloadToken) return;
    if (lastReloadTokenRef.current === tab.reloadToken) return;
    lastReloadTokenRef.current = tab.reloadToken;
    lastReadyStateRef.current = null;
    lastReportedUrlRef.current = null;
    lastReportedTitleRef.current = null;
    onLoadingChangeRef.current(tab.id, true);
    frameRef.current.reload();
  }, [tab.reloadToken]);

  useEffect(() => {
    const inspectFrame = () => {
      const frame = frameRef.current?.frame;
      const frameDocument = frame?.contentDocument;
      if (!frame || !frameDocument) {
        return;
      }

      const readyState = frameDocument.readyState;
      const hasRenderableBody = Boolean(frameDocument.body?.childNodes.length);
      const liveUrl = resolveFrameLocation(frame);
      const previousObservedLiveUrl = lastObservedLiveUrlRef.current;
      if (liveUrl && liveUrl !== "about:blank") {
        lastObservedLiveUrlRef.current = liveUrl;
      }
      if (readyState !== lastReadyStateRef.current) {
        lastReadyStateRef.current = readyState;
        if (readyState === "loading") {
          onLoadingChangeRef.current(tab.id, true);
        }
      }
      if (
        isActive &&
        liveUrl &&
        liveUrl !== "about:blank" &&
        frameDocument.title !== "Scramjet" &&
        !(
          previousObservedLiveUrl &&
          normalizeFrameCompareUrl(liveUrl) === normalizeFrameCompareUrl(previousObservedLiveUrl) &&
          normalizeFrameCompareUrl(liveUrl) !== normalizeFrameCompareUrl(tabUrlRef.current)
        ) &&
        (
          liveUrl !== lastReportedUrlRef.current ||
          frameDocument.title !== lastReportedTitleRef.current
        )
      ) {
        lastReportedUrlRef.current = liveUrl;
        lastReportedTitleRef.current = frameDocument.title;
        onFrameNavigateRef.current(tab.id, liveUrl, frameDocument.title);
      }
      if (readyState === "interactive" || readyState === "complete" || hasRenderableBody) {
        onLoadingChangeRef.current(tab.id, false);
      }

      if (bridgedDocumentRef.current === frameDocument) {
        return;
      }

      bridgedDocumentRef.current = frameDocument;
      cleanupBridgeRef.current?.();
      cleanupBridgeRef.current = null;
      installPopupBridge(frame);
      applyDarkReaderStyle(frameDocument, darkReaderEnabled);
      if (erudaEnabledRef.current) {
        void injectEruda(frame);
      }
    };

    inspectFrame();
    const interval = window.setInterval(inspectFrame, 50);

    return () => {
      window.clearInterval(interval);
      cleanupBridgeRef.current?.();
      cleanupBridgeRef.current = null;
      bridgedDocumentRef.current = null;
      lastReportedUrlRef.current = null;
      lastReportedTitleRef.current = null;
    };
  }, [darkReaderEnabled, installPopupBridge, isActive, tab.id]);

  useEffect(() => {
    const frame = frameRef.current?.frame;
    if (!frame || inspectRequestToken === 0) return;
    if (lastInspectTokenRef.current === inspectRequestToken) return;
    lastInspectTokenRef.current = inspectRequestToken;
    void injectEruda(frame).then((ok) => {
      if (!ok) {
        onInspectErudaFailedRef.current?.(
          "Inspect could not load on this page (some sites block scripts inside the tab frame).",
        );
      }
    });
  }, [inspectRequestToken]);

  const bindFrameHost = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
    },
    [],
  );

  useLayoutEffect(() => {
    if (!onRegisterTabFullscreenHost) return;
    if (isActive) {
      onRegisterTabFullscreenHost(containerRef.current);
      return () => onRegisterTabFullscreenHost(null);
    }
    return undefined;
  }, [isActive, onRegisterTabFullscreenHost, tab.id]);

  return <div ref={bindFrameHost} className="h-full w-full min-h-0" />;
};
