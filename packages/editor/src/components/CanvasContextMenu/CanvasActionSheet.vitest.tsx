// SPDX-License-Identifier: MPL-2.0
import { CanvasActionSheet } from './CanvasActionSheet.js';
import { buildCanvasMenu } from './canvasMenuModel.js';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { messages } from '../../i18n/messages.js';
import { axe } from '../../test-utils';

import type { CanvasContextMenuHandle } from './CanvasContextMenu.js';
import type { SelectionCapabilities } from '../../utils/selectionCapabilities.js';

/**
 * „…“ in der Pille öffnet mobil ein Sheet mit demselben Menü wie der
 * Rechtsklick am Desktop: gleiches Modell, gleiche Befehle, andere Form.
 */

const CAPS: SelectionCapabilities = {
  count: 1,
  canCopy: true,
  canDelete: false,
  canBringForward: true,
  canSendBackward: false,
  lock: 'none',
  canLock: true,
  canRotate: true,
  canFlip: true,
  rotation: 0,
  canAlign: true,
  canDistribute: false,
  canEditText: false,
  canUngroup: false,
};

const ENV = {
  isMac: false,
  hasPoint: false,
  hasClipboard: false,
  pageIndex: 0,
  pageCount: 1,
  canAddPage: true,
  canEditImage: true,
};

function openSheet(caps: SelectionCapabilities = CAPS, selection = ['s1']) {
  const ref = createRef<CanvasContextMenuHandle>();
  const run = vi.fn();
  const view = render(<CanvasActionSheet handleRef={ref} />);
  const menu = buildCanvasMenu(
    {
      selection,
      module: { type: 'shape', data: { id: 's1' } },
      caps,
      canSelectAll: true,
      isCropping: false,
      background: null,
    },
    ENV
  );
  act(() => ref.current?.open({ point: { clientX: 0, clientY: 0 }, menu, run }));
  return { run, ...view };
}

async function flushFrame() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });
}

const t = messages();

describe('Action sheet', () => {
  it('shows the selection menu as a dialog with rows and no shortcuts', async () => {
    const { baseElement } = openSheet();
    const sheet = screen.getByRole('dialog', { name: t.common.element });
    for (const name of [
      t.commands.copy,
      t.commands.duplicate,
      t.contextMenu.layer,
      t.contextMenu.align,
      t.commands.toggleLock,
    ]) {
      expect(within(sheet).getByRole('button', { name })).toBeInTheDocument();
    }
    expect(sheet).not.toHaveTextContent('Ctrl');
    expect(await axe(baseElement)).toHaveNoViolations();
  });

  it('keeps unavailable rows visible but disabled: delete without permission, paste without content', () => {
    openSheet();
    expect(screen.getByRole('button', { name: t.commands.delete })).toBeDisabled();
    expect(screen.getByRole('button', { name: t.commands.paste })).toBeDisabled();
  });

  it('opens a submenu as its own view and returns with Back', async () => {
    openSheet();
    await userEvent.click(screen.getByRole('button', { name: t.contextMenu.layer }));
    expect(screen.getByRole('dialog', { name: t.contextMenu.layer })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t.commands.sendBackward })).toBeDisabled();
    expect(screen.queryByRole('button', { name: t.commands.copy })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: t.contextMenu.back }));
    expect(screen.getByRole('dialog', { name: t.common.element })).toBeInTheDocument();
  });

  it('closes first and runs the command afterwards', async () => {
    const { run } = openSheet();
    await userEvent.click(screen.getByRole('button', { name: t.contextMenu.layer }));
    await userEvent.click(screen.getByRole('button', { name: t.commands.bringToFront }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await flushFrame();
    expect(run).toHaveBeenCalledWith('bringToFront');
  });

  it('puts the clipboard commands on top as tiles and delete last, on its own', () => {
    openSheet({ ...CAPS, canDelete: true });
    const [quick, list] = within(screen.getByRole('dialog')).getAllByRole('list');
    const names = (l: HTMLElement) =>
      within(l)
        .getAllByRole('button')
        .map((b) => b.textContent);
    expect(names(quick!)).toEqual([
      t.commands.copy,
      t.commands.cut,
      t.commands.paste,
      t.commands.duplicate,
    ]);
    expect(names(list!).at(-1)).toBe(t.commands.delete);
    expect(names(list!)).not.toContain(t.commands.copy);
  });

  it('shows the number of elements in the header for a multi-selection', () => {
    openSheet({ ...CAPS, count: 3, canDistribute: true }, ['a', 'b', 'c']);
    expect(screen.getByRole('dialog', { name: t.common.elements(3) })).toBeInTheDocument();
  });
});
