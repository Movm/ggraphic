// SPDX-License-Identifier: AGPL-3.0-only
import { TileCaption, useBarTiles } from '../barTiles.js';
import { useMessages } from '../../../i18n/messages.js';
import { useLiveFontSize } from '../../../hooks/useLiveFontSize.js';
import React, { useState } from 'react';
import { PiPlus, PiMinus } from 'react-icons/pi';

const fontBtn =
  'touch-target size-7 rounded-md border-none bg-transparent cursor-pointer flex items-center justify-center text-[var(--editor-text-secondary)] transition-colors duration-150 hover:enabled:bg-[var(--editor-surface-hover)] hover:enabled:text-[var(--editor-active-fg)] disabled:opacity-30 disabled:cursor-not-allowed';

const MIN_FONT_SIZE = 2;
const MAX_FONT_SIZE = 800;

const clampFontSize = (size: number) =>
  Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size)));

interface FloatingFontSizeControlProps {
  /** The text the field belongs to: while a corner drag scales it, the field shows the live size. */
  elementId: string;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
}

export function FloatingFontSizeControl({
  elementId,
  fontSize: committedFontSize,
  onFontSizeChange,
}: FloatingFontSizeControlProps) {
  // Subscribed here, not in the bar: a drag re-renders this field only, once per whole size step.
  const liveFontSize = useLiveFontSize(elementId);
  const fontSize = liveFontSize ?? committedFontSize;
  const t = useMessages();
  const tiles = useBarTiles();
  // What is typed, while the field has focus; null shows the text's size (live during a corner drag).
  const [draft, setDraft] = useState<string | null>(null);

  const apply = (size: number) => {
    const next = clampFontSize(size);
    if (next !== Math.round(fontSize)) onFontSizeChange(next);
  };

  const commitDraft = () => {
    if (draft === null) return;
    const parsed = Number(draft.replace(',', '.'));
    setDraft(null);
    if (draft.trim() !== '' && Number.isFinite(parsed)) apply(parsed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commitDraft();
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setDraft(null);
      e.currentTarget.blur();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const step = (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
      setDraft(null);
      apply(fontSize + step);
    }
  };

  const handleIncrease = (e: React.MouseEvent) => {
    e.stopPropagation();
    apply(fontSize + 2);
  };

  const handleDecrease = (e: React.MouseEvent) => {
    e.stopPropagation();
    apply(fontSize - 2);
  };

  const stepper = (
    <div className="flex items-center h-[34px] shrink-0 rounded-lg border border-[var(--editor-border-strong)] px-0.5">
      <button
        className={fontBtn}
        onClick={handleDecrease}
        title={t.topBar.fontSmaller}
        aria-label={t.topBar.fontSmaller}
        type="button"
      >
        <PiMinus size={10} />
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label={t.topBar.fontSizeInput}
        title={t.topBar.fontSizeInput}
        value={draft ?? String(Math.round(fontSize))}
        onFocus={(e) => {
          setDraft(String(Math.round(fontSize)));
          e.currentTarget.select();
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitDraft}
        onKeyDown={handleKeyDown}
        onClick={(e) => e.stopPropagation()}
        className="w-10 h-7 rounded-md border-none bg-transparent text-[13px] font-semibold text-[var(--editor-text)] text-center tabular-nums outline-none hover:bg-[var(--editor-surface-hover)] focus-visible:bg-[var(--editor-surface-hover)] focus-visible:ring-2 focus-visible:ring-[var(--editor-active-fg)]"
      />
      <button
        className={fontBtn}
        onClick={handleIncrease}
        title={t.topBar.fontLarger}
        aria-label={t.topBar.fontLarger}
        type="button"
      >
        <PiPlus size={10} />
      </button>
    </div>
  );
  if (!tiles) return stepper;
  return (
    <div className="flex flex-col items-center justify-end gap-1 h-14 pb-2 shrink-0">
      {stepper}
      <TileCaption decorative>{t.topBar.tiles.fontSize}</TileCaption>
    </div>
  );
}
