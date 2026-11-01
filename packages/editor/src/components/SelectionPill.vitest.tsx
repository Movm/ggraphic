// SPDX-License-Identifier: MPL-2.0
import {
  SelectionPill,
  type SelectionPillProps,
  placePill,
} from '@ggraphic/editor/components/SelectionPill';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { messages } from '@ggraphic/editor/i18n/messages';

/**
 * Die Pille steht über dem ausgewählten Objekt (darunter, wenn oben kein
 * Platz ist), verschwindet beim Ziehen und trägt Duplizieren/Löschen/Mehr;
 * am Desktop (`pointer`) dazu Sperren.
 */

const t = messages();

// Seitenfläche 390 × 600: darunter beginnt die Auswahl-Leiste (390 × 844, iPhone 13).
const VISIBLE = { left: 0, top: 52, right: 390, bottom: 600 };

async function flushFrames() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });
}

function setup(overrides: Partial<SelectionPillProps> = {}) {
  let manipulate: (active: boolean) => void = () => {};
  const props: SelectionPillProps = {
    measureKey: 'a',
    zoom: 1,
    getBox: () => ({ left: 100, top: 300, width: 80, height: 60, visible: VISIBLE, rotaters: [] }),
    subscribeManipulation: (listener) => {
      manipulate = listener;
      return () => {};
    },
    canDuplicate: true,
    canDelete: true,
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onMore: vi.fn(),
    ...overrides,
  };
  render(<SelectionPill {...props} />);
  return { props, manipulate: (active: boolean) => act(() => manipulate(active)) };
}

describe('SelectionPill (touch)', () => {
  it('sits above the selection and calls its actions', async () => {
    const { props } = setup();
    await flushFrames();
    const pill = screen.getByRole('toolbar', { name: t.common.element });
    expect(pill.style.top).toBe(`${300 - 12 - 44}px`);
    await userEvent.click(screen.getByRole('button', { name: t.commands.duplicate }));
    await userEvent.click(screen.getByRole('button', { name: t.commands.delete }));
    await userEvent.click(screen.getByRole('button', { name: t.shell.moreOptions }));
    expect(props.onDuplicate).toHaveBeenCalledOnce();
    expect(props.onDelete).toHaveBeenCalledOnce();
    expect(props.onMore).toHaveBeenCalledOnce();
  });

  it('flips only when the multi-selection offers it', async () => {
    const onFlip = vi.fn();
    setup({ onFlip, onMore: undefined });
    await flushFrames();
    await userEvent.click(screen.getByRole('button', { name: t.commands.flipHorizontal }));
    await userEvent.click(screen.getByRole('button', { name: t.commands.flipVertical }));
    expect(onFlip.mock.calls).toEqual([['x'], ['y']]);
  });

  it('shows no flip buttons without onFlip', async () => {
    setup();
    await flushFrames();
    expect(screen.queryByRole('button', { name: /flip/i })).toBeNull();
  });

  it('moves below the object when the header is above', async () => {
    setup({
      getBox: () => ({ left: 100, top: 70, width: 80, height: 60, visible: VISIBLE, rotaters: [] }),
    });
    await flushFrames();
    expect(screen.getByRole('toolbar', { name: t.common.element }).style.top).toBe(
      `${70 + 60 + 12}px`
    );
  });

  it('disappears while dragging and comes back afterwards', async () => {
    const { manipulate } = setup();
    await flushFrames();
    manipulate(true);
    expect(screen.queryByRole('toolbar', { name: t.common.element })).toBeNull();
    manipulate(false);
    await flushFrames();
    expect(screen.getByRole('toolbar', { name: t.common.element })).toBeInTheDocument();
  });

  it('disables delete for template elements', async () => {
    setup({ canDelete: false });
    await flushFrames();
    expect(screen.getByRole('button', { name: t.commands.delete })).toBeDisabled();
  });
});

describe('SelectionPill (pointer)', () => {
  const pointer = (overrides: Partial<SelectionPillProps> = {}) =>
    setup({ variant: 'pointer', onToggleLock: vi.fn(), ...overrides });

  it('locks, duplicates, deletes and opens the menu at the button', async () => {
    const { props } = pointer();
    await flushFrames();
    const lock = screen.getByRole('button', { name: t.commands.toggleLock });
    expect(lock).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(lock);
    await userEvent.click(screen.getByRole('button', { name: t.commands.duplicate }));
    await userEvent.click(screen.getByRole('button', { name: t.commands.delete }));
    const more = screen.getByRole('button', { name: t.shell.moreOptions });
    await userEvent.click(more);
    expect(props.onToggleLock).toHaveBeenCalledOnce();
    expect(props.onDuplicate).toHaveBeenCalledOnce();
    expect(props.onDelete).toHaveBeenCalledOnce();
    expect(props.onMore).toHaveBeenCalledWith(more);
  });

  it('names the shortcut on delete', async () => {
    pointer();
    await flushFrames();
    expect(screen.getByRole('button', { name: t.commands.delete }).title).toMatch(
      new RegExp(`^${t.commands.delete} \\((${t.keys.delete}|⌫)\\)$`)
    );
  });

  it.each([
    [{ isLocked: true }, t.topBar.lockedNoDelete],
    [{ isMulti: true }, t.topBar.nothingDeletable],
    [{}, t.topBar.templateNoDelete],
  ])('disabled delete %o explains itself', async (state, title) => {
    pointer({ canDelete: false, ...state });
    await flushFrames();
    const remove = screen.getByRole('button', { name: t.commands.delete });
    expect(remove).toBeDisabled();
    expect(remove).toHaveAttribute('title', title);
  });

  it('locked: unlock is pressed, delete stays visible', async () => {
    pointer({ isLocked: true, canDelete: false });
    await flushFrames();
    expect(screen.getByRole('button', { name: t.contextMenu.unlock })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: t.commands.delete })).toBeDisabled();
  });

  it('no lock button without the ability to lock', async () => {
    pointer({ onToggleLock: undefined });
    await flushFrames();
    expect(screen.queryByRole('button', { name: /Lock$|Unlock$/ })).toBeNull();
  });
});

describe('placePill: against the visible part of the page area', () => {
  const box = (top: number, height: number) => ({
    left: 100,
    top,
    width: 80,
    height,
    visible: VISIBLE,
    rotaters: [] as { left: number; top: number; right: number; bottom: number }[],
  });

  it('above the selection when there is room', () => {
    expect(placePill(box(300, 60), 120).top).toBe(300 - 12 - 44);
  });

  it('below when the header is above and there is room below', () => {
    expect(placePill(box(70, 60), 120).top).toBe(70 + 60 + 12);
  });

  // #4950: hohes Element endet 15 px über der Leiste, oben kein Platz.
  it('never lies on the selection bar: then inside the selection at its bottom edge', () => {
    const { top } = placePill(box(70, 515), 120);
    expect(top + 44).toBeLessThanOrEqual(VISIBLE.bottom - 8);
    expect(top).toBe(70 + 515 - 12 - 44);
  });

  // Review #4960: Element endet bei 530, Drehgriff (Finger, 32 px) darunter bei 542–574.
  it('does not cover the rotate handle inside the selection', () => {
    const rotater = { left: 124, top: 542, right: 156, bottom: 574 };
    const { top } = placePill({ ...box(70, 574 - 70), rotaters: [rotater] }, 120);
    expect(top + 44).toBeLessThanOrEqual(rotater.top);
    expect(top).toBe(542 - 12 - 44);
  });

  it('a rotate handle beside the pill does not push it up', () => {
    const rotater = { left: 0, top: 300, right: 20, bottom: 332 };
    const { top } = placePill({ ...box(70, 515), rotaters: [rotater] }, 120);
    expect(top).toBe(70 + 515 - 12 - 44);
  });

  it('too little room: below the header rather than on the bar', () => {
    const tiny = { left: 0, top: 52, right: 390, bottom: 100 };
    const { top } = placePill({ ...box(60, 30), visible: tiny }, 120);
    expect(top + 44).toBeLessThanOrEqual(tiny.bottom - 8);
  });

  it('if the selection reaches under the bar, the pill stands above its top edge', () => {
    const { top } = placePill(box(70, 700), 120);
    expect(top).toBe(VISIBLE.bottom - 12 - 44);
  });

  it('stays inside the visible area sideways', () => {
    expect(placePill({ ...box(300, 60), left: 360 }, 120).left).toBe(390 - 120 - 8);
    expect(placePill({ ...box(300, 60), left: -100 }, 120).left).toBe(8);
  });
});

describe('placePill: pointer', () => {
  // Desktop: ohne beschneidenden Vorfahren reicht die Fläche bis an den Fensterrand.
  const DESK = { left: 0, top: 0, right: 1200, bottom: 800 };
  const box = (top: number) => ({
    left: 400,
    top,
    width: 200,
    height: 100,
    visible: DESK,
    rotaters: [] as { left: number; top: number; right: number; bottom: number }[],
  });

  it('above the selection, smaller than on the phone', () => {
    expect(placePill(box(400), 140, 'pointer', 113).top).toBe(400 - 12 - 36);
  });

  // Live gesehen: ein Text oben auf der Seite, die Pille lag auf der Kontextleiste.
  it('does not slide onto the context bar but below the object', () => {
    // Darüber wäre 135 - 48 = 87; die Leiste endet bei 113, plus 8 Luft.
    expect(placePill(box(135), 140, 'pointer', 113).top).toBe(135 + 100 + 12);
  });
});
