// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Delivery of the codec's soft reports (`onPlainFallback`). A report is found in the middle of a
 * write, but a hook must never run there: a hook that writes to the document would write into
 * the write's transaction, and inside the deterministic lift transaction (`transactDeterministically`)
 * under the derived client id, where its content would differ between replicas under one struct
 * id; a hook that throws would abort the write halfway, after the codec had promised to change
 * nothing or everything. So a report waits until the write is over:
 *
 * - inside a `transactDeterministically` body: until that call has returned (the document's own
 *   id is back, the transaction cleaned up);
 * - inside any other transaction of `doc`: until that transaction's `afterTransaction` (Yjs runs
 *   it in the cleanup, after the transaction's body; a write from there is a transaction of its
 *   own);
 * - otherwise: at once.
 *
 * A hook that throws is ignored: a report must not break what it reports on.
 */
import type * as Y from 'yjs';

type Run = () => void;

let deterministicQueue: Run[] | null = null;
const docQueues = new WeakMap<Y.Doc, Run[]>();
const watchedDocs = new WeakSet<Y.Doc>();

function runSafely(run: Run): void {
  try {
    run();
  } catch {
    // Ignored on purpose: see the module comment.
  }
}

function flush(doc: Y.Doc): void {
  const queue = docQueues.get(doc);
  if (queue === undefined || queue.length === 0) return;
  docQueues.set(doc, []);
  for (const run of queue) runSafely(run);
}

/**
 * Run `run` once the write in progress is over (see the module comment). `doc` is the document
 * the write goes to, or `null` for a map outside any document.
 */
export function runAfterWrite(doc: Y.Doc | null, run: () => void): void {
  if (deterministicQueue !== null) {
    deterministicQueue.push(run);
    return;
  }
  if (doc !== null && !doc.isDestroyed && doc._transaction !== null) {
    let queue = docQueues.get(doc);
    if (queue === undefined) {
      queue = [];
      docQueues.set(doc, queue);
    }
    queue.push(run);
    if (!watchedDocs.has(doc)) {
      watchedDocs.add(doc);
      doc.on('afterTransaction', () => flush(doc));
    }
    return;
  }
  runSafely(run);
}

/** Runs `fn` with every report it produces held back until it has returned. */
export function holdingReports<T>(fn: () => T): T {
  const outer = deterministicQueue;
  const held: Run[] = [];
  deterministicQueue = held;
  try {
    return fn();
  } finally {
    deterministicQueue = outer;
    if (outer !== null) outer.push(...held);
    else for (const run of held) runSafely(run);
  }
}
