import React, { useMemo, useRef, useState } from 'react';
import { X, Plus, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BrowserTab } from '@/types/browser';

interface TabBarProps {
  tabs: BrowserTab[];
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
  onMove: (from: number, to: number) => void;
  density: 'compact' | 'default' | 'spacious';
  orientation: 'horizontal' | 'vertical';
}

export const TabBar: React.FC<TabBarProps> = ({
  tabs, onActivate, onClose, onAdd, onMove, density, orientation,
}) => {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [justDroppedId, setJustDroppedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const padY = density === 'compact' ? 'py-1' : density === 'spacious' ? 'py-2.5' : 'py-1.5';
  const tabH = density === 'compact' ? 'h-7' : density === 'spacious' ? 'h-10' : 'h-8';
  const isVertical = orientation === 'vertical';
  const horizontalTabWidth = useMemo(() => {
    if (isVertical) return undefined;
    const preferred = 220 - Math.max(0, tabs.length - 1) * 6;
    return `${Math.max(140, preferred)}px`;
  }, [isVertical, tabs.length]);

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex items-end gap-0.5 select-none bg-chrome',
        isVertical ? 'flex-col w-48 min-h-0 overflow-y-auto border-r border-border' : 'flex-row overflow-x-auto px-2 pt-1.5',
        padY
      )}
    >
      {tabs.map((tab, i) => (
        <div
          key={tab.id}
          draggable
          onDragStart={() => setDragIdx(i)}
          onDragOver={(e) => { e.preventDefault(); setOverIdx(i); }}
          onDrop={() => {
            if (dragIdx !== null) {
              onMove(dragIdx, i);
              setJustDroppedId(tab.id);
              window.setTimeout(() => setJustDroppedId((current) => (current === tab.id ? null : current)), 0);
            }
            setDragIdx(null);
            setOverIdx(null);
          }}
          onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
          onClick={() => {
            if (justDroppedId === tab.id) return;
            onActivate(tab.id);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onActivate(tab.id);
            }
            if (e.key === 'Delete' || e.key === 'Backspace') {
              e.preventDefault();
              onClose(tab.id);
            }
          }}
          role="button"
          tabIndex={0}
          aria-label={`${tab.isActive ? 'Active tab' : 'Tab'} ${tab.title}`}
          className={cn(
            'group relative flex items-center gap-2 px-3 rounded-t-lg cursor-pointer transition-all duration-150',
            'min-w-0 overflow-hidden',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
            isVertical ? 'w-full rounded-t-none rounded-lg' : 'shrink-0 rounded-t-xl',
            tabH,
            tab.isActive
              ? 'bg-tab-active text-foreground'
              : 'bg-tab-inactive text-muted-foreground hover:bg-chrome-hover',
            tab.closing && 'animate-tab-close overflow-hidden',
            !tab.closing && 'animate-tab-open',
            overIdx === i && dragIdx !== null && 'ring-1 ring-primary/40',
          )}
          style={isVertical ? undefined : { width: horizontalTabWidth }}
        >
          {/* Favicon */}
          <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
            {tab.isLoading ? (
              <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            ) : tab.favicon ? (
              <img src={tab.favicon} alt="" className="w-4 h-4 rounded-sm" />
            ) : (
              <div className="w-3 h-3 rounded-sm bg-muted-foreground/30" />
            )}
          </div>

          {/* Title */}
          <span className="text-xs truncate flex-1 font-medium">{tab.title}</span>
          {tab.isMuted && (
            <VolumeX className="w-3 h-3 text-muted-foreground/80 flex-shrink-0" />
          )}

          {/* Close button */}
          <button
            onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
            className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/20 flex-shrink-0"
            title={`Close ${tab.title}`}
            aria-label={`Close ${tab.title}`}
            tabIndex={-1}
          >
            <X className="w-3 h-3" />
          </button>

          {/* Active indicator */}
          {tab.isActive && !isVertical && (
            <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
          )}
          {tab.isActive && isVertical && (
            <div className="absolute left-0 top-1 bottom-1 w-0.5 bg-primary rounded-full" />
          )}
        </div>
      ))}

      {/* New tab button */}
      <button
        onClick={onAdd}
        className={cn(
          'flex items-center justify-center rounded-lg transition-colors hover:bg-chrome-hover text-muted-foreground hover:text-foreground flex-shrink-0',
          isVertical ? 'w-full h-8' : 'w-8 h-8 ml-1'
        )}
        title="New tab"
        aria-label="New tab"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
};
