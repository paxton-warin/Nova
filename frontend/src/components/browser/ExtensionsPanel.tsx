import React from "react";
import { ArrowLeft, Globe2, Moon, Puzzle, Shield, X } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { BrowserSettings, ProxyLocationOption, TransportConfig } from "@/types/browser";

interface ExtensionsPanelProps {
  settings: BrowserSettings;
  proxyLocations: ProxyLocationOption[];
  transportConfig?: TransportConfig | null;
  onUpdateSettings: (value: Partial<BrowserSettings>) => void;
  onProxyLocationChange: (locationId: string) => void;
  onBack?: () => void;
  onClose: () => void;
}

export const ExtensionsPanel: React.FC<ExtensionsPanelProps> = ({
  settings,
  proxyLocations,
  transportConfig,
  onUpdateSettings,
  onProxyLocationChange,
  onBack,
  onClose,
}) => {
  const extensionItems = [
    {
      id: "adShield",
      name: "Ad Shield",
      description: "Safe browsing",
      enabled: settings.extensions.adShield,
      icon: Shield,
      toggle: (checked: boolean) =>
        onUpdateSettings({
          safeBrowsing: checked,
          extensions: { ...settings.extensions, adShield: checked },
        }),
    },
    {
      id: "darkReader",
      name: "Dark Reader",
      description: "Darken bright pages",
      enabled: settings.extensions.darkReader,
      icon: Moon,
      toggle: (checked: boolean) =>
        onUpdateSettings({
          extensions: { ...settings.extensions, darkReader: checked },
        }),
    },
  ];

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

  return (
    <div className="w-80 border-l border-border bg-card flex flex-col h-full animate-panel-in">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          {onBack ? (
            <button
              onClick={onBack}
              className="p-1 rounded hover:bg-chrome-hover transition-colors"
              title="Back"
              aria-label="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          ) : null}
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Puzzle className="w-4 h-4" />
            Utilities
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-chrome-hover transition-colors"
          title="Close utilities"
          aria-label="Close utilities"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <div className="rounded-xl border border-border bg-background/60 p-4">
          <div className="flex items-start gap-3">
            <div className="h-12 w-12 shrink-0 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Globe2 className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Exit location</div>
              <div className="text-xs text-muted-foreground mt-1">Choose the proxy region.</div>
            </div>
          </div>
          <div className="mt-4">
            {hasProxyLocations ? (
              <>
                <Select
                  value={settings.proxyLocation}
                  onValueChange={(value) => {
                    onProxyLocationChange(value);
                  }}
                >
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
                <div className="mt-3 rounded-lg border border-border/70 bg-card/40 px-3 py-3 text-xs text-muted-foreground">
                  <div className="font-medium text-foreground">{proxyStatusText}</div>
                  <div className="mt-1">
                    Selected: {selectedLocation?.label ?? settings.proxyLocation}
                    {activeLocationId !== settings.proxyLocation
                      ? ` • Active fallback: ${activeLocation?.label ?? activeLocationId}`
                      : ""}
                  </div>
                </div>
                {transportConfig?.proxyWarning ? (
                  <div className="mt-3 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-3 text-xs text-amber-100">
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
        </div>

        {extensionItems.map((ext) => (
          <div
            key={ext.id}
            className="rounded-xl border border-border bg-background/60 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="h-12 w-12 shrink-0 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <ext.icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-sm font-medium">{ext.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {ext.description}
                  </div>
                </div>
              </div>
              <Switch checked={ext.enabled} onCheckedChange={ext.toggle} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
