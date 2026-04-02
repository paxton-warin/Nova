import React, { useMemo, useState } from "react";
import { ArrowLeft, X, Trash2, Clock, Search, Globe } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { HistoryEntry } from "@/types/browser";

interface HistoryPanelProps {
  history: HistoryEntry[];
  onNavigate: (url: string) => void;
  onClear: () => void;
  onRemoveEntry: (id: string) => void;
  onBack?: () => void;
  onClose: () => void;
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({
  history,
  onNavigate,
  onClear,
  onRemoveEntry,
  onBack,
  onClose,
}) => {
  const [query, setQuery] = useState("");
  const [confirmMode, setConfirmMode] = useState<"clear" | string | null>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredHistory = useMemo(
    () =>
      history.filter(
        (entry) =>
          !normalizedQuery ||
          entry.title.toLowerCase().includes(normalizedQuery) ||
          entry.url.toLowerCase().includes(normalizedQuery) ||
          (entry.category ?? "").toLowerCase().includes(normalizedQuery),
      ),
    [history, normalizedQuery],
  );

  const formatHost = (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  };

  const confirmClearAll = () => {
    if (history.length === 0) {
      onClear();
      return;
    }
    setConfirmMode("clear");
  };

  return (
    <div className="flex h-full w-80 animate-panel-in flex-col border-l border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          {onBack ? (
            <button
              onClick={onBack}
              className="rounded p-1 transition-colors hover:bg-chrome-hover"
              title="Back"
              aria-label="Back"
              type="button"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : null}
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Clock className="h-4 w-4" /> History
          </h2>
        </div>
        <div className="flex gap-1">
          <button
            onClick={confirmClearAll}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-chrome-hover hover:text-destructive"
            title="Clear all history"
            aria-label="Clear all history"
            type="button"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            className="rounded p-1 transition-colors hover:bg-chrome-hover"
            title="Close history"
            aria-label="Close history"
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-background/70 px-3 py-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search history"
            className="flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
          />
          <div className="text-[10px] text-muted-foreground">{filteredHistory.length}</div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {history.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Clock className="h-5 w-5" />
            </div>
            <div className="text-sm font-medium">No history yet</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Pages you visit will show up here for quick backtracking.
            </div>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="text-sm font-medium">No matching history</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Try searching by page title, site, or category.
            </div>
          </div>
        ) : (
          filteredHistory.map((entry, i) => (
            <div
              key={entry.id}
              className="flex animate-fade-up items-stretch gap-0 border-b border-border/50 transition-colors hover:bg-chrome-hover"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <button
                type="button"
                onClick={() => onNavigate(entry.url)}
                className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3 text-left"
              >
                <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-muted">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{entry.title}</div>
                  <div className="mt-1 truncate text-[11px] text-muted-foreground">
                    {formatHost(entry.url)}
                    {entry.category ? ` • ${entry.category}` : ""}
                  </div>
                  <div className="mt-1 truncate text-[10px] text-muted-foreground">
                    {new Date(entry.timestamp).toLocaleString()}
                  </div>
                </div>
              </button>
              <button
                type="button"
                title="Remove from history"
                aria-label="Remove from history"
                className="shrink-0 px-3 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setConfirmMode(entry.id)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))
        )}
      </div>
      <AlertDialog open={confirmMode !== null} onOpenChange={(open) => !open && setConfirmMode(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmMode === "clear" ? "Clear all history?" : "Remove this history entry?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmMode === "clear"
                ? "This removes your visible browsing history list and cannot be undone."
                : "This removes the selected history row from the list."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmMode === "clear") {
                  onClear();
                } else if (confirmMode) {
                  onRemoveEntry(confirmMode);
                }
                setConfirmMode(null);
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
