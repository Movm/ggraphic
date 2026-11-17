// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Shared fixtures for the element-storage tests (document version 4, #176): documents in the
 * version 3 and version 4 shape, two Y.Docs with a delivery queue between them, a mounted canvas
 * per document, and readers that look at the stored structure. Test-only; not part of the build.
 */
import { liftDocumentState, stateKeyClasses } from '@ggraphic/core/ydoc';
import { act, render } from '@testing-library/react';
import { expect } from 'vitest';
import * as Y from 'yjs';

import { pagePersistedStateKeys } from '../pageElementStateKeys.js';
import {
  getMetaMap,
  readPages,
  seedPagesIfEmpty,
  serializeDeck,
  updatePageStateById,
} from '../pagesDoc.js';
import { PAGES_STATE_ORIGIN } from '../useYjsPages.js';
import { createPageSyncedCallbacks } from '../wrapCallbacksWithPageSync.js';
import { YDOC_KEYS } from '../ydocKeys.js';
import { GenericCanvas, type GenericCanvasRef } from '../../components/GenericCanvas.js';
import { loadCanvasConfig } from '../../configs/configLoader.js';
import '../../testing/fixtureTemplates';
import { AutoSaveStoreProvider } from '../../stores/AutoSaveStoreProvider.js';

import { createRef, type RefObject } from 'react';

import type { CanvasEditorStoreApi } from '../../stores/createCanvasEditorStore.js';

Object.defineProperty(document, 'fonts', {
  configurable: true,
  value: { check: () => true, load: async () => [], ready: Promise.resolve(), add() {} },
});

export const PAGE_ID = 'seed-0';
export const SHAPES = 'shapeInstances';

export interface Shape {
  id: string;
  x: number;
  [key: string]: unknown;
}

export const shape = (id: string, x: number, extra: Record<string, unknown> = {}): Shape => ({
  id,
  type: 'rect',
  x,
  y: 100,
  width: 200,
  height: 200,
  rotation: 0,
  fill: '#005538',
  ...extra,
});

/** Plain JSON copy: what a document's JSON view looks like to a consumer. */
export const json = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const pageState = (doc: Y.Doc, pageId = PAGE_ID): Record<string, unknown> =>
  readPages(doc).find((p) => p.id === pageId)!.state;

export const stateMapOf = (doc: Y.Doc, pageId = PAGE_ID): Y.Map<unknown> =>
  readPages(doc)
    .find((p) => p.id === pageId)!
    .yMap.get(YDOC_KEYS.state) as Y.Map<unknown>;

export const shapesOf = (state: Record<string, unknown>): Shape[] =>
  (state[SHAPES] as Shape[] | undefined) ?? [];
export const idsOf = (state: Record<string, unknown>): string[] => shapesOf(state).map((s) => s.id);
export const xOf = (state: Record<string, unknown>, id: string): number | undefined =>
  shapesOf(state).find((s) => s.id === id)?.x;
export const yOf = (state: Record<string, unknown>, id: string): number | undefined =>
  shapesOf(state).find((s) => s.id === id)?.y as number | undefined;
/** The shapes' order in `layerOrder` (which also lists the template's own layers). */
export const shapeOrder = (state: Record<string, unknown>): string[] =>
  ((state.layerOrder as string[] | undefined) ?? []).filter((id) => /^s\d+$/.test(id));

/** Is this key stored as a Yjs structure (not plain JSON)? */
export const isStructured = (doc: Y.Doc, key: string, pageId = PAGE_ID): boolean =>
  stateMapOf(doc, pageId).get(key) instanceof Y.Map;
export const kindOf = (doc: Y.Doc, key: string, pageId = PAGE_ID): unknown => {
  const value = stateMapOf(doc, pageId).get(key);
  return value instanceof Y.Map ? value.get('$kind') : undefined;
};

export const schemaVersionOf = (doc: Y.Doc): unknown =>
  getMetaMap(doc).get(YDOC_KEYS.schemaVersion);

/**
 * A document in the version 3 shape: every key plain JSON, stamped 3, the legacy fold done.
 * Built by hand over a seed, so it stays plain whatever the seed writes.
 */
export function v3Doc(
  pages: { id: string; configId: string; state: Record<string, unknown> }[],
  clientID?: number
): Y.Doc {
  const doc = new Y.Doc();
  if (clientID !== undefined) doc.clientID = clientID;
  seedPagesIfEmpty(doc, pages);
  doc.transact(() => {
    for (const page of pages) {
      const stateY = stateMapOf(doc, page.id);
      for (const [k, v] of Object.entries(page.state)) stateY.set(k, structuredClone(v));
    }
    getMetaMap(doc).set(YDOC_KEYS.schemaVersion, 3);
    getMetaMap(doc).set(YDOC_KEYS.formStateFolded, true);
  });
  return doc;
}

/** A document in the version 4 shape: lifted with the codec and stamped 4. */
export function v4Doc(
  pages: { id: string; configId: string; state: Record<string, unknown> }[],
  clientID?: number
): Y.Doc {
  const doc = v3Doc(pages, clientID);
  doc.transact(() => {
    liftDocumentState(doc, stateKeyClasses([]));
    getMetaMap(doc).set(YDOC_KEYS.schemaVersion, 4);
  });
  return doc;
}

/** A replica of `doc` at this moment (a client that has synced and is not editing). */
export const replicaOf = (doc: Y.Doc): Y.Doc => {
  const replica = new Y.Doc();
  Y.applyUpdate(replica, Y.encodeStateAsUpdate(doc));
  return replica;
};

/** Two docs with a network between them that delivers only on `flush()`. */
export function linkedDocs(makeDoc: (clientID: number) => Y.Doc) {
  const a = makeDoc(2);
  const b = new Y.Doc();
  b.clientID = 1;
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

export interface LiveClient {
  doc: Y.Doc;
  /** The canvas's own state and actions, as the page reports them. */
  live: { state: Record<string, unknown>; actions: Record<string, unknown> };
  ref: RefObject<GenericCanvasRef | null>;
  /** The canvas's editor store; null when the test did not pass a `latestStore`. */
  store: CanvasEditorStoreApi | null;
}

/**
 * A mounted `GenericCanvas` on `doc`'s first page, wired like the page manager wires it: a
 * canvas emit becomes `updatePageStateById` with the shared state origin.
 */
export async function mountClient(
  doc: Y.Doc,
  options: { latestStore?: () => unknown } = {}
): Promise<LiveClient> {
  const config = await loadCanvasConfig('fixture-poster');
  const page = readPages(doc)[0]!;
  const callbacks = createPageSyncedCallbacks(
    () => ({}),
    (partial) => doc.transact(() => updatePageStateById(doc, page.id, partial), PAGES_STATE_ORIGIN),
    pagePersistedStateKeys()
  );
  const live: LiveClient['live'] = { state: {}, actions: {} };
  const ref = createRef<GenericCanvasRef>();
  await act(async () => {
    render(
      <AutoSaveStoreProvider>
        <GenericCanvas
          forwardedRef={ref}
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
  const store = (options.latestStore?.() as CanvasEditorStoreApi | undefined) ?? null;
  return { doc, live, ref, store };
}

type UpdateShape = (id: string, partial: Partial<Shape>) => void;
export const updateShape = (client: LiveClient, id: string, partial: Partial<Shape>) =>
  act(async () => {
    (client.live.actions.updateShape as UpdateShape)(id, partial);
  });

/** What every consumer of a client sees: its document's JSON view and its canvas's state. */
export const views = (...clients: LiveClient[]) =>
  clients.flatMap((c) => [
    { who: `doc ${c.doc.clientID}`, state: pageState(c.doc) },
    { who: `canvas ${c.doc.clientID}`, state: c.live.state },
  ]);

/** Run `pick` on every view (two docs and two canvases) and expect the same answer from each. */
export function expectEveryView<T>(
  clients: LiveClient[],
  pick: (state: Record<string, unknown>) => T,
  expected: T
) {
  for (const view of views(...clients)) expect(pick(view.state), view.who).toEqual(expected);
}

/** The two Y.Docs and both canvases show the same value; returns it. */
export function agreedValue<T>(
  clients: LiveClient[],
  pick: (state: Record<string, unknown>) => T
): T {
  const [first, ...rest] = views(...clients);
  const value = pick(first!.state);
  for (const view of rest) expect(pick(view.state), `${view.who} vs ${first!.who}`).toEqual(value);
  return value;
}

/** Everything a doc's pages carry as JSON, for before/after comparisons. */
export const deckJson = (doc: Y.Doc) => json(serializeDeck(doc));
