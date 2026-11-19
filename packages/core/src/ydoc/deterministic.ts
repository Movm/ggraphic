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

import { holdingReports } from './reports.js';
import { type StateKeyClasses } from './stateKeyClasses.js';

/** Versions the derivation below; part of every derived id's input. F0. */
export const LIFT_ID_ALGORITHM = 'ggraphic-lift-id/2';

/** Derived ids live above every id Yjs generates (`random.uint32()`), so they never meet one. */
const DERIVED_ID_FLOOR = 2 ** 32;
const DERIVED_ID_RANGE = Number.MAX_SAFE_INTEGER + 1 - DERIVED_ID_FLOOR;

/**
 * cyrb53 (bryc, public domain) in a byte variant: it mixes each byte where the original mixes
 * each UTF-16 code unit of a string. A 53-bit, well-mixed, non-cryptographic hash. F0, with
 * seed 0: the derived id depends on every bit of it; the test vectors are in
 * `deterministic.vitest.ts`.
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

/** UTF-8 bytes of `text` (as `TextEncoder` gives them; the core has no DOM or Node types). */
function utf8(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of text) {
    let code = char.codePointAt(0)!;
    // A lone surrogate is encoded as U+FFFD, as TextEncoder does.
    if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 63),
        0x80 | ((code >> 6) & 63),
        0x80 | (code & 63)
      );
    }
  }
  return Uint8Array.from(bytes);
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
 * lift, or a collision), attempt k (1 ≤ k ≤ 255) hashes the input with one more byte of value k
 * appended, and the first id the document does not name is used: a deterministic transaction
 * never appends to a range another state started. If all 256 attempts are taken it throws, before
 * anything is written (about 2^-53 per attempt; not reachable in practice).
 *
 * Normative in `DOCUMENT_VERSIONING.md`, "Deterministic lift identity". The bytes written under
 * the id are specified by this implementation together with its golden tests.
 */
export function deterministicClientId(doc: Y.Doc, salt: string): number {
  const head = utf8(`${LIFT_ID_ALGORITHM}\n${salt}\n`);
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

/** UTF-16 code-unit order (JavaScript's `<` on strings). F0 for the deterministic writes. */
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

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
    .sort(([a], [b]) => byCodeUnit(a, b));
  const keyClasses = Array.from(classes.entries()).sort(([a], [b]) => byCodeUnit(a, b));
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
 * provider or the awareness protocol included, ever sees the derived id. Reports `fn` produces
 * (`onPlainFallback`) are delivered after this has returned, never inside `fn`. Throws inside
 * another transaction, whose other writes would be part of this one's update and state.
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
  // Reports found inside (`onPlainFallback`) wait until this has returned: a hook must neither
  // write under the derived id nor abort the transaction halfway.
  return holdingReports(() =>
    doc.transact(() => {
      const own = doc.clientID;
      doc.clientID = derived;
      try {
        return fn();
      } finally {
        doc.clientID = own;
      }
    }, origin)
  );
}
