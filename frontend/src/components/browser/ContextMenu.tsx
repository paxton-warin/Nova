import React, { useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft, ArrowRight, RotateCw, Star, Copy, Printer, Eye, Settings, Volume2, VolumeX, Image as ImageIcon, Link2, ExternalLink
} from 'lucide-react';

interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  isBookmarked: boolean;
  isMuted: boolean;
  currentUrl?: string;
  linkUrl?: string;
  imageUrl?: string;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onToggleMute: () => void;
  onToggleBookmark: () => void;
  onOpenInNewTab: (url: string) => void;
  onInspect: () => void;
  onOpenSettings: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  onClose,
  canGoBack,
  canGoForward,
  isBookmarked,
  isMuted,
  currentUrl,
  linkUrl,
  imageUrl,
  onBack,
  onForward,
  onReload,
  onToggleMute,
  onToggleBookmark,
  onOpenInNewTab,
  onInspect,
  onOpenSettings,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const items = useMemo(
    () => [
      { id: 'back', label: 'Back', icon: ArrowLeft, shortcut: 'Alt+←' },
      { id: 'forward', label: 'Forward', icon: ArrowRight, shortcut: 'Alt+→' },
      { id: 'reload', label: 'Reload', icon: RotateCw, shortcut: 'Ctrl+Shift+T' },
      { id: 'mute', label: 'Mute Tab', icon: VolumeX, shortcut: '' },
      null,
      ...(linkUrl
        ? [{ id: 'open-link-new-tab', label: 'Open Link in New Tab', icon: ExternalLink, shortcut: '' as const }]
        : []),
      ...(imageUrl
        ? [
            { id: 'copy-image', label: 'Copy Image', icon: ImageIcon, shortcut: '' as const },
            { id: 'copy-image-url', label: 'Copy Image URL', icon: Link2, shortcut: '' as const },
          ]
        : []),
      ...(linkUrl || imageUrl ? [null] : []),
      { id: 'bookmark', label: 'Toggle Bookmark', icon: Star, shortcut: 'Ctrl+B' },
      { id: 'copy-url', label: 'Copy Page URL', icon: Copy, shortcut: 'Ctrl+C' },
      { id: 'print', label: 'Print', icon: Printer, shortcut: 'Ctrl+P' },
      null,
      { id: 'inspect', label: 'Inspect Element', icon: Eye, shortcut: 'Ctrl+Shift+I' },
      { id: 'settings', label: 'Open Settings', icon: Settings, shortcut: 'Alt+.' },
    ],
    [imageUrl, linkUrl],
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Clamp position
  const style: React.CSSProperties = {
    left: Math.min(x, window.innerWidth - 220),
    top: Math.min(y, window.innerHeight - 400),
  };

  async function handleAction(id: string) {
    switch (id) {
      case 'back':
        onBack();
        break;
      case 'forward':
        onForward();
        break;
      case 'reload':
        onReload();
        break;
      case 'bookmark':
        onToggleBookmark();
        break;
      case 'mute':
        onToggleMute();
        break;
      case 'copy-url':
        if (currentUrl) {
          await navigator.clipboard.writeText(currentUrl);
        }
        break;
      case 'open-link-new-tab':
        if (linkUrl) {
          onOpenInNewTab(linkUrl);
        }
        break;
      case 'copy-image-url':
        if (imageUrl) {
          await navigator.clipboard.writeText(imageUrl);
        }
        break;
      case 'copy-image':
        if (imageUrl) {
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          if (typeof ClipboardItem !== 'undefined' && blob.type) {
            await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
          } else {
            await navigator.clipboard.writeText(imageUrl);
          }
        }
        break;
      case 'print':
        window.print();
        break;
      case 'inspect':
        onInspect();
        break;
      case 'settings':
        onOpenSettings();
        break;
    }
    onClose();
  }

  function disabledFor(id: string) {
    if (id === 'back') return !canGoBack;
    if (id === 'forward') return !canGoForward;
    if (id === 'copy-url') return !currentUrl || currentUrl === 'newtab';
    if (id === 'open-link-new-tab') return !linkUrl;
    if (id === 'copy-image' || id === 'copy-image-url') return !imageUrl;
    return false;
  }

  return (
    <div
      ref={ref}
      className="fixed z-[100] w-52 bg-popover border border-border rounded-lg shadow-2xl py-1 animate-slide-down"
      style={style}
    >
      {items.map((item, i) =>
        item === null ? (
          <div key={i} className="h-px bg-border mx-2 my-1" />
        ) : (
          <button
            key={i}
            onClick={() => void handleAction(item.id)}
            disabled={disabledFor(item.id)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-chrome-hover transition-colors text-left disabled:opacity-40 disabled:pointer-events-none"
          >
            {item.id === 'mute'
              ? isMuted
                ? <Volume2 className="w-3.5 h-3.5 text-muted-foreground" />
                : <VolumeX className="w-3.5 h-3.5 text-muted-foreground" />
              : item.icon && <item.icon className="w-3.5 h-3.5 text-muted-foreground" />}
            {!item.icon && <span className="w-3.5" />}
            <span className="flex-1">
              {item.id === 'bookmark'
                ? isBookmarked
                  ? 'Remove Bookmark'
                  : 'Add Bookmark'
                : item.id === 'mute'
                  ? isMuted
                    ? 'Unmute Tab'
                    : 'Mute Tab'
                : item.label}
            </span>
            {item.shortcut && <span className="text-[10px] text-muted-foreground font-mono">{item.shortcut}</span>}
          </button>
        )
      )}
    </div>
  );
};
