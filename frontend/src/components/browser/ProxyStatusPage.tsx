import React from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ProxyStatusPageProps {
  url: string;
  onNavigate: (url: string) => void;
}

function parseStatusUrl(url: string) {
  try {
    const parsed = new URL(url.replace("nova://", "https://nova.local/"));
    return {
      kind: parsed.pathname.replace(/^\//, ""),
      target: parsed.searchParams.get("target") ?? "",
      source: parsed.searchParams.get("source") ?? "",
    };
  } catch {
    return {
      kind: "error",
      target: "",
      source: "",
    };
  }
}

function formatTargetUrl(target: string) {
  if (!target) return "accounts.google.com";
  try {
    const parsed = new URL(target);
    return parsed.toString();
  } catch {
    return target;
  }
}

export const ProxyStatusPage: React.FC<ProxyStatusPageProps> = ({
  url,
  onNavigate,
}) => {
  const status = parseStatusUrl(url);

  if (status.kind === "auth-blocked") {
    return (
      <div className="flex h-full items-center justify-center bg-background p-8">
        <div className="max-w-xl rounded-3xl border border-border bg-card p-8 shadow-2xl">
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
            <div className="mt-2 break-all text-foreground">{formatTargetUrl(status.target)}</div>
          </div>
          <div className="mt-6 flex gap-3">
            <Button variant="secondary" onClick={() => onNavigate(status.source || "https://youtube.com")}>
              Return to previous page
            </Button>
            <Button onClick={() => onNavigate("newtab")}>Open a fresh tab</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center bg-background p-8">
      <div className="max-w-lg rounded-3xl border border-border bg-card p-8 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/15">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <div>
            <div className="text-lg font-semibold">This page could not be shown</div>
          </div>
        </div>
        <Button onClick={() => onNavigate("newtab")}>Back to new tab</Button>
      </div>
    </div>
  );
};
