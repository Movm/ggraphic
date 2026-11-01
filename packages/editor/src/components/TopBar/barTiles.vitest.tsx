// SPDX-License-Identifier: MPL-2.0
import { BarTilesProvider } from './barTiles.js';
import { ContextControls } from './ContextControls.js';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { messages } from '../../i18n/messages.js';
import { axe } from '../../test-utils';

import type { FloatingModuleState } from '../../hooks/useFloatingModuleState.js';

/**
 * Mobil stehen die Werkzeuge der Auswahl als Kacheln: Icon oben, Wort darunter.
 * Der Name jedes Knopfs beginnt mit dem Wort, das man sieht (WCAG 2.5.3).
 */

const t = messages();

const freeText: FloatingModuleState = {
  type: 'text',
  data: { id: 't1', fill: '#005538', isInstanceText: true, fontSize: 24, align: 'left' },
};

const HANDLERS = {
  handleMoveLayer: () => {},
  handleDuplicate: () => {},
  handleColorSelect: () => {},
  handleOpacityChange: () => {},
  handleFontSizeChange: () => {},
  handleTextAlignChange: () => {},
  onOpenEffects: () => {},
};

function renderControls({
  tiles,
  module = freeText,
  extra = {},
  canChangeFontRole = false,
}: {
  tiles: boolean;
  module?: FloatingModuleState;
  extra?: Record<string, () => void>;
  canChangeFontRole?: boolean;
}) {
  const controls = (
    <div role="toolbar" aria-label={t.topBar.editSelection}>
      <ContextControls
        selectedElement="t1"
        activeFloatingModule={module}
        canChangeFontRole={canChangeFontRole}
        canMoveUp={false}
        canMoveDown={false}
        canDuplicate
        hideObjectActions
        handlers={{ ...HANDLERS, ...extra }}
      />
    </div>
  );
  return render(tiles ? <BarTilesProvider>{controls}</BarTilesProvider> : controls);
}

describe('Tiles of the mobile selection bar', () => {
  it('captions every tool, and its name starts with the visible word', async () => {
    const { container } = renderControls({ tiles: true });
    const align = `${t.topBar.tiles.textAlign}: ${t.topBar.textAlign.left}`;
    for (const name of [
      t.topBar.tiles.color,
      align,
      t.sidebar.imageAdjust.opacity,
      t.topBar.effects,
      t.topBar.position,
    ]) {
      const button = screen.getByRole('button', { name });
      expect(button).toHaveTextContent(name.split(':')[0]!);
    }
    // The font size stays a stepper; the caption only labels the group.
    expect(screen.getByText(t.topBar.tiles.fontSize)).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: t.topBar.fontLarger })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  // Font role and whole-text format buttons stay on the bar after one click; on the
  // tile bar they carry a decorative caption and keep their own accessible names.
  it('keeps the font role and the format buttons, each with a caption', async () => {
    const { container } = renderControls({
      tiles: true,
      module: { ...freeText, data: { ...freeText.data, text: 'Hello', fontFamily: 'Arial' } },
      extra: {
        handleFontRoleChange: () => {},
        handleTextFormatChange: () => {},
      },
      canChangeFontRole: true,
    });
    expect(screen.getByRole('combobox', { name: t.topBar.fontRole })).toBeInTheDocument();
    expect(screen.getByText(t.topBar.tiles.fontRole)).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText(t.topBar.tiles.textFormat)).toHaveAttribute('aria-hidden', 'true');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('needs no separators: the captions already separate', () => {
    const tiles = renderControls({ tiles: true }).container.innerHTML;
    const bar = renderControls({ tiles: false }).container.innerHTML;
    const separators = (html: string) => html.split('w-px').length - 1;
    expect(separators(tiles)).toBe(0);
    expect(separators(bar)).toBeGreaterThan(0);
  });

  it('leaves the desktop bar as it is', () => {
    renderControls({ tiles: false });
    expect(screen.getByRole('button', { name: t.topBar.openPalette })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: t.topBar.textAlignLabel(t.topBar.textAlign.left) })
    ).toBeInTheDocument();
    expect(screen.queryByText(t.topBar.tiles.fontSize)).toBeNull();
  });
});
