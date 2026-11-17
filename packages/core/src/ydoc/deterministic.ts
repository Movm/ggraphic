// SPDX-License-Identifier: AGPL-3.0-only
/**
 * The deterministic lift identity of document version 4 (normative:
 * `packages/schema/DOCUMENT_VERSIONING.md`, "Version 4", "Lift and re-lift").
 *
 * Two clients that lift the same document state must write the same Yjs structs, so that Yjs
 * treats them as one and later edits on both sides land in one structure. A struct is identified
 * by (client, clock), and Yjs integrates a struct it already holds by id without comparing its
 * content. So the lift runs under a client id derived from the document state, its clocks start
 * where that client's clock stands in the state (at 0 for a fresh id), and every write in it must
 * be a pure function of that state: same order, same content.
 *
 * The derived id is part of the format (F0): every build that lifts must derive it exactly so,
 * or its lifts stop merging with everyone else's (they fall back to key-level last-writer-wins,
 * which loses one side's edits made before the lifts met).
 */
import * as Y from 'yjs';

import { type StateKeyClasses } from './stateKeyClasses.js';

/** Versions the derivation below; part of every derived id's input. F0. */
export const LIFT_ID_ALGORITHM = 'ggraphic-lift-id/1';

/** Derived ids live above every id Yjs generates (`random.uint32()`), so they never meet one. */
const DERIVED_ID_FLOOR = 2 ** 32;
const DERIVED_ID_RANGE = Number.MAX_SAFE_INTEGER + 1 - DERIVED_ID_FLOOR;

/**
 * cyrb53 (bryc, public domain) over bytes: a 53-bit, well-mixed, non-cryptographic hash. F0:
 * the derived id depends on every bit of it.
 */
export function cyrb53(bytes: Uint8Array, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (const byte of bytes) {
    h1 = Math.imul(h1 ^ byte, 2654435761);
    h2 = Math.imul(h2 ^ byte, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * The client id a deterministic transaction of `doc`, for a writer described by `salt`, runs
 * under. Input, as bytes: UTF-8 of `LIFT_ID_ALGORITHM + '\n' + salt + '\n'`, then
 * `Y.encodeSnapshot(Y.snapshot(doc))`: the state vector and the delete set, both in Yjs's
 * canonical encoding (clients sorted, deleted clock ranges merged). The state vector alone is
 * not enough: a map key's deletion adds no struct, so two replicas with one state vector can
 * differ in what they delete, and would lift different content under one id. The salt names
 * whatever else the writes depend on (the build's key classes and target versions), so two
 * builds that would write differently never share an id.
 *
 * The hash is mapped into [2^32, 2^53). If the id already has structs in `doc` (an earlier
 * lift, or a collision), it is hashed again with one more byte, 1, 2, … appended, until it has
 * none: a deterministic transaction never appends to a range another state started.
 */
export function deterministicClientId(doc: Y.Doc, salt: string): number {
  const head = new TextEncoder().encode(`${LIFT_ID_ALGORITHM}\n${salt}\n`);
  const state = Y.encodeSnapshot(Y.snapshot(doc));
  const used = Y.decodeStateVector(Y.encodeStateVector(doc));
  for (let attempt = 0; ; attempt++) {
    const input = new Uint8Array(head.length + state.length + (attempt > 0 ? 1 : 0));
    input.set(head, 0);
    input.set(state, head.length);
    if (attempt > 0) input[input.length - 1] = attempt & 0xff;
    const id = DERIVED_ID_FLOOR + (cyrb53(input) % DERIVED_ID_RANGE);
    if (!used.has(id)) return id;
    if (attempt >= 255) throw new Error('deterministicClientId: no free id');
  }
}

const byCodePoint = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The salt of the open-time lift (F0): everything its writes depend on besides the document,
 * as canonical JSON: `["lift", schemaVersion, [[stateKey, version], …], [[key, class], …]]`,
 * both lists sorted by key. `versions` are the versions the writer brings the document to (its
 * registry's core version and the host kinds' versions above 1), `classes` its key classes.
 */
export function liftSalt(
  versions: { schemaVersion: number; kindVersions: Readonly<Record<string, number>> },
  classes: StateKeyClasses
): string {
  const kinds = Object.entries(versions.kindVersions)
    .filter(([, version]) => version > 1)
    .sort(([a], [b]) => byCodePoint(a, b));
  const keyClasses = Array.from(classes.entries()).sort(([a], [b]) => byCodePoint(a, b));
  return JSON.stringify(['lift', versions.schemaVersion, kinds, keyClasses]);
}

/** Is `id` one `deterministicClientId` can return (above every id Yjs generates)? */
export const isDerivedClientId = (id: number): boolean =>
  Number.isSafeInteger(id) && id >= DERIVED_ID_FLOOR;

/**
 * Run `fn` in a new, outermost transaction whose structs are written under
 * `deterministicClientId(doc, salt)`. `fn` must write only what is a pure function of the
 * document state and `salt` (the codec's `deterministic` writes, the lift, version stamps): any
 * other write, a random key or a timestamp, would give two replicas different content under one
 * struct id, and they would never converge.
 *
 * The document's own id is set back before the transaction's observers, `afterTransaction` and
 * `update` handlers run (they run in its cleanup, after `fn`), so nothing outside `fn`, a
 * provider or the awareness protocol included, ever sees the derived id. Throws inside another
 * transaction, whose other writes would be part of this one's update and state.
 */
export function transactDeterministically<T>(
  doc: Y.Doc,
  salt: string,
  fn: () => T,
  origin?: unknown
): T {
  if (doc._transaction !== null) {
    throw new Error('transactDeterministically: must not run inside another transaction');
  }
  const derived = deterministicClientId(doc, salt);
  return doc.transact(() => {
    const own = doc.clientID;
    doc.clientID = derived;
    try {
      return fn();
    } finally {
      doc.clientID = own;
    }
  }, origin);
}
