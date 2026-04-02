import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, RotateCw, Home, Shield, Star, Search,
  Settings, Clock, BookOpen, Puzzle, User, Code, Maximize, Minimize, Bell
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchSearchSuggestions } from '@/lib/searchSuggestions';
import type { BrowserTab, PanelType, Bookmark, BrowserUser } from '@/types/browser';

interface UrlBarProps {
  activeTab: BrowserTab | undefined;
  onNavigate: (url: string) => void;
  onRegen: () => void;
  onHome: () => void;
  onBack: () => void;
  onForward: () => void;
  onFullscreen: () => void;
  onTogglePanel: (panel: PanelType) => void;
  activePanel: PanelType;
  onAddBookmark: () => void;
  onInspect: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  bookmarks: Bookmark[];
  searchEngine: string;
  searchSuggestions: boolean;
  density: 'compact' | 'default' | 'spacious';
  user: BrowserUser | null;
  unreadMessages: number;
}

const SEARCH_ENGINES: Record<string, string> = {
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
  yahoo: 'https://search.yahoo.com/search?p=',
};

export const UrlBar: React.FC<UrlBarProps> = ({
  activeTab, onNavigate, onRegen, onHome, onBack, onForward, onFullscreen, onTogglePanel, activePanel,
  onAddBookmark, onInspect, canGoBack, canGoForward, bookmarks, searchEngine, searchSuggestions, density, user,
  unreadMessages,
}) => {
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);
  const activeTabUrl = activeTab?.url ?? '';

  useEffect(() => {
    if (!focused) {
      setInput(activeTabUrl === 'newtab' ? '' : activeTabUrl);
    }
  }, [activeTabUrl, focused]);

  useEffect(() => {
    if (!searchSuggestions) {
      setSuggestions([]);
      setActiveSuggestion(-1);
    }
  }, [searchSuggestions]);

  useEffect(() => {
    if (!focused || !searchSuggestions) return;

    const trimmed = input.trim();
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
  }, [focused, input, searchSuggestions]);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const handleInput = (val: string) => {
    setInput(val);
    if (!searchSuggestions || val.trim().length === 0) {
      setSuggestions([]);
      setActiveSuggestion(-1);
      return;
    }
  };

  const handleSubmit = (url?: string) => {
    const value = (url || input).trim();
    if (!value) return;
    if (value.includes('.') || value.startsWith('http')) {
      onNavigate(value);
    } else {
      onNavigate(SEARCH_ENGINES[searchEngine] + encodeURIComponent(value));
    }
    setSuggestions([]);
    setActiveSuggestion(-1);
    setFocused(false);
    inputRef.current?.blur();
  };

  const h = density === 'compact' ? 'h-8' : density === 'spacious' ? 'h-11' : 'h-9';
  const iconBtn = 'p-1.5 rounded-md transition-colors hover:bg-chrome-hover text-muted-foreground hover:text-foreground active:scale-95';
  const panelBtn = (panel: PanelType) => cn(iconBtn, activePanel === panel && 'text-primary bg-primary/10');
  const notificationPanel: PanelType = 'notifications';
  const notificationTitle = 'Notifications';

  return (
    <div className={cn('flex items-center gap-1 px-2 bg-chrome border-b border-border', h)}>
      {/* Nav buttons */}
      <button className={cn(iconBtn, !canGoBack && 'opacity-40 pointer-events-none')} onClick={onBack} disabled={!canGoBack} title="Back" aria-label="Back"><ArrowLeft className="w-4 h-4" /></button>
      <button className={cn(iconBtn, !canGoForward && 'opacity-40 pointer-events-none')} onClick={onForward} disabled={!canGoForward} title="Forward" aria-label="Forward"><ArrowRight className="w-4 h-4" /></button>
      <button className={iconBtn} onClick={onRegen} title="Reload" aria-label="Reload"><RotateCw className="w-4 h-4" /></button>
      <button className={iconBtn} onClick={onHome} title="Home" aria-label="Home"><Home className="w-4 h-4" /></button>

      {/* URL input */}
      <div className="flex-1 relative mx-1">
        <div className={cn(
          'flex items-center gap-2 rounded-lg px-3 transition-all duration-200',
          density === 'compact' ? 'h-6' : density === 'spacious' ? 'h-8' : 'h-7',
          focused ? 'bg-background ring-1 ring-primary/50' : 'bg-url-bar',
        )}>
          {!focused && <Shield className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
          {focused && <Search className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
          <input
            ref={inputRef}
            value={input}
            onChange={e => handleInput(e.target.value)}
            onFocus={() => { setFocused(true); inputRef.current?.select(); }}
            onBlur={() => setTimeout(() => { setFocused(false); setSuggestions([]); setActiveSuggestion(-1); }, 150)}
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
              if (e.key === 'Escape') {
                setSuggestions([]);
                setActiveSuggestion(-1);
                return;
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSubmit(activeSuggestion >= 0 ? suggestions[activeSuggestion] : undefined);
              }
            }}
            placeholder="Search or enter URL"
            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
          />
        </div>

        {/* Autocomplete dropdown */}
        {focused && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-popover border border-border rounded-lg shadow-xl z-50 overflow-hidden animate-slide-down">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSubmit(s);
                }}
                className={cn(
                  'flex items-center gap-2 w-full px-3 py-2 text-xs text-left transition-colors',
                  activeSuggestion === i ? 'bg-primary/10' : 'hover:bg-chrome-hover'
                )}
              >
                <Search className="w-3 h-3 text-muted-foreground" />
                <span>{s}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Bookmark star */}
      <button
        className={cn(
          iconBtn,
          bookmarks.some((b) => b.url === activeTab?.url) && 'bg-primary/15 text-primary'
        )}
        onClick={onAddBookmark}
        title={bookmarks.some((b) => b.url === activeTab?.url) ? 'Remove bookmark' : 'Add bookmark'}
        aria-label={bookmarks.some((b) => b.url === activeTab?.url) ? 'Remove bookmark' : 'Add bookmark'}
      >
        <Star className={cn('w-4 h-4', bookmarks.some(b => b.url === activeTab?.url) && 'fill-primary text-primary')} />
      </button>

      {/* Inspect element & fullscreen */}
      <button className={iconBtn} onClick={onInspect} title="Inspect Element" aria-label="Inspect Element">
        <Code className="w-4 h-4" />
      </button>
      <button className={iconBtn} onClick={onFullscreen} title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'} aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
        {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
      </button>

      {/* Panel toggles */}
      <div className="flex items-center gap-0.5 ml-1 border-l border-border pl-1.5">
        <button className={panelBtn('bookmarks')} onClick={() => onTogglePanel('bookmarks')} title="Bookmarks" aria-label="Bookmarks">
          <BookOpen className="w-4 h-4" />
        </button>
        <button className={panelBtn('history')} onClick={() => onTogglePanel('history')} title="History" aria-label="History">
          <Clock className="w-4 h-4" />
        </button>
        <button className={panelBtn(notificationPanel)} onClick={() => onTogglePanel(notificationPanel)} title={notificationTitle} aria-label={notificationTitle}>
          <div className="relative">
            <Bell className="w-4 h-4" />
            {unreadMessages > 0 && (
              <span className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-primary px-1 text-[9px] font-semibold leading-4 text-primary-foreground">
                {Math.min(unreadMessages, 9)}
              </span>
            )}
          </div>
        </button>
        <button className={panelBtn('extensions')} onClick={() => onTogglePanel('extensions')} title="Utilities" aria-label="Utilities">
          <Puzzle className="w-4 h-4" />
        </button>
        <button className={panelBtn('settings')} onClick={() => onTogglePanel('settings')} title="Settings" aria-label="Settings">
          <Settings className="w-4 h-4" />
        </button>
        <button className={panelBtn('account')} onClick={() => onTogglePanel('account')} title="Account" aria-label="Account">
          <User className="w-4 h-4" />
        </button>
        {user?.isAdmin && (
          <button className={panelBtn('admin')} onClick={() => onTogglePanel('admin')} title="Admin" aria-label="Admin">
            <Shield className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
