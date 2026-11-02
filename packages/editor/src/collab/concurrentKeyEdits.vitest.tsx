// SPDX-License-Identifier: MPL-2.0
/**
 * Repro: two clients edit DIFFERENT elements of the same collection key at
 * the same time (before either has received the other's update).
 */
import { pagePersistedStateKeys } from './pageElementStateKeys.js';
import { readPages, seedPagesIfEmpty, updatePageStateById } from './pagesDoc.js';
import { PAGES_STATE_ORIGIN } from './useYjsPages.js';
import { createPageSyncedCallbacks } from './wrapCallbacksWithPageSync.js';
import { GenericCanvas } from '../components/GenericCanvas.js';
import { loadCanvasConfig } from '../configs/configLoader.js';
import '../testing/fixtureTemplates';
import { AutoSaveStoreProvider } from '../stores/AutoSaveStoreProvider.js';

import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

const PAGE_ID = 'seed-0';
type Shape = { id: string; x: number; [k: string]: unknown };
const shape = (id: string, x: number): Shape => ({
  id,
  type: 'rect',
  x,
  y: 100,
  width: 200,
  height: 200,
  rotation: 0,
  fill: '#005538',
});
const pageState = (doc: Y.Doc) => readPages(doc).find((p) => p.id === PAGE_ID)!.state;
const xOf = (state: Record<string, unknown>, id: string) =>
  (state.shapeInstances as Shape[]).find((s) => s.id === id)?.x;

async function mountClient(doc: Y.Doc, config: unknown) {
  const page = readPages(doc)[0];
  const callbacks = createPageSyncedCallbacks(
    () => ({}),
    (partial) => doc.transact(() => updatePageStateById(doc, PAGE_ID, partial), PAGES_STATE_ORIGIN),
    pagePersistedStateKeys()
  );
  const live = { state: {} as Record<string, unknown>, actions: {} as Record<string, unknown> };
  await act(async () => {
    render(
      <AutoSaveStoreProvider>
        <GenericCanvas
          config={config as never}
          initialProps={page.state}
          onExport={() => {}}
          onCancel={() => {}}
          callbacks={callbacks}
          autoSave={false}
          onLiveState={(state, actions) => {
            live.state = state;
            live.actions = actions;
          }}
          pageBinding={{ pageYMap: page.yMap, isSynced: true }}
        />
      </AutoSaveStoreProvider>
    );
  });
  return live;
}

/** Two docs with a network in between that only delivers on `flush()`. */
function linkedDocs(seed: Record<string, unknown>) {
  const a = new Y.Doc();
  seedPagesIfEmpty(a, [{ id: PAGE_ID, configId: 'fixture-poster', state: seed }]);
  const b = new Y.Doc();
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  const toA: Uint8Array[] = [];
  const toB: Uint8Array[] = [];
  a.on('update', (u: Uint8Array, origin: unknown) => origin !== 'net' && toB.push(u));
  b.on('update', (u: Uint8Array, origin: unknown) => origin !== 'net' && toA.push(u));
  const flush = () =>
    act(async () => {
      while (toA.length || toB.length) {
        for (const u of toB.splice(0)) Y.applyUpdate(b, u, 'net');
        for (const u of toA.splice(0)) Y.applyUpdate(a, u, 'net');
      }
    });
  return { a, b, flush };
}

describe('concurrent edits of different elements in one collection key', () => {
  it('both moves survive', async () => {
    const config = await loadCanvasConfig('fixture-poster');
    const { a, b, flush } = linkedDocs({ shapeInstances: [shape('s1', 100), shape('s2', 100)] });
    const liveA = await mountClient(a, config);
    const liveB = await mountClient(b, config);
    await flush();

    // Within one network round trip: neither client has the other's update yet.
    await act(async () => {
      (liveA.actions.updateShape as (id: string, p: Partial<Shape>) => void)('s1', { x: 500 });
      (liveB.actions.updateShape as (id: string, p: Partial<Shape>) => void)('s2', { x: 900 });
    });
    await flush();

    const report = {
      clientIds: { a: a.clientID, b: b.clientID },
      docA: [xOf(pageState(a), 's1'), xOf(pageState(a), 's2')],
      docB: [xOf(pageState(b), 's1'), xOf(pageState(b), 's2')],
      canvasA: [xOf(liveA.state, 's1'), xOf(liveA.state, 's2')],
      canvasB: [xOf(liveB.state, 's1'), xOf(liveB.state, 's2')],
    };
    console.log('REPORT', JSON.stringify(report));
    expect(report.docA).toEqual([500, 900]);
  }, 90_000);

  it('a client that was offline: all edits of one side to the key survive', async () => {
    const config = await loadCanvasConfig('fixture-poster');
    const { a, b, flush } = linkedDocs({
      shapeInstances: [shape('s1', 100), shape('s2', 100), shape('s3', 100)],
    });
    const liveA = await mountClient(a, config);
    const liveB = await mountClient(b, config);
    await flush();

    // A is offline for a while and makes three edits; B makes one meanwhile.
    for (const [id, x] of [
      ['s1', 300],
      ['s1', 400],
      ['s3', 700],
    ] as const) {
      await act(async () => {
        (liveA.actions.updateShape as (id: string, p: Partial<Shape>) => void)(id, { x });
      });
    }
    await act(async () => {
      (liveB.actions.updateShape as (id: string, p: Partial<Shape>) => void)('s2', { x: 900 });
    });
    await flush();

    const xs = (s: Record<string, unknown>) => ['s1', 's2', 's3'].map((id) => xOf(s, id));
    console.log(
      'OFFLINE',
      JSON.stringify({
        aWinsTie: a.clientID > b.clientID,
        docA: xs(pageState(a)),
        docB: xs(pageState(b)),
      })
    );
    expect(xs(pageState(a))).toEqual([400, 900, 700]);
  }, 90_000);
});
