import type { KeyboardShortcut } from "@/types/browser";

/** Cmd+R / Ctrl+R reload; Cmd+Shift+T / Ctrl+Shift+T restore closed tab (matches most browsers). */
export function tryStandardBrowserShortcuts(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "shiftKey" | "altKey" | "metaKey" | "preventDefault">,
  actions: { reload: () => void; restoreClosedTab: () => void },
): boolean {
  const mac = isMacLikePlatform();
  const keyLower = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (mac) {
    if (event.metaKey && !event.ctrlKey && !event.altKey && keyLower === "r") {
      event.preventDefault();
      actions.reload();
      return true;
    }
    if (event.metaKey && event.shiftKey && !event.ctrlKey && !event.altKey && keyLower === "t") {
      event.preventDefault();
      actions.restoreClosedTab();
      return true;
    }
  } else {
    if (event.ctrlKey && !event.metaKey && !event.altKey && keyLower === "r") {
      event.preventDefault();
      actions.reload();
      return true;
    }
    if (event.ctrlKey && event.shiftKey && !event.metaKey && !event.altKey && keyLower === "t") {
      event.preventDefault();
      actions.restoreClosedTab();
      return true;
    }
  }
  return false;
}

export function isMacLikePlatform() {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const userAgentDataPlatform =
    typeof nav.userAgentData?.platform === "string" ? nav.userAgentData.platform : "";
  const platform = typeof nav.platform === "string" ? nav.platform : "";
  const userAgent = typeof nav.userAgent === "string" ? nav.userAgent : "";
  const detectedPlatform = `${userAgentDataPlatform} ${platform} ${userAgent}`;
  return /Mac|iPhone|iPad|iPod/i.test(detectedPlatform);
}

/**
 * Primary modifier for Nova shortcuts: avoids OS/browser reserved combos.
 * — macOS: use Ctrl (not Cmd) so Cmd+T/W/R stay with the system.
 * — Windows/Linux: use Alt so Ctrl+T/W/R match typical browser/OS behavior less often.
 */
export function primaryModifierKey() {
  return isMacLikePlatform() ? "Ctrl" : "Alt";
}

export function primaryModifierLabel() {
  return isMacLikePlatform() ? "Ctrl" : "Alt";
}

export function shortcutPlatformLabel() {
  return isMacLikePlatform() ? "Mac" : "Windows/Chromebook";
}

export function standardBrowserShortcutLabel() {
  return isMacLikePlatform() ? "⌘R / ⌘⇧T" : "Ctrl+R / Ctrl+Shift+T";
}

export function buildDefaultKeyboardShortcuts(primary = primaryModifierKey()): KeyboardShortcut[] {
  return [
    { id: "1", action: "new-tab", label: "New Tab", keys: `${primary}+T`, isDefault: true },
    { id: "2", action: "close-tab", label: "Close Tab", keys: `${primary}+W`, isDefault: true },
    { id: "3", action: "reload-tab", label: "Reload Tab", keys: `${primary}+R`, isDefault: true },
    { id: "12", action: "restore-closed-tab", label: "Restore Closed Tab", keys: `${primary}+Shift+T`, isDefault: true },
    { id: "4", action: "settings", label: "Settings", keys: "Alt+.", isDefault: true },
    { id: "5", action: "history", label: "History", keys: `${primary}+H`, isDefault: true },
    { id: "6", action: "home", label: "Home", keys: "Alt+Home", isDefault: true },
    { id: "7", action: "bookmarks", label: "Bookmarks", keys: `${primary}+B`, isDefault: true },
    { id: "8", action: "inspect", label: "Inspect", keys: `${primary}+Shift+I`, isDefault: true },
    { id: "10", action: "back", label: "Back", keys: "Alt+ArrowLeft", isDefault: true },
    { id: "11", action: "forward", label: "Forward", keys: "Alt+ArrowRight", isDefault: true },
  ];
}
