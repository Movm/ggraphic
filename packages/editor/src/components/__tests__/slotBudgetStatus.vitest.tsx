// SPDX-License-Identifier: MPL-2.0
import { CanvasEditorProvider } from '../../CanvasEditorProvider.js';
import { SlotBudgetStatus } from '../SlotBudgetStatus.js';
import { registerMessages } from '../../i18n/messages.js';
import { AnnouncerContext } from '../../hooks/useAnnounce.js';
import { CanvasStoreProvider, useCanvasStore } from '../../stores/CanvasStoreProvider.js';
import { act, cleanup, render } from '@testing-library/react';
import Konva from 'konva';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { axe } from '../../test-utils';

import type { CanvasEditorServices } from '../../CanvasEditorProvider.js';

const ELEVEN_WORDS = 'one two three four five six seven eight nine ten eleven';

const text = (over: Record<string, unknown> = {}) => ({
  id: 'headline',
  text: ELEVEN_WORDS,
  type: 'header',
  x: 100,
  y: 100,
  width: 800,
  fontSize: 60,
  fontFamily: 'sans-serif',
  fill: '#000',
  ...over,
});

const services: CanvasEditorServices = {
  slotBudgets: { budgetFor: () => ({ budget: { maxWords: 8 }, role: 'headline' }) },
};

function Select({ id }: { id: string | null }) {
  const store = useCanvasStore();
  useEffect(() => store.getState().setSelectedElement(id), [store, id]);
  return null;
}

const announce = vi.fn();

function Harness({
  additionalTexts,
  selected = 'headline',
  svc = services,
}: {
  additionalTexts: unknown[];
  selected?: string | null;
  svc?: CanvasEditorServices;
}) {
  return (
    <AnnouncerContext.Provider value={{ announce, lastAnnouncedAt: { current: 0 } }}>
      <CanvasEditorProvider services={svc}>
        <CanvasStoreProvider>
          <Select id={selected} />
          <SlotBudgetStatus
            state={{ additionalTexts, templateRef: { id: 't', version: 1 } }}
            canvasWidth={1000}
            canvasHeight={1000}
          />
        </CanvasStoreProvider>
      </CanvasEditorProvider>
    </AnnouncerContext.Provider>
  );
}

/** Page state held in React state, like the canvas does: edits go through `edit`. */
let edit: (patch: Record<string, unknown>) => void = () => {};
let stored: () => Record<string, unknown> = () => ({});
function Editable() {
  const [item, setItem] = useState(text());
  edit = (patch) => setItem((prev) => ({ ...prev, ...patch }));
  stored = () => item;
  return <Harness additionalTexts={[item]} />;
}

beforeEach(() => {
  registerMessages('en');
  announce.mockClear();
});
afterEach(() => {
  cleanup();
  registerMessages('de');
});

describe('SlotBudgetStatus', () => {
  it('renders nothing when the selected text is within budget', () => {
    const { container } = render(
      <Harness additionalTexts={[text({ text: 'three short words' })]} />
    );
    expect(container.textContent).toBe('');
  });

  it('renders nothing without the host service or without a selection', () => {
    const a = render(<Harness additionalTexts={[text()]} svc={{}} />);
    expect(a.container.textContent).toBe('');
    a.unmount();
    const b = render(<Harness additionalTexts={[text()]} selected={null} />);
    expect(b.container.textContent).toBe('');
  });

  it('shows "11 of 8 words" for an over-budget text, without being a second live region', () => {
    const { container } = render(<Harness additionalTexts={[text()]} />);
    expect(container.textContent).toContain('11 of 8 words');
    expect(container.querySelector('[role], [aria-live]')).toBeNull();
  });

  it('announces through the editor live region only when the set of violated kinds changes', () => {
    render(<Editable />);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenLastCalledWith('11 of 8 words');
    // One more word while already over budget: a new count, the same kind.
    act(() => edit({ text: `${ELEVEN_WORDS} twelve` }));
    expect(announce).toHaveBeenCalledTimes(1);
    // A new kind (too small) crosses in.
    act(() => edit({ fontSize: 20 }));
    expect(announce).toHaveBeenCalledTimes(2);
    expect(announce.mock.lastCall![0]).toContain('words');
    expect(announce.mock.lastCall![0]).toContain('px');
    // Back within budget announces nothing.
    act(() => edit({ text: 'short', fontSize: 60 }));
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it('shows the font-size message below 0.035 of canvas height and recomputes after a format change', () => {
    const { container, rerender } = render(
      <Harness additionalTexts={[text({ text: 'ok', fontSize: 20 })]} />
    );
    expect(container.textContent).toMatch(/35 px/);
    rerender(<Harness additionalTexts={[text({ text: 'ok', fontSize: 40 })]} />);
    expect(container.textContent).toBe('');
  });

  it('does not block editing: an edit goes through and the value is kept', () => {
    const { container } = render(<Editable />);
    act(() => edit({ text: `${ELEVEN_WORDS} twelve` }));
    expect(stored()['text']).toBe(`${ELEVEN_WORDS} twelve`);
    expect(container.textContent).toContain('12 of 8 words');
    const chip = container.firstElementChild as HTMLElement;
    expect(chip.querySelector('button, input, textarea, a, [tabindex]')).toBeNull();
    expect(chip.style.pointerEvents).toBe('none');
  });

  it('is not part of the stage capture', () => {
    // A capture renders the Konva stage only; the status must be plain DOM beside it.
    const host = document.createElement('div');
    document.body.append(host);
    const stage = new Konva.Stage({ container: host, width: 20, height: 20 });
    stage.add(new Konva.Layer());
    const nodesBefore = stage.find('*').length;
    const { container } = render(<Harness additionalTexts={[text()]} />);
    const status = container.firstElementChild!;
    expect(status).not.toBeNull();
    expect(status.closest('.konvajs-content')).toBeNull();
    expect(host.querySelector('.konvajs-content')?.contains(status)).toBe(false);
    expect(stage.find('*').length).toBe(nodesBefore);
    stage.destroy();
    host.remove();
  });

  it('has no axe violations', async () => {
    const { container } = render(<Harness additionalTexts={[text()]} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
