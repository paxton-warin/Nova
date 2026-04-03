import React, { useMemo, useState } from "react";
import { ArrowLeft, Keyboard, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildDefaultKeyboardShortcuts, primaryModifierLabel } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import type { BrowserSettings } from "@/types/browser";

interface KeybindManagerPanelProps {
  settings: BrowserSettings;
  onUpdateSettings: (value: Partial<BrowserSettings>) => void;
  onBack?: () => void;
  onClose: () => void;
}

function normalizeShortcutKey(value: string) {
  switch (value) {
    case " ":
      return "Space";
    default:
      return value.length === 1 ? value.toUpperCase() : value;
  }
}

export const KeybindManagerPanel: React.FC<KeybindManagerPanelProps> = ({
  settings,
  onUpdateSettings,
  onBack,
  onClose,
}) => {
  const [capturingShortcutId, setCapturingShortcutId] = useState<string | null>(null);

  const shortcuts = useMemo(() => settings.shortcuts, [settings.shortcuts]);

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
    const fallback = settings.shortcuts.find((shortcut) => shortcut.id === id);
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
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-primary" />
            Keybind Manager
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-muted transition-colors active:scale-95"
          title="Close keybind manager"
          aria-label="Close keybind manager"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
        <section className="rounded-2xl border border-border bg-card p-4 space-y-4">
          <div className="rounded-xl border border-border bg-background/60 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            Nova starts with <span className="text-foreground">{primaryModifierLabel()}</span> as the main
            in-app shortcut key. Switch presets below, then customize any combo you want.
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" onClick={() => applyShortcutPreset("Ctrl")}>
              Use Ctrl defaults
            </Button>
            <Button type="button" variant="secondary" onClick={() => applyShortcutPreset("Alt")}>
              Use Alt defaults
            </Button>
          </div>
          <div className="space-y-3">
            {shortcuts.map((shortcut) => (
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
                  {shortcut.isDefault ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => resetShortcut(shortcut.id)}
                    >
                      Reset
                    </Button>
                  ) : null}
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
                {capturingShortcutId === shortcut.id ? (
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
                ) : null}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
