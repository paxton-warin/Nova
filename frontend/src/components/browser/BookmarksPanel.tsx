import React, { useMemo, useState } from 'react';
import { ArrowLeft, X, BookOpen, Trash2, Search, Globe } from 'lucide-react';
import type { Bookmark } from '@/types/browser';

interface BookmarksPanelProps {
  bookmarks: Bookmark[];
  onNavigate: (url: string) => void;
  onRemove: (id: string) => void;
  onBack?: () => void;
  onClose: () => void;
}

export const BookmarksPanel: React.FC<BookmarksPanelProps> = ({ bookmarks, onNavigate, onRemove, onBack, onClose }) => {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const filteredBookmarks = useMemo(
    () =>
      bookmarks.filter((bookmark) =>
        !normalizedQuery ||
        bookmark.title.toLowerCase().includes(normalizedQuery) ||
        bookmark.url.toLowerCase().includes(normalizedQuery),
      ),
    [bookmarks, normalizedQuery],
  );

  const formatHost = (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  };

  return (
    <div className="w-80 border-l border-border bg-card flex flex-col h-full animate-panel-in">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          {onBack ? (
            <button onClick={onBack} className="p-1 rounded hover:bg-chrome-hover transition-colors" title="Back" aria-label="Back">
              <ArrowLeft className="w-4 h-4" />
            </button>
          ) : null}
          <h2 className="text-sm font-semibold flex items-center gap-2"><BookOpen className="w-4 h-4" /> Bookmarks</h2>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-chrome-hover transition-colors" title="Close bookmarks" aria-label="Close bookmarks">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 rounded-xl border border-border bg-background/70 px-3 py-2">
          <Search className="w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search bookmarks"
            className="flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
          />
          <div className="text-[10px] text-muted-foreground">
            {filteredBookmarks.length}
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {bookmarks.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <BookOpen className="w-5 h-5" />
            </div>
            <div className="text-sm font-medium">No bookmarks yet</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Save favorite pages from the star button in the URL bar.
            </div>
          </div>
        ) : filteredBookmarks.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="text-sm font-medium">No matching bookmarks</div>
            <div className="mt-1 text-xs text-muted-foreground">
              Try searching by page title or website.
            </div>
          </div>
        ) : (
          filteredBookmarks.map((bm, i) => (
            <div
              key={bm.id}
              className="group flex items-start gap-3 px-4 py-3 hover:bg-chrome-hover transition-colors animate-fade-up"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <button type="button" onClick={() => onNavigate(bm.url)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                {bm.favicon ? (
                  <img src={bm.favicon} alt="" className="w-9 h-9 rounded-xl flex-shrink-0 object-cover" />
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-muted flex-shrink-0 flex items-center justify-center">
                    <Globe className="w-4 h-4 text-muted-foreground" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">{bm.title}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground truncate">
                    {formatHost(bm.url)}
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => onRemove(bm.id)}
                className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 p-1 rounded hover:bg-destructive/20 transition-all text-muted-foreground hover:text-destructive"
                title={`Remove ${bm.title} bookmark`}
                aria-label={`Remove ${bm.title} bookmark`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
