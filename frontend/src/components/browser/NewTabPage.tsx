import React, { useEffect, useRef, useState } from 'react';
import { AppWindow, Bookmark, Compass, CornerDownLeft, Gamepad2, LifeBuoy, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchSearchSuggestions } from '@/lib/searchSuggestions';
import type { Bookmark as BrowserBookmark, Shortcut } from '@/types/browser';

interface NewTabPageProps {
  shortcuts: Shortcut[];
  bookmarks: BrowserBookmark[];
  onAddShortcut: (shortcut: Omit<Shortcut, "id" | "favicon"> & { favicon?: string }) => void;
  onUpdateShortcut: (id: string, patch: Partial<Shortcut>) => void;
  onMoveShortcut: (id: string, targetIndex: number) => void;
  onRemoveShortcut: (id: string) => void;
  onNavigate: (url: string) => void;
  searchEngine: string;
  searchSuggestions: boolean;
  backgroundUrl: string;
  /** Opens the user Tickets panel (e.g. from the message bay). */
  onOpenTickets?: () => void;
}

const SEARCH_ENGINES: Record<string, string> = {
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
  yahoo: 'https://search.yahoo.com/search?p=',
};
const NOVA_VERSION = 'v1.0.0';

export const NewTabPage: React.FC<NewTabPageProps> = ({
  shortcuts,
  bookmarks,
  onAddShortcut,
  onUpdateShortcut,
  onMoveShortcut,
  onRemoveShortcut,
  onNavigate,
  searchEngine,
  searchSuggestions,
  backgroundUrl,
  onOpenTickets,
}) => {
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [manageShortcuts, setManageShortcuts] = useState(false);
  const [newShortcutTitle, setNewShortcutTitle] = useState('');
  const [newShortcutUrl, setNewShortcutUrl] = useState('');
  const [draggingShortcutId, setDraggingShortcutId] = useState<string | null>(null);
  const [dragOverShortcutId, setDragOverShortcutId] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const searchAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (suggestions.length === 0) return;
      const root = searchAreaRef.current;
      if (!root) return;
      const target = event.target as Node | null;
      if (target && root.contains(target)) return;
      setSuggestions([]);
      setActiveSuggestion(-1);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [suggestions.length]);

  useEffect(() => {
    if (!searchSuggestions) {
      setSuggestions([]);
      setActiveSuggestion(-1);
      return;
    }

    const trimmed = search.trim();
    if (trimmed.length < 1 || /^https?:\/\//i.test(trimmed)) {
      setSuggestions([]);
      setActiveSuggestion(-1);
      return;
    }

    const requestId = ++requestIdRef.current;
    const timer = window.setTimeout(async () => {
      const nextSuggestions = await fetchSearchSuggestions(trimmed);
      if (requestId !== requestIdRef.current) return;
      setSuggestions(nextSuggestions);
      setActiveSuggestion(-1);
    }, 180);

    return () => window.clearTimeout(timer);
  }, [search, searchSuggestions]);

  const handleSearch = (value = search) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (trimmed.includes('.') || trimmed.startsWith('http')) {
      onNavigate(trimmed);
    } else {
      onNavigate(SEARCH_ENGINES[searchEngine] + encodeURIComponent(trimmed));
    }
    setSuggestions([]);
    setActiveSuggestion(-1);
  };

  const canAddShortcut = shortcuts.length < 10;

  return (
    <div
      className="flex h-full min-h-0 flex-col items-center justify-start overflow-y-auto overflow-x-hidden p-4 sm:p-5"
      style={
        backgroundUrl
          ? {
              backgroundImage: `url(${backgroundUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }
          : undefined
      }
    >
      <div
        className={cn(
          "my-auto flex w-full min-w-0 max-w-5xl flex-col items-center gap-5 rounded-[2rem] p-4 py-3 sm:gap-6 sm:p-5",
          backgroundUrl ? "bg-background/55 backdrop-blur-xl" : "",
        )}
      >
        <div className="animate-fade-up text-center" style={{ animationDelay: '0ms' }}>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            <span className="text-primary">Nova</span>
            <span className="text-muted-foreground font-light ml-1">Browser</span>
          </h1>
          <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            {NOVA_VERSION} · Created by Paxton Warin
          </div>
        </div>

        <div
          ref={searchAreaRef}
          className="relative z-20 w-full animate-fade-up"
          style={{ animationDelay: '80ms' }}
        >
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2.5 transition-all focus-within:ring-1 focus-within:ring-primary/50">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' && suggestions.length > 0) {
                  e.preventDefault();
                  setActiveSuggestion((value) => (value + 1) % suggestions.length);
                  return;
                }
                if (e.key === 'ArrowUp' && suggestions.length > 0) {
                  e.preventDefault();
                  setActiveSuggestion((value) => (value <= 0 ? suggestions.length - 1 : value - 1));
                  return;
                }
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSearch(activeSuggestion >= 0 ? suggestions[activeSuggestion] : search);
                }
                if (e.key === 'Escape') {
                  setSuggestions([]);
                  setActiveSuggestion(-1);
                }
              }}
              placeholder="Search the web..."
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            <button
              onClick={() => handleSearch()}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Go
            </button>
          </div>
          {suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-y-auto overflow-x-hidden rounded-xl border border-border bg-card shadow-xl backdrop-blur-sm">
              {suggestions.map((suggestion, index) => (
                <button
                  key={`${suggestion}-${index}`}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setSearch(suggestion);
                    handleSearch(suggestion);
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors',
                    activeSuggestion === index ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/70'
                  )}
                >
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">{suggestion}</span>
                </button>
              ))}
            </div>
          )}
          <div className="mt-2 flex items-center justify-between gap-3 px-1 text-[11px] text-muted-foreground">
            <div>
              Searching with <span className="text-foreground">{searchEngine}</span>
            </div>
            <div className="inline-flex items-center gap-1">
              <CornerDownLeft className="h-3 w-3" />
              Press Enter to browse
            </div>
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center justify-center gap-2.5 animate-fade-up" style={{ animationDelay: '120ms' }}>
          <button
            onClick={() => onNavigate('nova://games')}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3.5 py-1.5 text-sm transition-all hover:border-primary/40 hover:bg-card"
          >
            <Gamepad2 className="h-4 w-4 text-primary" />
            Games Library
          </button>
          <button
            onClick={() => onNavigate('nova://apps')}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3.5 py-1.5 text-sm transition-all hover:border-primary/40 hover:bg-card"
          >
            <AppWindow className="h-4 w-4 text-primary" />
            Apps Library
          </button>
        </div>

        {bookmarks.length > 0 && (
          <div className="w-full animate-fade-up" style={{ animationDelay: '100ms' }}>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Bookmark className="h-4 w-4 text-primary" />
              Bookmarks
            </div>
            <div className="flex flex-wrap justify-center gap-1.5">
              {bookmarks.map((bm) => (
                <button
                  key={bm.id}
                  type="button"
                  onClick={() => onNavigate(bm.url)}
                  className="inline-flex max-w-[10rem] items-center gap-2 rounded-full border border-border bg-card/85 px-2.5 py-1.5 text-left text-[11px] transition-colors hover:border-primary/40"
                >
                  {bm.favicon ? (
                    <img src={bm.favicon} alt="" className="h-4 w-4 shrink-0 rounded-sm" />
                  ) : null}
                  <span className="truncate">{bm.title}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="w-full min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Compass className="h-4 w-4 text-primary" />
              Shortcuts
            </div>
            <div className="flex items-center gap-2">
              <div className="text-[11px] text-muted-foreground">
                {shortcuts.length} / 10 pinned sites
              </div>
              <button
                onClick={() => setManageShortcuts((value) => !value)}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-card/80 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                <Pencil className="h-3 w-3" />
                {manageShortcuts ? 'Done' : 'Manage'}
              </button>
            </div>
          </div>
          {manageShortcuts && (
            <div className="mb-3 rounded-3xl border border-border bg-card/60 p-3.5">
              <div className="grid gap-2.5 md:grid-cols-[1fr_1.4fr_auto]">
                <input
                  value={newShortcutTitle}
                  onChange={(event) => setNewShortcutTitle(event.target.value)}
                  placeholder="Shortcut title"
                  className="rounded-xl border border-border bg-background/70 px-3 py-2 text-sm outline-none"
                />
                <input
                  value={newShortcutUrl}
                  onChange={(event) => setNewShortcutUrl(event.target.value)}
                  placeholder="https://example.com"
                  className="rounded-xl border border-border bg-background/70 px-3 py-2 text-sm outline-none"
                />
                <button
                  type="button"
                  disabled={!canAddShortcut || !newShortcutTitle.trim() || !newShortcutUrl.trim()}
                  onClick={() => {
                    onAddShortcut({
                      title: newShortcutTitle.trim(),
                      url: newShortcutUrl.trim(),
                      color: '#6366f1',
                    });
                    setNewShortcutTitle('');
                    setNewShortcutUrl('');
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  Add Shortcut
                </button>
              </div>
              {!canAddShortcut && (
                <div className="mt-3 text-xs text-muted-foreground">
                  Shortcut limit reached. Remove one before adding another.
                </div>
              )}
              <div className="mt-3 text-xs text-muted-foreground">
                Drag shortcut cards to reorder them.
              </div>
            </div>
          )}
          {shortcuts.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border bg-card/50 px-6 py-10 text-center">
              <div className="text-sm font-medium">No shortcuts yet</div>
              <div className="mt-2 text-xs text-muted-foreground">
                Add up to 10 pinned shortcuts here, or add items directly from the apps and games libraries.
              </div>
            </div>
          ) : (
            <div className="grid w-full grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 sm:gap-3">
              {shortcuts.map((shortcut, i) => (
                <div
                  key={shortcut.id}
                  draggable={manageShortcuts}
                  onDragStart={() => {
                    if (!manageShortcuts) return;
                    setDraggingShortcutId(shortcut.id);
                    setDragOverShortcutId(shortcut.id);
                  }}
                  onDragOver={(event) => {
                    if (!manageShortcuts || draggingShortcutId === shortcut.id) return;
                    event.preventDefault();
                    setDragOverShortcutId(shortcut.id);
                  }}
                  onDrop={(event) => {
                    if (!manageShortcuts || !draggingShortcutId) return;
                    event.preventDefault();
                    const targetIndex = shortcuts.findIndex((entry) => entry.id === shortcut.id);
                    if (targetIndex >= 0) {
                      onMoveShortcut(draggingShortcutId, targetIndex);
                    }
                    setDraggingShortcutId(null);
                    setDragOverShortcutId(null);
                  }}
                  onDragEnd={() => {
                    setDraggingShortcutId(null);
                    setDragOverShortcutId(null);
                  }}
                  className={cn(
                    "rounded-2xl border border-border bg-card/65 p-3 text-center transition-all duration-200 group animate-fade-up",
                    manageShortcuts ? "cursor-move" : "",
                    draggingShortcutId === shortcut.id ? "opacity-60 ring-1 ring-primary/40" : "",
                    dragOverShortcutId === shortcut.id && draggingShortcutId !== shortcut.id
                      ? "border-primary/60 bg-primary/10"
                      : "",
                  )}
                  style={{ animationDelay: `${160 + i * 40}ms` }}
                >
                  <button
                    onClick={() => onNavigate(shortcut.url)}
                    disabled={manageShortcuts}
                    className="flex w-full flex-col items-center gap-2 transition-all hover:-translate-y-0.5 hover:border-primary/30 active:scale-95"
                  >
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl shadow-lg transition-transform duration-200 group-hover:scale-105"
                      style={{ backgroundColor: shortcut.color + '20' }}
                    >
                      {shortcut.favicon ? (
                        <img src={shortcut.favicon} alt="" className="h-5 w-5" />
                      ) : (
                        <span className="text-base font-bold" style={{ color: shortcut.color }}>{shortcut.title[0]}</span>
                      )}
                    </div>
                    <span className="max-w-full truncate text-[11px] text-muted-foreground transition-colors group-hover:text-foreground">
                      {shortcut.title}
                    </span>
                  </button>
                  {manageShortcuts && (
                    <div className="mt-3 space-y-2">
                      <input
                        value={shortcut.title}
                        onChange={(event) => onUpdateShortcut(shortcut.id, { title: event.target.value })}
                        className="w-full rounded-lg border border-border bg-background/70 px-3 py-2 text-xs outline-none"
                      />
                      <input
                        value={shortcut.url}
                        onChange={(event) => onUpdateShortcut(shortcut.id, { url: event.target.value })}
                        className="w-full rounded-lg border border-border bg-background/70 px-3 py-2 text-xs outline-none"
                      />
                      <div className="grid grid-cols-1 gap-2">
                        <button
                          onClick={() => onRemoveShortcut(shortcut.id)}
                          className="inline-flex items-center justify-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <Trash2 className="h-3 w-3" />
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          className="mt-1 w-full animate-fade-up border-t border-border/60 pt-4"
          style={{ animationDelay: "200ms" }}
        >
          <div className="mx-auto flex max-w-xl flex-col items-center gap-2 text-center text-xs text-muted-foreground">
            <div className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
              <LifeBuoy className="h-4 w-4 shrink-0 text-primary" />
              Need help?
            </div>
            <p className="leading-relaxed">
              {onOpenTickets ? (
                <button
                  type="button"
                  onClick={onOpenTickets}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Open a support ticket
                </button>
              ) : (
                <span>Open a support ticket</span>
              )}
              {" "}
              , or email <strong>Paxton Warin</strong> at{" "}
              <a
                href="mailto:im@paxton.co"
                className="font-mono text-[11px] text-primary underline-offset-2 hover:underline"
              >
                im@paxton.co
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
