// SPDX-License-Identifier: MPL-2.0
/**
 * A page reports the stamps of the steps its Undo and Redo would reach, so the
 * shell can weigh them against the page-level history (`utils/historyStamp`).
 * An edit still waiting for its debounce counts as a step: Undo writes it
 * first, and reading the stamps writes it too.
 */
import { act, cleanup, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { GenericCanvas, type GenericCanvasRef } from '../GenericCanvas.js';
import { loadCanvasConfig } from '../../configs/configLoader.js';
import { AutoSaveStoreProvider } from '../../stores/AutoSaveStoreProvider.js';
import { nextHistoryStamp } from '../../utils/historyStamp.js';

import '../../testing/fixtureTemplates';

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

let config: Awaited<ReturnType<typeof loadCanvasConfig>>;
beforeAll(async () => {
  config = await loadCanvasConfig('fixture-note');
}, 120_000);

afterEach(cleanup);

async function mount() {
  const ref = createRef<GenericCanvasRef>();
  const live = { actions: {} as Record<string, (...args: never[]) => unknown> };
  await act(async () => {
    render(
      <AutoSaveStoreProvider>
        <GenericCanvas
          forwardedRef={ref}
          config={config as never}
          initialProps={{ primary: 'Wirkt' }}
          onExport={() => {}}
          onCancel={() => {}}
          autoSave={false}
          onLiveState={(_state, actions) => {
            live.actions = actions as typeof live.actions;
          }}
        />
      </AutoSaveStoreProvider>
    );
  });
  // The first state of the page lands in its history a beat after it mounts.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  const stamps = () => ref.current!.historyStamps!();
  const run = async (fn: () => void) => {
    await act(async () => {
      fn();
    });
  };
  return { ref, live, stamps, run };
}

describe('GenericCanvas historyStamps', () => {
  it('has nothing to undo or redo on a fresh page', async () => {
    const { stamps } = await mount();
    expect(stamps()).toEqual({ undo: null, redo: null });
  });

  it('stamps the step Undo would take back from the history clock', async () => {
    const { live, stamps, run } = await mount();
    const before = nextHistoryStamp();
    await run(() => (live.actions.addShape as (type: string) => void)('rect'));
    const { undo, redo } = stamps();
    expect(undo).toBeGreaterThan(before);
    expect(undo).toBeLessThan(nextHistoryStamp());
    expect(redo).toBeNull();
  });

  it('moves the step to Redo when it is undone, with the stamp it had', async () => {
    const { ref, live, stamps, run } = await mount();
    await run(() => (live.actions.addShape as (type: string) => void)('rect'));
    const taken = stamps().undo;

    await run(() => ref.current!.undo!());
    expect(stamps()).toEqual({ undo: null, redo: taken });

    await run(() => ref.current!.redo!());
    expect(stamps()).toEqual({ undo: taken, redo: null });
  });

  it('counts an edit that still waits for its debounce, and writes it', async () => {
    const { ref, live, stamps, run } = await mount();
    await run(() => (live.actions.addShape as (type: string) => void)('rect'));
    const added = stamps().undo!;

    // Typed just now: the page's history does not hold it yet.
    await run(() => (live.actions.setPrimary as (text: string) => void)('Neu'));
    const typed = stamps().undo!;
    expect(typed).toBeGreaterThan(added);

    // It is a step of its own, behind the shape.
    await run(() => ref.current!.undo!());
    expect(stamps()).toEqual({ undo: added, redo: typed });
  });
});
