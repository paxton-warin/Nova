import { describe, expect, it } from "vitest";

import { buildDefaultKeyboardShortcuts } from "@/lib/shortcuts";

describe("buildDefaultKeyboardShortcuts", () => {
  it("includes the expected default actions", () => {
    const shortcuts = buildDefaultKeyboardShortcuts("Alt");

    expect(shortcuts.map((entry) => entry.action)).toEqual([
      "new-tab",
      "close-tab",
      "reload-tab",
      "restore-closed-tab",
      "settings",
      "history",
      "home",
      "bookmarks",
      "inspect",
      "back",
      "forward",
    ]);
  });

  it("uses the provided primary modifier", () => {
    const shortcuts = buildDefaultKeyboardShortcuts("Ctrl");

    expect(shortcuts.find((entry) => entry.action === "new-tab")?.keys).toBe("Ctrl+T");
    expect(shortcuts.find((entry) => entry.action === "reload-tab")?.keys).toBe("Ctrl+R");
    expect(shortcuts.find((entry) => entry.action === "restore-closed-tab")?.keys).toBe("Ctrl+Shift+T");
  });
});
