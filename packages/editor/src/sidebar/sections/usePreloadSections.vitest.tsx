// SPDX-License-Identifier: AGPL-3.0-only
import { act, render, renderHook, screen } from '@testing-library/react';
import { Suspense } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { lazyWithPreload } from './lazyWithPreload.js';
import { usePreloadSections } from './usePreloadSections.js';

/** A lazy panel and a counter of how often its chunk was asked for. */
function panel(text: string) {
  const load = vi.fn(() => Promise.resolve(() => <p>{text}</p>));
  return { Panel: lazyWithPreload(load), load };
}

const config = (sections: Record<string, { component: unknown }>, tabIds: string[]) => ({
  tabs: tabIds.map((id) => ({ id })),
  sections,
});

/** Lets the idle fallback (2 s without requestIdleCallback) run and the chunk resolve. */
async function idle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4000);
  });
}

const open = (Panel: React.ComponentType) =>
  render(
    <Suspense fallback={<p>loading</p>}>
      <Panel />
    </Suspense>
  );

afterEach(() => {
  vi.useRealTimers();
});

describe('usePreloadSections', () => {
  it('a lazy panel suspends on its first open when nobody warmed it (the control)', () => {
    const { Panel } = panel('cold');
    open(Panel);
    expect(screen.getByText('loading')).toBeTruthy();
    expect(screen.queryByText('cold')).toBeNull();
  });

  it('warms the sections of the config tabs while idle, so the first open renders without a fallback', async () => {
    vi.useFakeTimers();
    const elements = panel('elements');
    const tools = panel('tools');
    renderHook(() =>
      usePreloadSections(
        config({ elements: { component: elements.Panel }, tools: { component: tools.Panel } }, [
          'elements',
          'tools',
        ])
      )
    );
    expect(elements.load).not.toHaveBeenCalled();
    await idle();
    open(elements.Panel);
    expect(screen.getByText('elements')).toBeTruthy();
    expect(screen.queryByText('loading')).toBeNull();
    expect(tools.load).toHaveBeenCalledTimes(1);
  });

  it('skips sections without a tab and components that cannot preload', async () => {
    vi.useFakeTimers();
    const hidden = panel('hidden');
    const Plain = () => <p>plain</p>;
    renderHook(() =>
      usePreloadSections(
        config({ text: { component: Plain }, hidden: { component: hidden.Panel } }, ['text'])
      )
    );
    await idle();
    expect(hidden.load).not.toHaveBeenCalled();
  });

  it('does nothing without a config, and cancels the warm-up on unmount', async () => {
    vi.useFakeTimers();
    const p = panel('gone');
    renderHook(() => usePreloadSections(null));
    const { unmount } = renderHook(() =>
      usePreloadSections(config({ elements: { component: p.Panel } }, ['elements']))
    );
    unmount();
    await idle();
    expect(p.load).not.toHaveBeenCalled();
  });
});
