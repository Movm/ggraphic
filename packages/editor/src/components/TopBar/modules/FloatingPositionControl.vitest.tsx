// SPDX-License-Identifier: MPL-2.0
import { FloatingPositionControl } from './FloatingPositionControl.js';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { messages } from '../../../i18n/messages.js';
import { axe } from '../../../test-utils';

import type { SelectionGeometry } from '../../../utils/canvasCommands.js';

const GEOMETRY: SelectionGeometry = { x: 10.4, y: 20, width: 300, height: 100, resize: 'width' };

function renderControl(
  overrides: Partial<React.ComponentProps<typeof FloatingPositionControl>> = {}
) {
  const props = {
    canDistribute: false,
    ...overrides,
    onCommand: vi.fn<(id: string) => void>(),
  };
  return { ...render(<FloatingPositionControl {...props} />), props };
}

const t = messages();
const open = () => userEvent.click(screen.getByRole('button', { name: t.topBar.position }));

describe('Position field', () => {
  it('runs the six align commands', async () => {
    const { props } = renderControl({ getGeometry: () => GEOMETRY });
    await open();
    for (const label of [
      t.commands.alignLeft,
      t.commands.alignCenterH,
      t.commands.alignRight,
      t.commands.alignTop,
      t.commands.alignMiddle,
      t.commands.alignBottom,
    ]) {
      await userEvent.click(screen.getByRole('button', { name: label }));
    }
    expect(props.onCommand.mock.calls.map((c) => c[0])).toEqual([
      'alignLeft',
      'alignCenterH',
      'alignRight',
      'alignTop',
      'alignMiddle',
      'alignBottom',
    ]);
  });

  it('shows X, Y, B, H rounded; H is locked for text; no distribute for a single selection', async () => {
    renderControl({ getGeometry: () => GEOMETRY });
    await open();
    expect(screen.getByRole('textbox', { name: 'X' })).toHaveValue('10');
    expect(screen.getByRole('textbox', { name: 'B' })).toHaveValue('300');
    expect(screen.getByRole('textbox', { name: 'H' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: t.commands.distributeHorizontal })).toBeNull();
  });

  it('writes X once on Enter, not while typing', async () => {
    const onPositionChange = vi.fn();
    renderControl({ getGeometry: () => GEOMETRY, onPositionChange });
    await open();
    const x = screen.getByRole('textbox', { name: 'X' });
    await userEvent.clear(x);
    await userEvent.type(x, '120');
    expect(onPositionChange).not.toHaveBeenCalled();
    await userEvent.keyboard('{Enter}');
    expect(onPositionChange).toHaveBeenCalledTimes(1);
    expect(onPositionChange).toHaveBeenCalledWith({ x: 120 });
  });

  it('writes on blur, accepts a comma, discards nonsense and unchanged values', async () => {
    const onSizeChange = vi.fn();
    const onPositionChange = vi.fn();
    renderControl({ getGeometry: () => GEOMETRY, onSizeChange, onPositionChange });
    await open();
    const b = screen.getByRole('textbox', { name: 'B' });
    await userEvent.clear(b);
    await userEvent.type(b, '250,5');
    await userEvent.tab();
    expect(onSizeChange).toHaveBeenCalledWith({ width: 250.5 });

    const y = screen.getByRole('textbox', { name: 'Y' });
    await userEvent.clear(y);
    await userEvent.type(y, 'abc');
    await userEvent.tab();
    expect(y).toHaveValue('20');
    await userEvent.click(screen.getByRole('textbox', { name: 'X' }));
    await userEvent.tab();
    expect(onPositionChange).not.toHaveBeenCalled();
  });

  it('offers distribute instead of fields for a multi-selection', async () => {
    const { props } = renderControl({ canDistribute: true });
    await open();
    expect(screen.queryByRole('textbox', { name: 'X' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: t.commands.distributeHorizontal }));
    await userEvent.click(screen.getByRole('button', { name: t.commands.distributeVertical }));
    expect(props.onCommand).toHaveBeenLastCalledWith('distributeVertical');
  });

  it('keeps distribute visible but off below three elements', async () => {
    renderControl({ canDistribute: false });
    await open();
    expect(screen.getByRole('button', { name: t.commands.distributeHorizontal })).toBeDisabled();
  });

  it('reorders the layer', async () => {
    const onMove = vi.fn();
    renderControl({
      getGeometry: () => GEOMETRY,
      layer: { canMoveUp: true, canMoveDown: false, onMove },
    });
    await open();
    await userEvent.click(screen.getByRole('button', { name: t.topBar.layerUp }));
    expect(onMove).toHaveBeenCalledWith('up');
    expect(screen.getByRole('button', { name: t.topBar.layerDown })).toBeDisabled();
  });

  // Locked: no moving, but reordering stays.
  it('shows only the layer without canAlign', async () => {
    renderControl({
      canAlign: false,
      getGeometry: () => GEOMETRY,
      layer: { canMoveUp: true, canMoveDown: true, onMove: vi.fn() },
    });
    await open();
    expect(screen.queryByRole('button', { name: t.commands.alignLeft })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'X' })).toBeNull();
    expect(screen.getByRole('button', { name: t.topBar.layerUp })).toBeEnabled();
  });

  it('has no axe violations', async () => {
    const { baseElement } = renderControl({
      getGeometry: () => GEOMETRY,
      layer: { canMoveUp: true, canMoveDown: true, onMove: vi.fn() },
    });
    await open();
    expect(await axe(baseElement)).toHaveNoViolations();
  });
});
