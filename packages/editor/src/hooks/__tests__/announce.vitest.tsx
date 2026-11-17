// SPDX-License-Identifier: AGPL-3.0-only
import { CanvasAnnouncer } from '../../components/CanvasAnnouncer.js';
import { AnnouncerContext, useLiveAnnouncer } from '../useAnnounce.js';
import {
  SELECTION_ANNOUNCE_DELAY_MS,
  selectionMessage,
  useSelectionAnnouncement,
} from '../useSelectionAnnouncement.js';
import { useAnnounce } from '../../entries/shell.js';
import { CanvasStoreProvider, useCanvasStore } from '../../entries/store.js';
import { act, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { axe } from '../../test-utils';

import type { CanvasEditorStoreApi } from '../../stores/createCanvasEditorStore.js';

let announceFn: (text: string) => void = () => {};
let storeRef: CanvasEditorStoreApi;

function Harness({
  labels = {},
  active = true,
}: {
  labels?: Record<string, string>;
  active?: boolean;
}) {
  const { announcer, message } = useLiveAnnouncer();
  return (
    <AnnouncerContext.Provider value={announcer}>
      <CanvasAnnouncer message={message} />
      <CanvasStoreProvider>
        <Inner labels={labels} active={active} />
      </CanvasStoreProvider>
    </AnnouncerContext.Provider>
  );
}

function Inner({ labels, active }: { labels: Record<string, string>; active: boolean }) {
  const announce = useAnnounce();
  const store = useCanvasStore();
  useEffect(() => {
    announceFn = announce;
    storeRef = store;
  }, [announce, store]);
  useSelectionAnnouncement(store, (id) => labels[id] ?? null, active);
  return null;
}

const region = () => screen.getByRole('status');

describe('CanvasAnnouncer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is an empty, polite live region without violations', async () => {
    vi.useRealTimers();
    const { container } = render(<Harness />);
    expect(region()).toHaveAttribute('aria-live', 'polite');
    expect(region()).toHaveAttribute('aria-atomic', 'true');
    expect(region()).toBeEmptyDOMElement();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('announces, and announces the same sentence again', () => {
    render(<Harness />);
    act(() => {
      announceFn('Rückgängig gemacht');
    });
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(region()).toHaveTextContent('Rückgängig gemacht');
    act(() => {
      announceFn('Rückgängig gemacht');
    });
    expect(region()).toBeEmptyDOMElement();
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(region()).toHaveTextContent('Rückgängig gemacht');
  });
});

describe('selection announcement', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const settle = () =>
    act(() => {
      vi.advanceTimersByTime(SELECTION_ANNOUNCE_DELAY_MS + 100);
    });

  it('words single, multiple and empty selections', () => {
    const labelOf = (id: string) => (id === 'a' ? 'Text: Klimaschutz' : null);
    expect(selectionMessage(['a'], labelOf)).toBe('Text: Klimaschutz ausgewählt');
    expect(selectionMessage(['a', 'b', 'c'], labelOf)).toBe('3 Elemente ausgewählt');
    expect(selectionMessage([], labelOf)).toBe('Auswahl aufgehoben');
  });

  it('announces only the final state of a quick sequence', () => {
    render(<Harness labels={{ a: 'Text: A', b: 'Text: B', c: 'Text: C' }} />);
    act(() => {
      storeRef.getState().setSelectedLayers(['a']);
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    act(() => {
      storeRef.getState().setSelectedLayers(['b']);
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    act(() => {
      storeRef.getState().setSelectedLayers(['c']);
    });
    settle();
    expect(region()).toHaveTextContent('Text: C ausgewählt');
  });

  it('stays silent on an inactive page', () => {
    render(<Harness labels={{ a: 'Text: A' }} active={false} />);
    act(() => {
      storeRef.getState().setSelectedLayers(['a']);
    });
    settle();
    act(() => {
      storeRef.getState().deselectAll();
    });
    settle();
    expect(region()).toBeEmptyDOMElement();
  });

  it('says "Auswahl aufgehoben" only after a selection', () => {
    render(<Harness labels={{ a: 'Text: A' }} />);
    act(() => {
      storeRef.getState().deselectAll();
    });
    settle();
    expect(region()).toBeEmptyDOMElement();
    act(() => {
      storeRef.getState().setSelectedLayers(['a']);
    });
    settle();
    act(() => {
      storeRef.getState().deselectAll();
    });
    settle();
    expect(region()).toHaveTextContent('Auswahl aufgehoben');
  });

  it('yields to an announcement that came in between', () => {
    render(<Harness labels={{ a: 'Text: A' }} />);
    act(() => {
      storeRef.getState().setSelectedLayers(['a']);
    });
    act(() => {
      announceFn('Gelöscht: Text: A');
    });
    settle();
    expect(region()).toHaveTextContent('Gelöscht: Text: A');
  });

  it('stays silent while focus is in the layers list', () => {
    render(
      <>
        <div role="listbox" aria-label="Ebenen">
          <div role="option" aria-selected="false" tabIndex={0} data-testid="opt">
            Text: A
          </div>
        </div>
        <Harness labels={{ a: 'Text: A' }} />
      </>
    );
    screen.getByTestId('opt').focus();
    act(() => {
      storeRef.getState().setSelectedLayers(['a']);
    });
    settle();
    expect(screen.getAllByRole('status')[0]).toBeEmptyDOMElement();
  });
});

describe('undo and redo', () => {
  it('announce what they did, and stay silent without a step', async () => {
    const { renderHook } = await import('@testing-library/react');
    const { useCanvasUndoRedo } = await import('../useCanvasUndoRedo.js');
    const announce = vi.fn();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnnouncerContext.Provider value={{ announce, lastAnnouncedAt: { current: 0 } }}>
        <CanvasStoreProvider>{children}</CanvasStoreProvider>
      </AnnouncerContext.Provider>
    );
    const { result } = renderHook(() => useCanvasUndoRedo(250, undefined, false), { wrapper });
    act(() => {
      result.current.undo();
    });
    expect(announce).not.toHaveBeenCalled();
    act(() => {
      result.current.saveNow({ a: 1 });
    });
    act(() => {
      result.current.saveNow({ a: 2 });
    });
    act(() => {
      result.current.undo();
    });
    expect(announce).toHaveBeenLastCalledWith('Rückgängig gemacht');
    act(() => {
      result.current.redo();
    });
    expect(announce).toHaveBeenLastCalledWith('Wiederhergestellt');
  });
});
