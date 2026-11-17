// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Page-document schema + pure helpers. Single source of truth for multi-page
 * canvas structure in BOTH modes (collaborative Hocuspocus doc and the local
 * Y.Doc a non-collab editor owns).
 *
 * Schema:
 *   meta      Y.Map  — `pagesSeeded` watermark, one-shot migration markers
 *   pagesById Y.Map<pageId, page>
 *   page      Y.Map  — { id, configId, pos, state: Y.Map, config: Y.Map }
 *
 * Ordering uses a fractional `pos` key (lexicographic, base-62): moving a page
 * writes ONE key on the existing Y.Map, so the page keeps its CRDT identity —
 * concurrent edits on a moved page survive, and concurrent reorders converge
 * (ties broken by id). The legacy `pages` Y.Array (clone-delete-insert moves)
 * is migrated once per doc via `migrateLegacyDoc`.
 */

import {
  STATE_KIND_KEY,
  assertWritableState,
  buildStateMap,
  mayWriteStructured,
  posBetween,
  readState,
  readStateKey,
  stateKeyClasses,
  writeStateKeys,
  type StateKeyClasses,
  type StateWriteOptions,
} from '@ggraphic/core/ydoc';
import { posJitter, sameStateValue } from '@ggraphic/core/internal/ydoc/internal';
import { v4 as uuid } from 'uuid';
import * as Y from 'yjs';

import { plainFallbackReporter } from './stateWriteWarnings.js';
import { YDOC_KEYS } from './ydocKeys.js';
import { fromHostKinds } from '../utils/elementKinds.js';

export interface PageDef {
  id: string;
  configId: string;
  state: Record<string, unknown>;
  config?: Record<string, unknown>;
}

export interface PageView {
  id: string;
  configId: string;
  pos: string;
  state: Record<string, unknown>;
  /** Reference to the page's Y.Map — used by GenericCanvas for config binding. */
  yMap: Y.Map<unknown>;
  /**
   * Identifies the page's `state` Y.Map. Edits change the map's entries, never the map; a whole
   * replacement (convert, undo or redo of one) gives the page a new map and so a new epoch.
   */
  stateEpoch: number;
}

export interface SerializedPage {
  id: string;
  configId: string;
  state: Record<string, unknown>;
  config: Record<string, unknown>;
}

// ── fractional ordering ─────────────────────────────────────────────────────

// Moved to `@ggraphic/core/ydoc`, which element order inside a page's state uses too.
export { posBetween };

// ── page-state writes (document version 4) ──────────────────────────────────

/**
 * The editor's key classes: the core's, plus every registered host kind's `stateKey` as a
 * collection. Only the lift and the first structured write of a key need them; readers follow
 * the `$kind` marker (`packages/schema/DOCUMENT_VERSIONING.md`, "Version 4").
 */
export const editorStateKeyClasses: () => StateKeyClasses = fromHostKinds((kinds) =>
  stateKeyClasses(kinds.map((kind) => kind.stateKey))
);

/**
 * Options for `writeStateKeys` into a live state map. `lift` may always be on: the codec reads
 * the stamp inside the transaction and writes plain JSON into a document below version 4
 * (rule 1), so a writer in a version 3 document that is not being lifted stays plain.
 */
const liveWrite = (doc: Y.Doc, deterministic = false): StateWriteOptions => ({
  classes: editorStateKeyClasses(),
  lift: true,
  deterministic,
  onPlainFallback: plainFallbackReporter(doc),
});

/**
 * Options for `buildStateMap` of a map that `doc` will hold. A map outside a document cannot
 * read a stamp, so the caller's document decides: structured only at version 4 or above, which
 * a seed must therefore stamp before it builds (rule 1).
 */
const builtFor = (doc: Y.Doc): StateWriteOptions => ({
  classes: editorStateKeyClasses(),
  lift: mayWriteStructured(doc),
  onPlainFallback: plainFallbackReporter(doc),
});

// ── doc accessors ───────────────────────────────────────────────────────────

export const getPagesMap = (doc: Y.Doc): Y.Map<Y.Map<unknown>> =>
  doc.getMap<Y.Map<unknown>>(YDOC_KEYS.pagesById);

export const getMetaMap = (doc: Y.Doc): Y.Map<unknown> => doc.getMap<unknown>(YDOC_KEYS.meta);

const stateEpochs = new WeakMap<object, number>();
let nextStateEpoch = 1;
const epochOf = (stateY: unknown): number => {
  if (!(stateY instanceof Y.Map)) return 0;
  let epoch = stateEpochs.get(stateY);
  if (epoch === undefined) {
    epoch = nextStateEpoch++;
    stateEpochs.set(stateY, epoch);
  }
  return epoch;
};

const pageToView = (yMap: Y.Map<unknown>): PageView | null => {
  const id = yMap.get(YDOC_KEYS.id);
  const configId = yMap.get(YDOC_KEYS.configId);
  const pos = yMap.get(YDOC_KEYS.pos);
  if (typeof id !== 'string' || typeof configId !== 'string' || typeof pos !== 'string') {
    return null;
  }
  const stateY = yMap.get(YDOC_KEYS.state);
  // Through the codec: a structured key reads as its plain JSON (memoised per map; callers must
  // not mutate it, as with the stored plain objects before).
  const state = stateY instanceof Y.Map ? readState(stateY) : {};
  return { id, configId, pos, state, yMap, stateEpoch: epochOf(stateY) };
};

/** All pages, sorted by (pos, id) — the canonical page order. */
export function readPages(doc: Y.Doc): PageView[] {
  const views: PageView[] = [];
  getPagesMap(doc).forEach((yMap) => {
    const view = pageToView(yMap);
    if (view) views.push(view);
  });
  views.sort((a, b) => (a.pos < b.pos ? -1 : a.pos > b.pos ? 1 : a.id < b.id ? -1 : 1));
  return views;
}

// ── page construction / cloning ─────────────────────────────────────────────

/**
 * A page Y.Map for `doc`. Its state is built through the codec: structured where `doc` is at
 * version 4 or above (stamp first, in the same transaction), plain JSON below.
 */
export function buildPage(doc: Y.Doc, def: PageDef, pos: string): Y.Map<unknown> {
  const page = new Y.Map<unknown>();
  page.set(YDOC_KEYS.id, def.id);
  page.set(YDOC_KEYS.configId, def.configId);
  page.set(YDOC_KEYS.pos, pos);
  page.set(YDOC_KEYS.state, buildStateMap(def.state, builtFor(doc)));
  // config is otherwise created on demand by bindCanvasStoreToYMap
  // when the page first mounts in a GenericCanvas.
  if (def.config && Object.keys(def.config).length > 0) {
    const config = new Y.Map<unknown>();
    for (const [k, v] of Object.entries(def.config)) config.set(k, v);
    page.set(YDOC_KEYS.config, config);
  }
  return page;
}

const cloneYMapShallow = (source: Y.Map<unknown>): Y.Map<unknown> => {
  const copy = new Y.Map<unknown>();
  // Plain values are copied, not shared: a duplicated page's arrays (`groups`,
  // element lists) must not alias the source page's.
  for (const [k, v] of source.entries()) {
    copy.set(k, v instanceof Y.AbstractType ? v.clone() : structuredClone(v));
  }
  return copy;
};

/**
 * A copy of a page's state for `doc`: read through the codec and built again, so a structured
 * key becomes a new, independent structure (fresh maps, the deterministic order chain) and no
 * plain object is shared with the source. Yjs values the codec does not own (no `$kind`; no
 * writer creates them, but a legacy page may carry one) are cloned as before.
 */
const cloneState = (doc: Y.Doc, source: Y.Map<unknown>): Y.Map<unknown> => {
  const plain: Record<string, unknown> = {};
  const foreign = new Map<string, Y.AbstractType<unknown>>();
  for (const [k, v] of source.entries()) {
    if (v instanceof Y.AbstractType && !(v instanceof Y.Map && v.has(STATE_KIND_KEY))) {
      foreign.set(k, v as Y.AbstractType<unknown>);
    } else {
      // `readStateKey` of an unknown class is absent; such a doc is refused and never cloned.
      const value = readStateKey(source, k);
      if (value !== undefined || !(v instanceof Y.AbstractType)) plain[k] = structuredClone(value);
    }
  }
  const copy = buildStateMap(plain, builtFor(doc));
  for (const [k, v] of foreign) copy.set(k, v.clone());
  return copy;
};

/** Deep-clone a page's state and config into a fresh Y.Map for `doc`. */
export function clonePage(
  doc: Y.Doc,
  source: Y.Map<unknown>,
  newId: string,
  pos: string
): Y.Map<unknown> {
  const page = new Y.Map<unknown>();
  page.set(YDOC_KEYS.id, newId);
  page.set(YDOC_KEYS.configId, source.get(YDOC_KEYS.configId) ?? 'unknown');
  page.set(YDOC_KEYS.pos, pos);

  const sourceState = source.get(YDOC_KEYS.state);
  page.set(
    YDOC_KEYS.state,
    sourceState instanceof Y.Map ? cloneState(doc, sourceState) : new Y.Map<unknown>()
  );

  const sourceConfig = source.get(YDOC_KEYS.config);
  if (sourceConfig instanceof Y.Map) {
    page.set(YDOC_KEYS.config, cloneYMapShallow(sourceConfig));
  }

  return page;
}

// ── mutations (call inside doc.transact with your origin) ───────────────────

/**
 * Heal a doc whose pos keys collided (pre-jitter concurrent ops): re-space
 * every page along a fresh chain in the current canonical order.
 * Deterministic — two clients normalizing the same view write identical keys.
 */
export function normalizePositions(doc: Y.Doc): void {
  let pos: string | null = null;
  for (const view of readPages(doc)) {
    pos = posBetween(pos, null);
    if (view.pos !== pos) view.yMap.set(YDOC_KEYS.pos, pos);
  }
}

/** pos strictly between the neighbors at `index`; normalizes tied keys first. */
export function posForInsert(doc: Y.Doc, index: number): string {
  let views = readPages(doc);
  const clamped = Math.max(0, Math.min(index, views.length));
  let before = clamped > 0 ? views[clamped - 1].pos : null;
  let after = clamped < views.length ? views[clamped].pos : null;
  if (before !== null && after !== null && before >= after) {
    normalizePositions(doc);
    views = readPages(doc);
    before = clamped > 0 ? views[clamped - 1].pos : null;
    after = clamped < views.length ? views[clamped].pos : null;
  }
  return posJitter(posBetween(before, after));
}

// Each checks the state first: `posForInsert` may re-space the pages before the page is built.
export function insertPageAt(doc: Y.Doc, index: number, def: PageDef): void {
  assertWritableState(def.state, builtFor(doc));
  getPagesMap(doc).set(def.id, buildPage(doc, def, posForInsert(doc, index)));
}

export function appendPage(doc: Y.Doc, def: PageDef): void {
  assertWritableState(def.state, builtFor(doc));
  getPagesMap(doc).set(def.id, buildPage(doc, def, posForInsert(doc, Number.MAX_SAFE_INTEGER)));
}

/** Clone `sourceId` (state + config) and insert it right after the source. */
export function duplicatePageById(doc: Y.Doc, sourceId: string, newId: string): boolean {
  const pagesMap = getPagesMap(doc);
  const source = pagesMap.get(sourceId);
  if (!source) return false;
  const idx = readPages(doc).findIndex((v) => v.id === sourceId);
  pagesMap.set(newId, clonePage(doc, source, newId, posForInsert(doc, idx + 1)));
  return true;
}

export function removePageById(doc: Y.Doc, id: string): void {
  getPagesMap(doc).delete(id);
}

/** Move one step up/down by rewriting only the page's `pos` key. */
export function movePageById(doc: Y.Doc, id: string, direction: 'up' | 'down'): void {
  let views = readPages(doc);
  let idx = views.findIndex((v) => v.id === id);
  if (idx < 0) return;
  const target = direction === 'up' ? idx - 1 : idx + 1;
  if (target < 0 || target >= views.length) return;
  const bounds = (): [string | null, string | null] => {
    const neighbor = views[target];
    const beyond = direction === 'up' ? views[target - 1] : views[target + 1];
    return direction === 'up'
      ? [beyond ? beyond.pos : null, neighbor.pos]
      : [neighbor.pos, beyond ? beyond.pos : null];
  };
  let [lo, hi] = bounds();
  if (lo !== null && hi !== null && lo >= hi) {
    normalizePositions(doc);
    views = readPages(doc);
    idx = views.findIndex((v) => v.id === id);
    [lo, hi] = bounds();
  }
  views[idx].yMap.set(YDOC_KEYS.pos, posJitter(posBetween(lo, hi)));
}

/**
 * Patch fields on a page's `state` Y.Map, through the codec: a structured key
 * gets only its changed elements, properties, ids and positions written, a
 * plain key is set when its value changed. Structural (JSON) equality guard:
 * Y.Map.set on an identical value still emits an update, and echoed updates
 * ping-pong between clients via useYjsPageStateSync + GenericCanvas's
 * synced-image-key re-emission.
 */
export function updatePageStateById(
  doc: Y.Doc,
  id: string,
  partial: Record<string, unknown>
): void {
  const page = getPagesMap(doc).get(id);
  if (!page) return;
  const stateY = page.get(YDOC_KEYS.state);
  if (!(stateY instanceof Y.Map)) return;
  writeStateKeys(stateY as Y.Map<unknown>, partial, liveWrite(doc));
}

/**
 * Convert a page to another template in place: replaces `configId` and the
 * whole `state` map while keeping id and pos.
 */
export function setPageConfigById(
  doc: Y.Doc,
  id: string,
  configId: string,
  newState: Record<string, unknown>
): void {
  const page = getPagesMap(doc).get(id);
  if (!page) return;
  // Built first: a state the codec rejects throws before the page changes.
  const state = buildStateMap(newState, builtFor(doc));
  page.set(YDOC_KEYS.configId, configId);
  page.set(YDOC_KEYS.state, state);
}

/**
 * Make a page's state map equal `state` in place: absent keys deleted, changed keys set. A
 * state the codec would reject throws before anything, the deletions included, is written.
 * `deterministic`: the writes are a pure function of the document and `state` (the codec's
 * `deterministic` option), for the version steps inside the deterministic lift transaction.
 */
export function replacePageState(
  doc: Y.Doc,
  pageId: string,
  state: Record<string, unknown>,
  options: { deterministic?: boolean } = {}
): void {
  const stateY = getPagesMap(doc).get(pageId)?.get(YDOC_KEYS.state);
  if (!(stateY instanceof Y.Map)) return;
  const write = liveWrite(doc, options.deterministic === true);
  assertWritableState(state, write, stateY as Y.Map<unknown>);
  for (const key of Array.from(stateY.keys())) {
    if (!(key in state)) stateY.delete(key);
  }
  writeStateKeys(stateY as Y.Map<unknown>, state, write);
}

// Moved to `@ggraphic/core/ydoc`, beside the codec that compares across its boundary with it.
export { sameStateValue };

/**
 * Write `target` into a page's state for each of `keys` the caller reports
 * as untouched (given the live value); a key absent from `target` is deleted.
 */
export function restorePageStateKeys(
  doc: Y.Doc,
  pageId: string,
  target: Record<string, unknown>,
  keys: Iterable<string>,
  untouched: (key: string, live: unknown) => boolean
): void {
  const stateY = getPagesMap(doc).get(pageId)?.get(YDOC_KEYS.state);
  if (!(stateY instanceof Y.Map)) return;
  for (const k of keys) {
    if (!untouched(k, readStateKey(stateY, k))) continue;
    if (!Object.hasOwn(target, k)) {
      if (stateY.has(k)) stateY.delete(k);
    } else {
      writeStateKeys(stateY as Y.Map<unknown>, { [k]: target[k] }, liveWrite(doc));
    }
  }
}

export interface ReplaceDeckOps {
  /** Whole-state replacement: keys absent from `state` are deleted. */
  updates: { pageId: string; state: Record<string, unknown> }[];
  /** `afterPageId: null` inserts at the front; later inserts may follow earlier ones via `pageId`. */
  inserts: {
    afterPageId: string | null;
    configId: string;
    state: Record<string, unknown>;
    pageId?: string;
  }[];
  removes: string[];
}

/**
 * Apply a recomposed deck in ONE transaction (one undo step when `origin` is
 * tracked). Unlike updatePageStateById the state map is replaced, not patched:
 * a recomposed page may have dropped elements. The existing state Y.Map is
 * mutated in place (not swapped) so observers on it — useYjsPageStateSync —
 * keep firing. Order: updates, inserts (sequential), removes — so an insert
 * may anchor on a page that is removed in the same call. A state the codec
 * would reject throws before any page is written.
 */
export function replaceDeck(doc: Y.Doc, ops: ReplaceDeckOps, origin: unknown): string[] {
  const insertedIds: string[] = [];
  const pagesMap = getPagesMap(doc);
  for (const { pageId, state } of ops.updates) {
    const stateY = pagesMap.get(pageId)?.get(YDOC_KEYS.state);
    if (stateY instanceof Y.Map)
      assertWritableState(state, liveWrite(doc), stateY as Y.Map<unknown>);
  }
  for (const { state } of ops.inserts) assertWritableState(state, builtFor(doc));
  doc.transact(() => {
    for (const { pageId, state } of ops.updates) replacePageState(doc, pageId, state);
    for (const ins of ops.inserts) {
      const index =
        ins.afterPageId === null
          ? 0
          : readPages(doc).findIndex((v) => v.id === ins.afterPageId) + 1;
      const id = ins.pageId ?? uuid();
      insertPageAt(doc, index, { id, configId: ins.configId, state: ins.state });
      insertedIds.push(id);
    }
    for (const id of ops.removes) removePageById(doc, id);
  }, origin);
  return insertedIds;
}

// ── seeding ─────────────────────────────────────────────────────────────────

/**
 * Deterministic seed ids: two clients racing to seed the same fresh doc write
 * the same map keys, so the CRDT merge converges to ONE set of pages instead
 * of duplicating them (the old Y.Array seed with uuid ids doubled the deck).
 */
export const seedPageId = (index: number): string => `seed-${index}`;

/** Would `seedPagesIfEmpty` seed `doc`: no pages and no seed watermark? */
export function isUnseeded(doc: Y.Doc): boolean {
  return getPagesMap(doc).size === 0 && getMetaMap(doc).get(YDOC_KEYS.pagesSeeded) !== true;
}

/**
 * Seed a fresh page list. No-op when pages exist or the doc carries the
 * server-authoritative seed watermark. The pages are structured when the doc
 * is stamped version 4 or above already: stamp first, in the same
 * transaction (`useYjsPages`' `seedIfEmpty` does).
 */
export function seedPagesIfEmpty(doc: Y.Doc, defs: PageDef[]): boolean {
  const pagesMap = getPagesMap(doc);
  const meta = getMetaMap(doc);
  if (!isUnseeded(doc)) return false;
  // Every page first: a rejected state must not leave half a seed.
  for (const def of defs) assertWritableState(def.state, builtFor(doc));
  let pos: string | null = null;
  for (const def of defs) {
    pos = posBetween(pos, null);
    pagesMap.set(def.id, buildPage(doc, def, pos));
  }
  meta.set(YDOC_KEYS.pagesSeeded, true);
  return true;
}

// ── serialization (deck autosave / exports) ─────────────────────────────────

export function serializeDeck(doc: Y.Doc): SerializedPage[] {
  return readPages(doc).map((view) => {
    const configY = view.yMap.get(YDOC_KEYS.config);
    return {
      id: view.id,
      configId: view.configId,
      state: view.state,
      config: configY instanceof Y.Map ? configY.toJSON() : {},
    };
  });
}

// ── legacy migration ────────────────────────────────────────────────────────

/**
 * One-shot lazy migration of pre-`pagesById` docs. Handles, in order:
 *  1. `pages` Y.Array (previous multi-page container) → pagesById with pos
 *     derived from array order.
 *  2. `legacy_root` / top-level `config` (single-page collab docs from before
 *     pages existed) → one promoted page.
 * Idempotent: marked in `meta` and skipped when pagesById already has pages.
 * Runs inside one transaction — pass the caller's origin.
 */
export function migrateLegacyDoc(doc: Y.Doc): void {
  const pagesMap = getPagesMap(doc);
  const meta = getMetaMap(doc);
  if (pagesMap.size > 0 || meta.get(YDOC_KEYS.legacyMigrated) === true) return;

  const legacyPages = doc.getArray<Y.Map<unknown>>(YDOC_KEYS.pages);
  if (legacyPages.length > 0) {
    let pos: string | null = null;
    for (const source of legacyPages.toArray()) {
      const id = source.get(YDOC_KEYS.id);
      if (typeof id !== 'string') continue;
      pos = posBetween(pos, null);
      pagesMap.set(id, clonePage(doc, source, id, pos));
    }
    legacyPages.delete(0, legacyPages.length);
    meta.set(YDOC_KEYS.legacyMigrated, true);
    meta.set(YDOC_KEYS.pagesSeeded, true);
    return;
  }

  const legacyRoot = doc.getMap<unknown>(YDOC_KEYS.legacyRoot);
  const hasLegacyConfigType = doc.share.has(YDOC_KEYS.config);
  const legacyConfig = hasLegacyConfigType ? doc.getMap<unknown>(YDOC_KEYS.config) : null;

  const legacyHasContent = legacyRoot.size > 0 || (legacyConfig !== null && legacyConfig.size > 0);
  if (!legacyHasContent) return;

  const promoted = buildPage(
    doc,
    { id: `legacy-${Date.now()}`, configId: 'unknown', state: {} },
    posBetween(null, null)
  );
  if (legacyConfig && legacyConfig.size > 0) {
    promoted.set(YDOC_KEYS.config, cloneYMapShallow(legacyConfig));
    for (const k of Array.from(legacyConfig.keys())) legacyConfig.delete(k);
  }
  pagesMap.set(promoted.get(YDOC_KEYS.id) as string, promoted);
  meta.set(YDOC_KEYS.legacyMigrated, true);
  meta.set(YDOC_KEYS.pagesSeeded, true);
}

/**
 * One-shot heal for docs whose template edits predate per-page dual-writes:
 * they live only in the root `formState` Y.Map. Fold them into the single
 * page's state (multi-page docs are marked folded WITHOUT folding —
 * formState mixes the last edits of ALL pages and can't be attributed).
 *
 * MUST run immediately after the page seed (useYjsPages.seedIfEmpty calls it
 * in the same transaction) — a doc with 0 pages returns without the marker,
 * and folding on some LATER open would overwrite page-state edits the user
 * made in between with the frozen formState snapshot.
 */
export function foldLegacyFormStateIntoFirstPage(doc: Y.Doc): void {
  const meta = getMetaMap(doc);
  if (meta.get(YDOC_KEYS.formStateFolded) === true) return;
  const views = readPages(doc);
  if (views.length === 0) return;
  const formState = doc.getMap<unknown>(YDOC_KEYS.formState);
  if (views.length === 1 && formState.size > 0) {
    const stateY = views[0].yMap.get(YDOC_KEYS.state);
    if (!(stateY instanceof Y.Map)) return;
    const folded: Record<string, unknown> = {};
    formState.forEach((value, key) => {
      if (key.startsWith('_')) return;
      // The codec writes plain JSON only; a Yjs value in the legacy map is folded as its JSON.
      folded[key] = value instanceof Y.AbstractType ? (value.toJSON() as unknown) : value;
    });
    writeStateKeys(stateY as Y.Map<unknown>, folded, liveWrite(doc));
  }
  meta.set(YDOC_KEYS.formStateFolded, true);
}
